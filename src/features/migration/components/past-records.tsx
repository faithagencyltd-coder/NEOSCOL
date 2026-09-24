import { Award, BookOpenCheck, FileText, History, Plus, Trash2, Wallet } from "lucide-react";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { DetailList } from "@/components/shared/detail-list";
import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { addHistoryLine, deleteHistoryLine } from "@/features/migration/actions";
import { DiplomaDialog } from "@/features/migration/components/diploma-dialog";
import { DIPLOMA_KINDS } from "@/features/migration/fields";
import type { getStudentPastRecords } from "@/features/migration/queries";
import { formatDate, formatMoney } from "@/lib/utils/format";
import type { Vocabulary } from "@/lib/vocabulary";

type Records = Awaited<ReturnType<typeof getStudentPastRecords>>;

const fmt = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: digits });

function DeleteButton({ id, table, label }: { id: string; table: string; label: string }) {
  return (
    <ConfirmAction
      trigger={
        <Button variant="ghost" size="sm" aria-label={`Supprimer ${label}`}>
          <Trash2 aria-hidden />
        </Button>
      }
      title={`Supprimer ${label} ?`}
      description="Suppression définitive (tracée dans le journal d'audit)."
      confirmLabel="Supprimer"
      tone="danger"
      action={deleteHistoryLine}
      fields={{ id, table }}
    />
  );
}

/** Onglet « Parcours antérieur » : données historiques d'un élève (importées ou saisies). */
export function PastRecordsTab({
  student,
  records,
  canManage,
  currency,
  v,
}: {
  student: {
    id: string;
    legacy_matricule: string | null;
    entry_year: number | null;
    exit_year: number | null;
    legacy_program: string | null;
    origin: string;
    status_reason: string | null;
    created_at: string;
  };
  records: Records;
  canManage: boolean;
  currency: string;
  v: Vocabulary;
}) {
  const gradesByYear = new Map<string, Records["grades"]>();
  for (const g of records.grades) gradesByYear.set(g.year_label, [...(gradesByYear.get(g.year_label) ?? []), g]);
  const paymentsTotal = records.payments.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Informations d&apos;origine</CardTitle>
          <CardDescription>
            {student.origin === "import"
              ? `Dossier créé par import des données historiques le ${formatDate(student.created_at, "fr-FR", { dateStyle: "long" })}.`
              : student.origin === "manual_history"
                ? `Ancien dossier saisi manuellement le ${formatDate(student.created_at, "fr-FR", { dateStyle: "long" })}.`
                : "Dossier créé dans NéoScol."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DetailList
            items={[
              { label: "Ancien matricule", value: student.legacy_matricule ?? "—" },
              { label: "Année d'entrée", value: student.entry_year ? String(student.entry_year) : "—" },
              { label: "Année de sortie", value: student.exit_year ? String(student.exit_year) : "—" },
              { label: "Formation / filière", value: student.legacy_program ?? "—" },
              { label: "Motif du statut", value: student.status_reason ?? "—" },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div className="grid gap-1">
            <CardTitle>Parcours scolaire</CardTitle>
            <CardDescription>{v.classes} fréquentées, résultats et absences par année</CardDescription>
          </div>
          {canManage ? (
            <QuickFormDialog
              title="Ajouter une année au parcours"
              trigger={
                <Button variant="secondary" size="sm">
                  <Plus aria-hidden /> Ajouter une année
                </Button>
              }
              action={addHistoryLine}
              hidden={{ student_id: student.id }}
              fields={[
                { name: "year_label", label: "Année scolaire", required: true, placeholder: "2017-2018" },
                { name: "class_name", label: v.klass, placeholder: "3e A" },
                { name: "level_name", label: "Niveau" },
                { name: "program_name", label: "Formation / filière" },
                { name: "average", label: "Moyenne annuelle (/20)", type: "number", min: 0, max: 100, step: "0.01" },
                { name: "rank", label: "Rang", type: "number", min: 1 },
                { name: "decision", label: "Décision", placeholder: "Admis, redouble…" },
                { name: "absences", label: "Absences (nombre)", type: "number", min: 0 },
                { name: "notes", label: "Observations", type: "textarea", wide: true },
              ]}
            />
          ) : null}
        </CardHeader>
        <CardContent>
          {records.history.length === 0 ? (
            <EmptyState icon={History} title="Aucune année enregistrée" description="Importez l'historique ou ajoutez les années fréquentées." />
          ) : (
            <ol className="relative grid gap-1 pl-7">
              <span aria-hidden className="timeline-line absolute bottom-3 left-[11px] top-3 w-0.5 rounded-full bg-border" />
              {records.history.map((h, index) => (
                <li
                  key={h.id}
                  className="anim-fade-up relative flex flex-col gap-1 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-surface-muted/60 sm:flex-row sm:items-center sm:justify-between"
                  style={{ "--delay": `${Math.min(index, 12) * 45}ms` } as React.CSSProperties}
                >
                  <span aria-hidden className="absolute -left-[22px] top-4 size-3 rounded-full bg-primary ring-4 ring-primary-soft" />
                  <div className="grid gap-0.5">
                    <span className="font-semibold">
                      {h.year_label}
                      {h.class_name ? ` · ${h.class_name}` : ""}
                      {h.level_name && h.level_name !== h.class_name ? <span className="font-normal text-muted-foreground"> ({h.level_name})</span> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {[h.program_name, h.decision, h.absences !== null ? `${h.absences} absence(s)${h.absences_justified ? ` dont ${h.absences_justified} justifiée(s)` : ""}` : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {h.average !== null ? (
                      <Badge tone={Number(h.average) >= 10 ? "success" : "danger"}>
                        {fmt(Number(h.average))} / 20{h.rank ? ` · ${h.rank}e` : ""}
                      </Badge>
                    ) : null}
                    <Badge>{h.source === "import" ? "Importé" : "Saisi"}</Badge>
                    {canManage ? <DeleteButton id={h.id} table="student_history" label={`l'année ${h.year_label}`} /> : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div className="grid gap-1">
            <CardTitle>Diplômes et certificats</CardTitle>
            <CardDescription>Diplômes obtenus, certificats et attestations délivrés</CardDescription>
          </div>
          {canManage ? <DiplomaDialog studentId={student.id} /> : null}
        </CardHeader>
        <CardContent>
          {records.diplomas.length === 0 ? (
            <EmptyState icon={Award} title="Aucun diplôme enregistré" />
          ) : (
            <ul className="stagger grid gap-2 sm:grid-cols-2">
              {records.diplomas.map((d) => (
                <li key={d.id} className="hover-lift flex items-start gap-3 rounded-xl border border-border p-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning">
                    <Award className="size-5" aria-hidden />
                  </span>
                  <div className="grid min-w-0 flex-1 gap-0.5 text-sm">
                    <span className="font-semibold">{d.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {[DIPLOMA_KINDS[d.kind as keyof typeof DIPLOMA_KINDS] ?? d.kind, d.year_label, d.mention ? `mention ${d.mention}` : null, d.number ? `n° ${d.number}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {d.file_id ? (
                      <a href={`/api/fichiers/${d.file_id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                        <FileText className="size-3.5" aria-hidden /> Voir le scan
                      </a>
                    ) : null}
                  </div>
                  {canManage ? <DeleteButton id={d.id} table="student_diplomas" label={`« ${d.title} »`} /> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Notes historiques</CardTitle>
          <CardDescription>Notes reprises de l&apos;ancien système (moyenne par année pondérée par les coefficients)</CardDescription>
        </CardHeader>
        {gradesByYear.size === 0 ? (
          <CardContent>
            <EmptyState icon={BookOpenCheck} title="Aucune note historique" description="Elles s'importent depuis « Données historiques › Importer › Notes historiques »." />
          </CardContent>
        ) : (
          [...gradesByYear.entries()].map(([year, grades]) => {
            const weight = grades.reduce((s, g) => s + Number(g.coefficient), 0);
            const avg = weight ? grades.reduce((s, g) => s + (Number(g.score) / Number(g.max_score)) * 20 * Number(g.coefficient), 0) / weight : null;
            return (
              <div key={year} className="border-t border-border">
                <div className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="font-semibold">{year}</span>
                  <Badge tone={avg !== null && avg >= 10 ? "success" : "danger"}>Moyenne {fmt(avg)} / 20</Badge>
                </div>
                <Table>
                  <THead>
                    <tr>
                      <TH>Matière</TH>
                      <TH>Période</TH>
                      <TH className="text-right">Note</TH>
                      <TH className="text-right">Coef.</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {grades.map((g) => (
                      <TR key={g.id}>
                        <TD className="font-medium">{g.subject}</TD>
                        <TD className="text-muted-foreground">{g.period_label ?? "—"}</TD>
                        <TD className="text-right tabular-nums">
                          {fmt(Number(g.score))} / {fmt(Number(g.max_score))}
                        </TD>
                        <TD className="text-right tabular-nums">{fmt(Number(g.coefficient))}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </div>
            );
          })
        )}
      </Card>

      {records.payments.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div className="grid gap-1">
              <CardTitle>Paiements historiques</CardTitle>
              <CardDescription>Versements enregistrés dans l&apos;ancien système (hors factures NéoScol)</CardDescription>
            </div>
            <Badge tone="primary">
              <Wallet className="size-3.5" aria-hidden /> Total {formatMoney(paymentsTotal, currency)}
            </Badge>
          </CardHeader>
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Libellé</TH>
                <TH>Année</TH>
                <TH>Mode / référence</TH>
                <TH className="text-right">Montant</TH>
              </tr>
            </THead>
            <tbody>
              {records.payments.map((p) => (
                <TR key={p.id}>
                  <TD className="text-muted-foreground">{p.paid_on ? formatDate(p.paid_on, "fr-FR", { dateStyle: "short" }) : "—"}</TD>
                  <TD className="font-medium">{p.label}</TD>
                  <TD>{p.year_label ?? "—"}</TD>
                  <TD className="text-muted-foreground">{[p.method, p.reference].filter(Boolean).join(" · ") || "—"}</TD>
                  <TD className="text-right font-semibold tabular-nums">{formatMoney(Number(p.amount), currency)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
