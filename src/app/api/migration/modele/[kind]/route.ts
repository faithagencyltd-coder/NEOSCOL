import type { NextRequest } from "next/server";

import { toImportCsv } from "@/features/migration/csv";
import { IMPORT_FIELDS, type ImportKind } from "@/features/migration/fields";
import { can, getSessionContext } from "@/lib/auth/session";

const EXAMPLES: Record<ImportKind, Record<string, string>[]> = {
  students: [
    { legacy_matricule: "ANC-2016-014", last_name: "KOUASSI", first_name: "Marc", birth_date: "14/02/2004", sex: "M", entry_year: "2016", exit_year: "2020", status: "Diplômé", year_label: "2019-2020", class_name: "3e B", level_name: "3e", average: "13,45", decision: "Admis", absences: "4", diploma_title: "BEPC", diploma_year: "2020", diploma_mention: "Assez bien" },
    { legacy_matricule: "ANC-2016-014", last_name: "KOUASSI", first_name: "Marc", birth_date: "14/02/2004", sex: "M", year_label: "2018-2019", class_name: "4e A", level_name: "4e", average: "12,10", decision: "Passe en 3e", absences: "7" },
  ],
  grades: [
    { student_ref: "ANC-2016-014", year_label: "2019-2020", period_label: "1er trimestre", subject: "Mathématiques", score: "14", max_score: "20", coefficient: "4" },
  ],
  payments: [
    { student_ref: "ANC-2016-014", year_label: "2019-2020", label: "Frais de scolarité", amount: "150000", paid_on: "05/10/2019", method: "Espèces", reference: "R-2019-0452" },
  ],
};

/** Modèle CSV prêt à remplir (colonnes reconnues automatiquement par l'assistant). */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/migration/modele/[kind]">) {
  const { kind } = await ctx.params;
  const context = await getSessionContext();
  if (!context?.organization) return new Response("Session expirée.", { status: 401 });
  if (!can(context, "students.import")) return new Response("Accès refusé.", { status: 403 });
  if (!(kind in IMPORT_FIELDS)) return new Response("Modèle introuvable.", { status: 404 });
  const fields = IMPORT_FIELDS[kind as ImportKind];
  const csv = toImportCsv(
    fields.map((f) => f.label),
    EXAMPLES[kind as ImportKind].map((row) => fields.map((f) => row[f.key] ?? "")),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="neoscol-modele-${kind}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
