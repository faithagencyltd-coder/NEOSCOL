import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ImportWizard, type WizardResume } from "@/features/migration/components/import-wizard";
import { suggestMapping } from "@/features/migration/fields";
import { profileColumns } from "@/features/migration/parse";
import { getImportBatch, listImportRows } from "@/features/migration/queries";
import { requirePermission } from "@/lib/auth/guards";
import { isUuid, param } from "@/lib/utils/search-params";
import { vocabularyFor } from "@/lib/vocabulary";

export const metadata: Metadata = { title: "Importer des données historiques" };

export default async function ImportPage({ searchParams }: PageProps<"/donnees-historiques/importer">) {
  const context = await requirePermission("students.import");
  const v = vocabularyFor(context.organization.type);
  const lot = param(await searchParams, "lot");

  // Reprise d'un import en cours (rechargement, retour depuis l'historique des migrations).
  let resume: WizardResume | null = null;
  if (lot) {
    if (!isUuid(lot)) notFound();
    const batch = await getImportBatch(context.organization.id, lot);
    if (!batch) notFound();
    if (batch.status === "cancelled") redirect(`/donnees-historiques/imports/${lot}`);
    const { rows } = await listImportRows(context.organization.id, lot, "all", 1, 500);
    const table = { headers: batch.headers, rows: rows.map((r) => r.data), format: "csv" as const };
    const mapping = Object.keys(batch.mapping).length ? batch.mapping : suggestMapping(batch.kind, batch.headers);
    const options = batch.options as Partial<WizardResume["options"]>;
    resume = {
      upload: {
        batchId: batch.id,
        kind: batch.kind,
        fileName: batch.file_name,
        sheet: null,
        format: batch.file_name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx",
        rowCount: batch.row_count,
        headers: batch.headers,
        profile: profileColumns(table),
        mapping,
      },
      status: batch.status as WizardResume["status"],
      options: { default_status: options.default_status ?? "alumni", create_years: options.create_years ?? true, archive: options.archive ?? false },
      stats: batch.stats,
    };
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
          <Link href="/donnees-historiques" className="hover:text-primary">
            Données historiques
          </Link>{" "}
          / <span className="text-foreground">Importer</span>
        </nav>
        <h1 className="text-2xl font-semibold sm:text-[26px]">Importer des données historiques</h1>
        <p className="text-sm text-muted-foreground">
          Anciens {v.students.toLowerCase()}, parcours, notes et paiements : rien n&apos;est enregistré dans les dossiers avant l&apos;étape « Validation ».
        </p>
      </div>
      <ImportWizard key={lot ?? "nouveau"} resume={resume} studentLabel={v.student} />
    </div>
  );
}
