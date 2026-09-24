"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Sparkles,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { AnimatedCounter } from "@/components/motion/animated-counter";
import { AnimatedSuccess } from "@/components/motion/animated-feedback";
import { notify } from "@/components/motion/animated-toast";
import { AnimatedWizard } from "@/components/motion/animated-wizard";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import {
  analyzeImport,
  cancelImport,
  fetchImportRows,
  getImportSummary,
  resolveImportDuplicates,
  runImportChunk,
  uploadImportFile,
  type ImportSummary,
  type UploadedImport,
} from "@/features/migration/actions";
import { IMPORT_FIELDS, IMPORT_KINDS, missingRequired, RESOLUTIONS, ROW_STATUS, type ImportKind, type Resolution } from "@/features/migration/fields";
import type { BatchStats, ImportRow } from "@/features/migration/queries";
import { STUDENT_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils/cn";

const STEPS = [
  { key: "file", label: "Fichier" },
  { key: "analysis", label: "Analyse" },
  { key: "mapping", label: "Correspondance" },
  { key: "preview", label: "Aperçu" },
  { key: "duplicates", label: "Doublons" },
  { key: "missing", label: "Données manquantes" },
  { key: "validation", label: "Validation" },
  { key: "import", label: "Importation" },
  { key: "report", label: "Rapport" },
] as const;

type Options = { default_status: string; create_years: boolean; archive: boolean };
export type WizardResume = {
  upload: UploadedImport;
  status: "draft" | "analyzed" | "importing" | "completed";
  options: Options;
  stats: BatchStats;
};

const DEFAULT_OPTIONS: Options = { default_status: "alumni", create_years: true, archive: false };

function StepCard({ direction, title, description, children, actions }: { direction: 1 | -1; title: string; description?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <Card className={cn("grid gap-5 p-5 sm:p-6", direction === 1 ? "wizard-step-next" : "wizard-step-prev")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 className="text-lg font-semibold">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </Card>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "success" | "warning" | "danger" | "info" | "primary" }) {
  const tones = { neutral: "text-foreground", success: "text-success", warning: "text-warning", danger: "text-danger", info: "text-info", primary: "text-primary" };
  return (
    <div className="grid gap-0.5 rounded-xl border border-border bg-surface p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <strong className={cn("font-display text-xl tabular-nums", tones[tone])}>
        <AnimatedCounter value={value} />
      </strong>
    </div>
  );
}

function rowName(r: ImportRow) {
  const n = r.normalized as Record<string, string | undefined>;
  return [n.last_name, n.first_name].filter(Boolean).join(" ") || n.student_ref || n.legacy_matricule || "—";
}

/**
 * Assistant de migration des données historiques : fichier → analyse →
 * correspondance → aperçu → doublons → données manquantes → validation →
 * importation (par tranches, progression réelle) → rapport.
 */
export function ImportWizard({ resume, studentLabel }: { resume: WizardResume | null; studentLabel: string }) {
  const router = useRouter();
  const initialStep = !resume ? 0 : resume.status === "draft" ? 1 : resume.status === "analyzed" ? 3 : resume.status === "importing" ? 7 : 8;
  const [step, setStep] = useState(initialStep);
  const [reached, setReached] = useState(initialStep);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [kind, setKind] = useState<ImportKind>(resume?.upload.kind ?? "students");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [upload, setUpload] = useState<UploadedImport | null>(resume?.upload ?? null);
  const [mapping, setMapping] = useState<Record<string, string>>(resume?.upload.mapping ?? {});
  const [options, setOptions] = useState<Options>(resume?.options ?? DEFAULT_OPTIONS);
  const [stats, setStats] = useState<BatchStats>(resume?.stats ?? {});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<{ rows: ImportRow[]; total: number; page: number }>({ rows: [], total: 0, page: 1 });
  const [rowsLoading, setRowsLoading] = useState(false);
  const [problemFilter, setProblemFilter] = useState<"all" | "error" | "warning">("all");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [progress, setProgress] = useState<{ remaining: number; total: number; stats: BatchStats; running: boolean; failed: string | null }>({
    remaining: resume?.status === "completed" ? 0 : resume?.upload.rowCount ?? 0,
    total: resume?.upload.rowCount ?? 0,
    stats: resume?.stats ?? {},
    running: false,
    failed: null,
  });
  const running = useRef(false);

  const batchId = upload?.batchId ?? null;
  const fields = IMPORT_FIELDS[upload?.kind ?? kind];
  const missing = upload ? missingRequired(upload.kind, mapping) : null;
  const matched = upload ? upload.headers.filter((h) => Object.values(mapping).includes(h)).length : 0;

  const go = useCallback(
    (target: number) => {
      setError(null);
      setDirection(target >= step ? 1 : -1);
      setStep(target);
      setReached((r) => Math.max(r, target));
      window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    },
    [step],
  );

  // Lignes de l'étape courante (aperçu, doublons, problèmes)
  const view = step === 3 ? "preview" : step === 4 ? "duplicates" : step === 5 ? "problems" : null;
  const loadRows = useCallback(
    async (page: number) => {
      if (!batchId || !view) return;
      setRowsLoading(true);
      const result = await fetchImportRows(batchId, view, page);
      setRows({ ...result, page });
      setRowsLoading(false);
    },
    [batchId, view],
  );
  useEffect(() => {
    // Chargement asynchrone des lignes de l'étape (données serveur).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRows(1);
  }, [loadRows]);

  useEffect(() => {
    if (step !== 6 || !batchId) return;
    let cancelled = false;
    void getImportSummary(batchId).then((r) => {
      if (!cancelled && r.ok && r.data) setSummary(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [step, batchId, stats]);

  // Avertit avant de quitter pendant l'import (il reprendrait où il s'est arrêté).
  useEffect(() => {
    if (!progress.running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [progress.running]);

  const doUpload = () => {
    if (!file) return setError("Choisissez un fichier Excel (.xlsx) ou CSV.");
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("file", file);
    startTransition(async () => {
      const result = await uploadImportFile(null, fd);
      if (!result.ok || !result.data) {
        setError(result.ok ? "Lecture impossible." : result.message);
        return;
      }
      setUpload(result.data);
      setMapping(result.data.mapping);
      setOptions(DEFAULT_OPTIONS);
      setProgress((p) => ({ ...p, remaining: result.data!.rowCount, total: result.data!.rowCount }));
      router.replace(`/donnees-historiques/importer?lot=${result.data.batchId}`, { scroll: false });
      notify.success(`${result.data.rowCount} ligne(s) lue(s) dans « ${result.data.fileName} ».`);
      go(1);
    });
  };

  const doAnalyze = () => {
    if (!batchId) return;
    if (missing) return setError(missing);
    startTransition(async () => {
      const result = await analyzeImport(batchId, mapping, options);
      if (!result.ok || !result.data) {
        setError(result.ok ? "Analyse impossible." : result.message);
        return;
      }
      setStats(result.data);
      go(3);
    });
  };

  const resolve = (rowIds: string[], resolution: Resolution) => {
    if (!batchId) return;
    startTransition(async () => {
      const result = await resolveImportDuplicates(batchId, rowIds, resolution);
      if (!result.ok) return setError(result.message);
      setStats((s) => ({ ...s, pending_decisions: result.data?.pending ?? 0 }));
      await loadRows(rows.page);
    });
  };

  const runImport = useCallback(async () => {
    if (!batchId || running.current) return;
    running.current = true;
    setProgress((p) => ({ ...p, running: true, failed: null }));
    let done = false;
    let last: BatchStats = {};
    while (!done) {
      const result = await runImportChunk(batchId);
      if (!result.ok || !result.data) {
        setProgress((p) => ({ ...p, running: false, failed: result.ok ? "Interruption." : result.message }));
        running.current = false;
        return;
      }
      const data = result.data;
      done = data.done;
      last = data.stats;
      setProgress((p) => ({ ...p, remaining: data.remaining, stats: data.stats }));
    }
    running.current = false;
    setProgress((p) => ({ ...p, running: false }));
    setStats((s) => ({ ...s, ...last }));
    notify.success("Import terminé.");
    setTimeout(() => go(8), 900);
  }, [batchId, go]);

  // Reprise automatique d'un import interrompu (rechargement de page).
  useEffect(() => {
    if (step === 7 && resume?.status === "importing" && !running.current && !progress.failed && !progress.running) void runImport();
  }, [step, resume?.status, runImport, progress.failed, progress.running]);

  const doCancel = () => {
    if (!batchId) return;
    startTransition(async () => {
      const result = await cancelImport(batchId);
      if (!result.ok) return setError(result.message);
      notify.info("Import annulé : aucune donnée importée.");
      router.push("/donnees-historiques");
    });
  };

  // Doublons : un bloc par élève du fichier (les lignes d'un même élève partagent la décision).
  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, ImportRow[]>();
    for (const r of rows.rows) {
      if (!r.duplicate) continue;
      const key = r.group_key ?? r.id;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    return [...groups.values()];
  }, [rows.rows]);

  const imported = progress.total - progress.remaining;
  const percent = progress.total ? Math.round((imported / progress.total) * 100) : 0;
  const pendingDecisions = Number(stats.pending_decisions ?? 0);
  const S = stats;

  const nav = (prev: number | null, next: React.ReactNode) => (
    <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-2">
        {prev !== null ? (
          <Button type="button" variant="secondary" onClick={() => go(prev)} disabled={pending}>
            <ArrowLeft aria-hidden /> Précédent
          </Button>
        ) : null}
        {batchId && step >= 1 && step <= 6 ? (
          <Button type="button" variant="ghost" onClick={doCancel} disabled={pending}>
            <X aria-hidden /> Annuler l&apos;import
          </Button>
        ) : null}
      </div>
      {next}
    </div>
  );

  return (
    <div className="grid gap-5">
      <Card className="p-4 sm:p-5">
        <AnimatedWizard steps={STEPS.map((s) => ({ key: s.key, label: s.label }))} current={step} reached={reached} onSelect={step >= 7 ? undefined : (i) => (i <= 2 || stats.rows ? go(i) : undefined)} />
      </Card>

      {error ? (
        <Alert tone="danger" key={error}>
          <span className="anim-shake inline-block">{error}</span>
        </Alert>
      ) : null}

      {/* 1. Fichier */}
      {step === 0 ? (
        <StepCard direction={direction} title="Téléchargement du fichier" description="Excel (.xlsx) ou CSV, 5 Mo et 10 000 lignes au plus. La première ligne non vide contient les en-têtes.">
          <fieldset className="grid gap-3 md:grid-cols-3">
            <legend className="sr-only">Type de données</legend>
            {(Object.entries(IMPORT_KINDS) as [ImportKind, (typeof IMPORT_KINDS)[ImportKind]][]).map(([value, k]) => (
              <label
                key={value}
                className={cn(
                  "press flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all duration-200",
                  kind === value ? "border-primary bg-primary-soft/60 shadow-[0_0_0_1px_var(--primary)]" : "border-border hover:-translate-y-0.5 hover:border-primary/50",
                )}
              >
                <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="mt-1 accent-[var(--primary)]" />
                <span className="grid gap-1">
                  <span className="text-sm font-semibold">{value === "students" ? `Anciens ${studentLabel.toLowerCase()}s et parcours` : k.label}</span>
                  <span className="text-xs text-muted-foreground">{k.description}</span>
                  <a href={`/api/migration/modele/${value}`} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                    <Download className="size-3.5" aria-hidden /> Modèle CSV
                  </a>
                </span>
              </label>
            ))}
          </fieldset>
          {kind !== "students" ? (
            <Alert tone="info">Les notes et paiements sont rattachés aux {studentLabel.toLowerCase()}s déjà présents : importez d&apos;abord les anciens {studentLabel.toLowerCase()}s.</Alert>
          ) : null}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) setFile(f);
            }}
            className={cn(
              "grid cursor-pointer justify-items-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200",
              dragging ? "scale-[1.01] border-primary bg-primary-soft/60" : file ? "border-success/60 bg-success-soft/40" : "border-input hover:border-primary/60 hover:bg-surface-muted/50",
            )}
          >
            <span className={cn("flex size-14 items-center justify-center rounded-2xl transition-colors", file ? "bg-success-soft text-success" : "bg-primary-soft text-primary")}>
              {file ? <FileSpreadsheet className="anim-pop size-7" aria-hidden /> : <Upload className="size-7" aria-hidden />}
            </span>
            {file ? (
              <span className="grid gap-0.5">
                <span className="font-semibold">{file.name}</span>
                <span className="text-xs text-muted-foreground">{(file.size / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} Ko · cliquez pour changer</span>
              </span>
            ) : (
              <span className="grid gap-0.5">
                <span className="font-semibold">Glissez-déposez le fichier ici</span>
                <span className="text-sm text-muted-foreground">ou cliquez pour le choisir</span>
              </span>
            )}
            <input
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              aria-label="Fichier à importer"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {pending ? (
            <div className="grid gap-2" role="status">
              <span className="flex items-center gap-2 text-sm font-medium text-primary">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Lecture du fichier et mise en attente des lignes…
              </span>
              <div className="shimmer h-2 rounded-full" />
            </div>
          ) : null}
          {nav(
            null,
            <Button type="button" onClick={doUpload} disabled={!file || pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />} Analyser le fichier
            </Button>,
          )}
        </StepCard>
      ) : null}

      {/* 2. Analyse automatique des colonnes */}
      {step === 1 && upload ? (
        <StepCard
          direction={direction}
          title="Analyse automatique des colonnes"
          description={`« ${upload.fileName} »${upload.sheet ? ` · feuille « ${upload.sheet} »` : ""} · ${upload.rowCount} ligne(s) · ${upload.headers.length} colonne(s)`}
          actions={
            <Badge tone={matched ? "success" : "warning"}>
              <Sparkles className="size-3.5" aria-hidden /> {matched} / {upload.headers.length} reconnue(s)
            </Badge>
          }
        >
          <ul className="stagger grid gap-2 md:grid-cols-2">
            {upload.profile.map((col) => {
              const field = fields.find((f) => mapping[f.key] === col.header);
              return (
                <li key={col.header} className="grid gap-2 rounded-xl border border-border p-3 text-sm transition-colors hover:bg-surface-muted/50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{col.header}</span>
                    <Badge tone={col.type === "date" ? "info" : col.type === "nombre" ? "primary" : "neutral"}>{col.type}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                      <div className="h-full origin-left animate-[bar-grow-x_0.6s_var(--ease-out)_both] rounded-full bg-primary" style={{ width: `${col.filled}%` }} />
                    </div>
                    <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{col.filled} %</span>
                  </div>
                  <span className="truncate text-xs text-muted-foreground">Ex. : {col.examples.join(" · ") || "—"}</span>
                  <span className={cn("flex items-center gap-1.5 text-xs font-medium", field ? "text-success" : "text-muted-foreground")}>
                    {field ? <CheckCircle2 className="size-3.5" aria-hidden /> : <span className="size-3.5 rounded-full border border-input" aria-hidden />}
                    {field ? `→ ${field.label}` : "Non reconnue (vous pourrez l'associer)"}
                  </span>
                </li>
              );
            })}
          </ul>
          {nav(
            0,
            <Button type="button" onClick={() => go(2)}>
              Vérifier la correspondance <ArrowRight aria-hidden />
            </Button>,
          )}
        </StepCard>
      ) : null}

      {/* 3. Correspondance */}
      {step === 2 && upload ? (
        <StepCard direction={direction} title="Correspondance avec les champs NéoScol" description="Chaque champ NéoScol reçoit une colonne de votre fichier (ou n'est pas importé). Les champs * sont obligatoires.">
          {[...new Set(fields.map((f) => f.group))].map((group) => (
            <fieldset key={group} className="grid gap-2">
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</legend>
              <div className="grid gap-2 md:grid-cols-2">
                {fields
                  .filter((f) => f.group === group)
                  .map((f) => {
                    const selected = mapping[f.key] ?? "";
                    const example = selected ? upload.profile.find((p) => p.header === selected)?.examples[0] : null;
                    return (
                      <div key={f.key} className={cn("grid gap-1 rounded-xl border p-3 transition-colors", selected ? "border-success/40 bg-success-soft/30" : f.required ? "border-warning/50" : "border-border")}>
                        <label htmlFor={`map-${f.key}`} className="flex items-center justify-between gap-2 text-sm font-medium">
                          <span>
                            {f.label}
                            {f.required ? " *" : ""}
                          </span>
                          {selected ? <Check className="anim-pop size-4 text-success" aria-hidden /> : null}
                        </label>
                        <Select
                          id={`map-${f.key}`}
                          value={selected}
                          onChange={(e) => setMapping((m) => {
                            const next = { ...m };
                            if (e.target.value) next[f.key] = e.target.value;
                            else delete next[f.key];
                            return next;
                          })}
                        >
                          <option value="">— Ne pas importer —</option>
                          {upload.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </Select>
                        <span className="truncate text-xs text-muted-foreground">{example ? `Ex. : ${example}` : (f.hint ?? " ")}</span>
                      </div>
                    );
                  })}
              </div>
            </fieldset>
          ))}
          {upload.kind === "students" ? (
            <fieldset className="grid gap-3 rounded-xl border border-border p-4">
              <legend className="px-1 text-sm font-semibold">Options</legend>
              <label className="grid gap-1 text-sm sm:max-w-sm">
                <span className="font-medium">Statut si la colonne « Statut » est vide</span>
                <Select value={options.default_status} onChange={(e) => setOptions((o) => ({ ...o, default_status: e.target.value }))}>
                  {["alumni", "graduated", "transferred", "withdrawn", "inactive", "active"].map((s) => (
                    <option key={s} value={s}>
                      {STUDENT_STATUS[s]?.label ?? s}
                    </option>
                  ))}
                </Select>
              </label>
              <Checkbox label="Créer automatiquement les années scolaires anciennes manquantes (clôturées)" checked={options.create_years} onChange={(e) => setOptions((o) => ({ ...o, create_years: e.target.checked }))} />
              <Checkbox label="Archiver tous les dossiers créés par cet import" checked={options.archive} onChange={(e) => setOptions((o) => ({ ...o, archive: e.target.checked }))} />
            </fieldset>
          ) : (
            <Checkbox label="Créer automatiquement les années scolaires anciennes manquantes (clôturées)" checked={options.create_years} onChange={(e) => setOptions((o) => ({ ...o, create_years: e.target.checked }))} />
          )}
          {missing ? <p className="text-sm font-medium text-warning">{missing}</p> : null}
          {pending ? (
            <div className="grid gap-2" role="status">
              <span className="flex items-center gap-2 text-sm font-medium text-primary">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Contrôle des {upload.rowCount} lignes et recherche des doublons…
              </span>
              <div className="shimmer h-2 rounded-full" />
            </div>
          ) : null}
          {nav(
            1,
            <Button type="button" onClick={doAnalyze} disabled={pending || Boolean(missing)}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />} Analyser les données
            </Button>,
          )}
        </StepCard>
      ) : null}

      {/* 4. Aperçu */}
      {step === 3 && upload ? (
        <StepCard direction={direction} title="Aperçu des données" description="Valeurs telles qu'elles seront enregistrées (dates, sexes, statuts et années normalisés).">
          <div className="stagger grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Lignes" value={S.rows ?? 0} />
            <Stat label="Valides" value={S.valid ?? 0} tone="success" />
            <Stat label="À vérifier" value={S.warnings ?? 0} tone="warning" />
            <Stat label="Invalides" value={S.invalid ?? 0} tone="danger" />
            <Stat label="Doublons" value={S.duplicates ?? 0} tone="info" />
            {upload.kind === "students" ? <Stat label={`${studentLabel}s distincts`} value={S.students ?? 0} tone="primary" /> : null}
          </div>
          <RowsTable rows={rows.rows} loading={rowsLoading} kind={upload.kind} />
          <Pager rows={rows} onPage={loadRows} />
          {nav(
            2,
            <Button type="button" onClick={() => go(4)}>
              Doublons <ArrowRight aria-hidden />
            </Button>,
          )}
        </StepCard>
      ) : null}

      {/* 5. Doublons */}
      {step === 4 && upload ? (
        <StepCard
          direction={direction}
          title="Détection des doublons"
          description={
            upload.kind === "students"
              ? "Comparaison avec les dossiers existants : matricule, nom, prénom, date de naissance. Choisissez l'action pour chaque élève."
              : "Chaque ligne est rattachée à un élève existant (matricule, ou nom + prénom + naissance)."
          }
          actions={
            upload.kind === "students" && duplicateGroups.length ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => resolve(duplicateGroups.map((g) => g[0]!.id), "existing")}>
                  Tout rattacher à l&apos;existant
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => resolve(duplicateGroups.map((g) => g[0]!.id), "create")}>
                  Tout créer
                </Button>
              </div>
            ) : null
          }
        >
          {upload.kind !== "students" ? (
            <Alert tone="info">Pas de création d&apos;élève pour ce type d&apos;import : les lignes sans élève correspondant sont signalées à l&apos;étape suivante.</Alert>
          ) : rowsLoading && rows.rows.length === 0 ? (
            <div className="shimmer h-40 rounded-xl" />
          ) : duplicateGroups.length === 0 ? (
            <div className="grid justify-items-center gap-2 py-6 text-center">
              <AnimatedSuccess className="size-14" label="Aucun doublon" />
              <p className="font-semibold">Aucun doublon avec les dossiers existants.</p>
            </div>
          ) : (
            <ul className="stagger grid gap-3">
              {duplicateGroups.map((group) => {
                const first = group[0]!;
                const n = first.normalized as Record<string, string | undefined>;
                const d = first.duplicate!;
                const certain = (first.duplicate_score ?? 0) >= 80;
                return (
                  <li key={first.id} className={cn("grid gap-3 rounded-2xl border p-4 transition-colors", first.resolution === "pending" ? "border-warning/60 bg-warning-soft/30" : "border-border")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge tone={certain ? "danger" : "warning"}>
                        {certain ? "Doublon certain" : "Doublon probable"} · {first.duplicate_score}/100
                      </Badge>
                      <span className="flex flex-wrap gap-1">
                        {(first.duplicate_reasons ?? []).map((r) => (
                          <Badge key={r} tone="neutral">
                            {r}
                          </Badge>
                        ))}
                      </span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="grid gap-0.5 rounded-xl bg-surface-muted/60 p-3 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dans le fichier (ligne{group.length > 1 ? "s" : ""} {group.map((g) => g.row_number).join(", ")})</span>
                        <span className="font-semibold">{rowName(first)}</span>
                        <span className="text-xs text-muted-foreground">
                          {[n.legacy_matricule ? `ancien matricule ${n.legacy_matricule}` : null, n.birth_date ? `né(e) le ${new Date(`${n.birth_date}T12:00:00`).toLocaleDateString("fr-FR")}` : "naissance inconnue"].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                      <div className="grid gap-0.5 rounded-xl border border-border p-3 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Déjà dans NéoScol</span>
                        <a href={`/eleves/${d.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                          {d.last_name} {d.first_name} <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                        <span className="text-xs text-muted-foreground">
                          {[d.matricule, d.legacy_matricule ? `ancien ${d.legacy_matricule}` : null, d.birth_date ? `né(e) le ${new Date(`${d.birth_date}T12:00:00`).toLocaleDateString("fr-FR")}` : null, d.archived_at ? "archivé" : STUDENT_STATUS[d.status]?.label]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Action pour ${rowName(first)}`}>
                      {(Object.entries(RESOLUTIONS) as [Resolution, (typeof RESOLUTIONS)[Resolution]][]).map(([key, r]) => (
                        <button
                          key={key}
                          type="button"
                          title={r.description}
                          disabled={pending}
                          aria-pressed={first.resolution === key}
                          onClick={() => resolve([first.id], key)}
                          className={cn(
                            "press rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 disabled:opacity-60",
                            first.resolution === key ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border hover:border-primary/60 hover:bg-primary-soft/50",
                          )}
                        >
                          {first.resolution === key ? <Check className="mr-1 inline size-3.5" aria-hidden /> : null}
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <Pager rows={rows} onPage={loadRows} />
          {pendingDecisions > 0 ? (
            <p className="flex items-center gap-2 text-sm font-medium text-warning">
              <AlertTriangle className="size-4" aria-hidden /> {pendingDecisions} ligne(s) attendent votre décision.
            </p>
          ) : null}
          {nav(
            3,
            <Button type="button" onClick={() => go(5)} disabled={pendingDecisions > 0 || pending}>
              Données manquantes <ArrowRight aria-hidden />
            </Button>,
          )}
        </StepCard>
      ) : null}

      {/* 6. Données manquantes et erreurs */}
      {step === 5 && upload && batchId ? (
        <StepCard
          direction={direction}
          title="Données manquantes et erreurs"
          description="Les lignes invalides seront rejetées (non importées) ; les avertissements sont importés, valeurs douteuses ignorées."
          actions={
            <a href={`/api/migration/${batchId}/rejets?tout=1`} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-semibold transition-colors hover:border-primary hover:text-primary">
              <Download className="size-4" aria-hidden /> Télécharger (CSV)
            </a>
          }
        >
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer">
            {(
              [
                ["all", `Tout (${(S.invalid ?? 0) + (S.warnings ?? 0)})`],
                ["error", `Erreurs (${S.invalid ?? 0})`],
                ["warning", `Avertissements (${S.warnings ?? 0})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={problemFilter === key}
                onClick={() => setProblemFilter(key)}
                className={cn("press rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors", problemFilter === key ? "border-primary bg-primary-soft text-primary" : "border-border hover:bg-surface-muted")}
              >
                {label}
              </button>
            ))}
          </div>
          {rowsLoading && rows.rows.length === 0 ? (
            <div className="shimmer h-40 rounded-xl" />
          ) : rows.rows.length === 0 ? (
            <div className="grid justify-items-center gap-2 py-6 text-center">
              <AnimatedSuccess className="size-14" label="Données complètes" />
              <p className="font-semibold">Aucune donnée manquante ni erreur.</p>
            </div>
          ) : (
            <ul className="stagger grid gap-2">
              {rows.rows
                .filter((r) => problemFilter === "all" || r.issues.some((i) => i.level === problemFilter))
                .map((r) => (
                  <li key={r.id} className="grid gap-1.5 rounded-xl border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">
                        Ligne {r.row_number} · {rowName(r)}
                      </span>
                      <StatusBadge value={r.resolution === "skip" ? "skipped" : r.status === "duplicate" ? "warning" : r.status} map={ROW_STATUS} />
                    </div>
                    <ul className="grid gap-1">
                      {r.issues.map((i, k) => (
                        <li key={k} className={cn("flex items-start gap-2 text-xs", i.level === "error" ? "text-danger" : "text-warning")}>
                          {i.level === "error" ? <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
                          {i.message}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
            </ul>
          )}
          <Pager rows={rows} onPage={loadRows} />
          {nav(
            4,
            <Button type="button" onClick={() => go(6)}>
              Validation <ArrowRight aria-hidden />
            </Button>,
          )}
        </StepCard>
      ) : null}

      {/* 7. Validation */}
      {step === 6 && upload ? (
        <StepCard direction={direction} title="Validation" description="Vérifiez le bilan : rien n'est encore enregistré dans les dossiers.">
          {!summary ? (
            <div className="shimmer h-32 rounded-xl" />
          ) : (
            <>
              <div className="stagger grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                <Stat label="Lignes à importer" value={summary.toImport} tone="primary" />
                {upload.kind === "students" ? (
                  <>
                    <Stat label={`Nouveaux dossiers`} value={summary.newStudents} tone="success" />
                    <Stat label="Rattachés à l'existant" value={summary.linked} tone="info" />
                    <Stat label="Fusionnés" value={summary.merged} tone="info" />
                  </>
                ) : null}
                <Stat label="Ignorées" value={summary.skipped} />
                <Stat label="Rejetées (invalides)" value={summary.rejected} tone="danger" />
                <Stat label="Avec avertissement" value={summary.warnings} tone="warning" />
              </div>
              {summary.years.length ? (
                <Alert tone="info">
                  {options.create_years ? "Années scolaires créées (clôturées)" : "Années inconnues (non créées, parcours conservé)"} : {summary.years.join(", ")}.
                </Alert>
              ) : null}
              {summary.pending > 0 ? <Alert tone="warning">{summary.pending} doublon(s) sans décision : revenez à l&apos;étape « Doublons ».</Alert> : null}
            </>
          )}
          {nav(
            5,
            <Button type="button" onClick={() => go(7)} disabled={!summary || summary.pending > 0 || summary.toImport === 0}>
              <Check aria-hidden /> Lancer l&apos;importation
            </Button>,
          )}
        </StepCard>
      ) : null}

      {/* 8. Importation */}
      {step === 7 && upload ? (
        <StepCard direction={direction} title="Importation" description="Traitement par tranches de 250 lignes. En cas d'interruption, l'import reprend où il s'est arrêté.">
          <ImportProgress
            percent={percent}
            imported={imported}
            total={progress.total}
            stats={progress.stats}
            running={progress.running}
            failed={progress.failed}
            onStart={() => void runImport()}
            started={progress.running || imported > 0 || resume?.status === "importing"}
            kind={upload.kind}
          />
        </StepCard>
      ) : null}

      {/* 9. Rapport */}
      {step === 8 && upload && batchId ? <FinalReport batchId={batchId} stats={{ ...stats, ...progress.stats }} kind={upload.kind} studentLabel={studentLabel} fileName={upload.fileName} /> : null}
    </div>
  );
}

function RowsTable({ rows, loading, kind }: { rows: ImportRow[]; loading: boolean; kind: ImportKind }) {
  if (loading && rows.length === 0) return <div className="shimmer h-48 rounded-xl" />;
  const cols: [string, (n: Record<string, unknown>) => string][] =
    kind === "students"
      ? [
          ["Naissance", (n) => (n.birth_date ? new Date(`${n.birth_date}T12:00:00`).toLocaleDateString("fr-FR") : "—")],
          ["Année / classe", (n) => [n.year_label, n.class_name].filter(Boolean).join(" · ") || "—"],
          ["Statut", (n) => (n.status === "archived" ? "Archivé" : STUDENT_STATUS[String(n.status)]?.label ?? "—")],
        ]
      : kind === "grades"
        ? [
            ["Année", (n) => String(n.year_label ?? "—")],
            ["Matière", (n) => [n.subject, n.period_label].filter(Boolean).join(" · ") || "—"],
            ["Note", (n) => (n.score !== undefined ? `${n.score} / ${n.max_score ?? 20}` : "—")],
          ]
        : [
            ["Libellé", (n) => String(n.label ?? "—")],
            ["Date", (n) => (n.paid_on ? new Date(`${n.paid_on}T12:00:00`).toLocaleDateString("fr-FR") : "—")],
            ["Montant", (n) => (n.amount !== undefined ? Number(n.amount).toLocaleString("fr-FR") : "—")],
          ];
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="table-anim w-full text-sm">
        <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5 font-semibold">Ligne</th>
            <th className="px-3 py-2.5 font-semibold">Élève</th>
            {cols.map(([label]) => (
              <th key={label} className="px-3 py-2.5 font-semibold">
                {label}
              </th>
            ))}
            <th className="px-3 py-2.5 font-semibold">État</th>
          </tr>
        </thead>
        <tbody className={cn(loading && "opacity-60 transition-opacity")}>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.row_number}</td>
              <td className="px-3 py-2 font-medium">{rowName(r)}</td>
              {cols.map(([label, fn]) => (
                <td key={label} className="px-3 py-2">
                  {fn(r.normalized)}
                </td>
              ))}
              <td className="px-3 py-2">
                <StatusBadge value={r.status} map={ROW_STATUS} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pager({ rows, onPage }: { rows: { total: number; page: number }; onPage: (page: number) => void }) {
  const pages = Math.ceil(rows.total / 50);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 text-sm">
      <Button type="button" variant="ghost" size="sm" disabled={rows.page <= 1} onClick={() => onPage(rows.page - 1)}>
        <ArrowLeft aria-hidden />
      </Button>
      <span className="tabular-nums text-muted-foreground">
        Page {rows.page} / {pages}
      </span>
      <Button type="button" variant="ghost" size="sm" disabled={rows.page >= pages} onClick={() => onPage(rows.page + 1)}>
        <ArrowRight aria-hidden />
      </Button>
    </div>
  );
}

function ImportProgress({
  percent,
  imported,
  total,
  stats,
  running,
  failed,
  onStart,
  started,
  kind,
}: {
  percent: number;
  imported: number;
  total: number;
  stats: BatchStats;
  running: boolean;
  failed: string | null;
  onStart: () => void;
  started: boolean;
  kind: ImportKind;
}) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const counters: [string, number | undefined][] =
    kind === "students"
      ? [
          ["Dossiers créés", stats.created],
          ["Rattachés", stats.linked],
          ["Fusionnés", stats.merged],
          ["Années de parcours", stats.history],
          ["Diplômes", stats.diplomas],
          ["Années créées", stats.years_created],
          ["Ignorées", stats.skipped],
          ["Erreurs", stats.errors],
        ]
      : [
          [kind === "grades" ? "Notes importées" : "Paiements importés", kind === "grades" ? stats.grades : stats.payments],
          ["Années créées", stats.years_created],
          ["Ignorées", stats.skipped],
          ["Erreurs", stats.errors],
        ];
  return (
    <div className="grid gap-6">
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <div className="relative size-40 shrink-0">
          <svg viewBox="0 0 136 136" className="size-40 -rotate-90" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Progression de l'import">
            <circle cx="68" cy="68" r={radius} fill="none" className="stroke-surface-muted" strokeWidth="12" />
            <circle
              cx="68"
              cy="68"
              r={radius}
              fill="none"
              className={cn("transition-[stroke-dashoffset] duration-500 ease-out", failed ? "stroke-danger" : percent === 100 ? "stroke-success" : "stroke-primary")}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - percent / 100)}
            />
          </svg>
          <span className="absolute inset-0 grid place-items-center text-center">
            {percent === 100 && !running ? (
              <AnimatedSuccess className="size-16" label="Import terminé" />
            ) : (
              <span className="grid">
                <span className="font-display text-3xl font-semibold tabular-nums">{percent} %</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {imported} / {total}
                </span>
              </span>
            )}
          </span>
        </div>
        <div className="grid flex-1 gap-3">
          <p className="flex items-center gap-2 text-sm font-medium" aria-live="polite">
            {failed ? (
              <>
                <XCircle className="size-4 text-danger" aria-hidden /> {failed}
              </>
            ) : running ? (
              <>
                <Loader2 className="size-4 animate-spin text-primary" aria-hidden /> Import en cours… ne fermez pas cette page.
              </>
            ) : percent === 100 ? (
              <>
                <CheckCircle2 className="size-4 text-success" aria-hidden /> Import terminé.
              </>
            ) : (
              "Prêt : l'import va enregistrer les données dans les dossiers."
            )}
          </p>
          <div className="stagger grid grid-cols-2 gap-2 sm:grid-cols-4">
            {counters.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border p-2.5">
                <span className="block text-xs text-muted-foreground">{label}</span>
                <strong key={value ?? 0} className="anim-pop block font-display text-lg tabular-nums">
                  {value ?? 0}
                </strong>
              </div>
            ))}
          </div>
          {!running && percent < 100 ? (
            <Button type="button" onClick={onStart} className="justify-self-start">
              {failed || started ? <RotateCcw aria-hidden /> : <Upload aria-hidden />} {failed || started ? "Reprendre l'import" : "Démarrer l'import"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FinalReport({ batchId, stats, kind, studentLabel, fileName }: { batchId: string; stats: BatchStats; kind: ImportKind; studentLabel: string; fileName: string }) {
  const rejected = stats.rejected ?? 0;
  return (
    <Card className="wizard-step-next grid gap-6 p-5 sm:p-6">
      <div className="grid justify-items-center gap-3 text-center">
        <AnimatedSuccess className="size-20" label="Import terminé" />
        <h2 className="text-xl font-semibold">Migration terminée</h2>
        <p className="max-w-xl text-sm text-muted-foreground">
          « {fileName} » : {stats.imported ?? 0} ligne(s) importée(s) sur {stats.rows ?? 0}
          {rejected ? `, ${rejected} rejetée(s)` : ""}. Tout est tracé dans l&apos;historique des migrations et le journal d&apos;audit.
        </p>
      </div>
      <div className="stagger grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Lignes importées" value={stats.imported ?? 0} tone="success" />
        {kind === "students" ? (
          <>
            <Stat label="Dossiers créés" value={stats.created ?? 0} tone="primary" />
            <Stat label="Rattachés / fusionnés" value={(stats.linked ?? 0) + (stats.merged ?? 0)} tone="info" />
            <Stat label="Années de parcours" value={stats.history ?? 0} />
            <Stat label="Diplômes" value={stats.diplomas ?? 0} />
          </>
        ) : (
          <Stat label={kind === "grades" ? "Notes" : "Paiements"} value={(kind === "grades" ? stats.grades : stats.payments) ?? 0} tone="primary" />
        )}
        <Stat label="Années créées" value={stats.years_created ?? 0} />
        <Stat label="Doublons traités" value={stats.duplicates ?? 0} tone="info" />
        <Stat label="Ignorées" value={stats.skipped ?? 0} />
        <Stat label="Rejetées" value={rejected} tone={rejected ? "danger" : "neutral"} />
        <Stat label="Erreurs à l'import" value={stats.errors ?? 0} tone={stats.errors ? "danger" : "neutral"} />
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {kind === "students" ? (
          <Button asChild>
            <Link href="/eleves?vue=anciens">
              Voir les anciens {studentLabel.toLowerCase()}s <ArrowRight aria-hidden />
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="secondary">
          <Link href={`/donnees-historiques/imports/${batchId}`}>Rapport détaillé</Link>
        </Button>
        {rejected ? (
          <Button asChild variant="secondary">
            <a href={`/api/migration/${batchId}/rejets`}>
              <Download aria-hidden /> Données rejetées (CSV)
            </a>
          </Button>
        ) : null}
        <Button asChild variant="ghost">
          <Link href="/donnees-historiques/importer">Nouvel import</Link>
        </Button>
      </div>
    </Card>
  );
}
