import { AlertTriangle, ArrowRight, CheckCircle2, CopyCheck, Download, FileSpreadsheet, UsersRound, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DetailList } from "@/components/shared/detail-list";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { BATCH_STATUS, IMPORT_KINDS, ROW_STATUS } from "@/features/migration/fields";
import { getImportBatch, listImportRows } from "@/features/migration/queries";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/utils/format";
import { isUuid, pageParam } from "@/lib/utils/search-params";


export const metadata: Metadata = { title: "Rapport d'import" };

/** Rapport d'une migration : qui, quand, quel fichier, résultats, lignes rejetées. */
export default async function ImportReportPage({ params, searchParams }: PageProps<"/donnees-historiques/imports/[id]">) {
  const context = await requirePermission("students.import");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const batch = await getImportBatch(context.organization.id, id);
  if (!batch) notFound();
  const page = pageParam(await searchParams);
  const problems = await listImportRows(context.organization.id, id, "problems", page, 50);
  const s = batch.stats;
  const tz = context.organization.timezone;
  const author = batch.author ? [batch.author.first_name, batch.author.last_name].filter(Boolean).join(" ") || batch.author.email : "—";
  const pages = Math.ceil(problems.total / 50);

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
            <Link href="/donnees-historiques" className="hover:text-primary">
              Données historiques
            </Link>{" "}
            / <span className="text-foreground">Rapport d&apos;import</span>
          </nav>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold sm:text-[26px]">
            {batch.file_name} <StatusBadge value={batch.status} map={BATCH_STATUS} />
          </h1>
          <p className="text-sm text-muted-foreground">{IMPORT_KINDS[batch.kind]?.label}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {problems.total ? (
            <Button asChild variant="secondary">
              <a href={`/api/migration/${batch.id}/rejets?tout=1`}>
                <Download aria-hidden /> Lignes rejetées et à vérifier (CSV)
              </a>
            </Button>
          ) : null}
          {batch.status === "draft" || batch.status === "analyzed" || batch.status === "importing" ? (
            <Button asChild>
              <Link href={`/donnees-historiques/importer?lot=${batch.id}`}>
                Reprendre l&apos;import <ArrowRight aria-hidden />
              </Link>
            </Button>
          ) : batch.kind === "students" && batch.status === "completed" ? (
            <Button asChild>
              <Link href="/eleves?vue=anciens">
                Voir les anciens élèves <ArrowRight aria-hidden />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Lignes du fichier" value={{ count: batch.row_count }} hint={`${batch.headers.length} colonne(s)`} icon={FileSpreadsheet} tone="primary" />
        <StatCard label="Lignes importées" value={{ count: s.imported ?? 0 }} hint={batch.kind === "students" ? `${s.created ?? 0} dossier(s) créé(s)` : undefined} icon={CheckCircle2} tone="success" />
        <StatCard label="Doublons détectés" value={{ count: s.duplicates ?? 0 }} hint={`${s.linked ?? 0} rattaché(s) · ${s.merged ?? 0} fusionné(s) · ${s.skipped ?? 0} ignoré(s)`} icon={CopyCheck} tone="info" />
        <StatCard
          label="Rejetées / erreurs"
          value={{ count: (s.rejected ?? s.invalid ?? 0) + (s.errors ?? 0) }}
          hint={`${s.warnings ?? 0} ligne(s) avec avertissement`}
          hintTone={(s.rejected ?? s.invalid ?? 0) + (s.errors ?? 0) > 0 ? "danger" : undefined}
          icon={AlertTriangle}
          tone="danger"
        />
      </div>

      <div className="anim-fade-up grid gap-4 lg:grid-cols-3" style={{ "--delay": "160ms" } as React.CSSProperties}>
        <Card>
          <CardHeader>
            <CardTitle>Traçabilité</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                { label: "Administrateur", value: author },
                { label: "Chargé le", value: formatDateTime(batch.created_at, "fr-FR", tz) },
                { label: "Analysé le", value: batch.analyzed_at ? formatDateTime(batch.analyzed_at, "fr-FR", tz) : "—" },
                { label: "Terminé le", value: batch.completed_at ? formatDateTime(batch.completed_at, "fr-FR", tz) : "—" },
                { label: "Taille", value: `${Math.max(1, Math.round(batch.file_size / 1024)).toLocaleString("fr-FR")} Ko` },
                ...(batch.kind === "students"
                  ? [
                      { label: "Années de parcours", value: String(s.history ?? 0) },
                      { label: "Diplômes", value: String(s.diplomas ?? 0) },
                    ]
                  : [{ label: batch.kind === "grades" ? "Notes" : "Paiements", value: String((batch.kind === "grades" ? s.grades : s.payments) ?? 0) }]),
                { label: "Années scolaires créées", value: String(s.years_created ?? 0) },
              ]}
            />
          </CardContent>
        </Card>
        <Card className="overflow-hidden lg:col-span-2">
          <CardHeader>
            <CardTitle>Données rejetées et avertissements</CardTitle>
            <CardDescription>Lignes non importées (erreurs) ou importées avec des valeurs ignorées (avertissements)</CardDescription>
          </CardHeader>
          <CardContent>
            {problems.total === 0 ? (
              <EmptyState icon={UsersRound} title="Aucune ligne rejetée" description="Toutes les lignes ont été importées sans réserve." />
            ) : (
              <ul className="stagger grid gap-2">
                {problems.rows.map((r) => (
                  <li key={r.id} className="grid gap-1.5 rounded-xl border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">
                        Ligne {r.row_number} ·{" "}
                        {[(r.normalized as Record<string, string>).last_name, (r.normalized as Record<string, string>).first_name].filter(Boolean).join(" ") ||
                          Object.values(r.data).filter(Boolean).slice(0, 2).join(" ")}
                      </span>
                      <StatusBadge value={r.status} map={ROW_STATUS} />
                    </div>
                    <ul className="grid gap-1">
                      {r.issues.map((i, k) => (
                        <li key={k} className={`flex items-start gap-2 text-xs ${i.level === "error" ? "text-danger" : "text-warning"}`}>
                          {i.level === "error" ? <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
                          {i.message}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            {pages > 1 ? (
              <div className="mt-3 flex justify-end gap-2 text-sm">
                {page > 1 ? <Link href={`?page=${page - 1}`} className="font-semibold text-primary hover:underline">← Précédent</Link> : null}
                <span className="text-muted-foreground">
                  Page {page} / {pages}
                </span>
                {page < pages ? <Link href={`?page=${page + 1}`} className="font-semibold text-primary hover:underline">Suivant →</Link> : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
