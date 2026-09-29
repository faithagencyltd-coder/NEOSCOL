import type { NextRequest } from "next/server";

import { toImportCsv } from "@/features/migration/csv";
import { canAny, getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/search-params";

const fmt = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v));

/** Archive d'une année : résultats annuels de chaque élève inscrit (droits vérifiés en base). */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/archives/annee/[id]">) {
  const { id } = await ctx.params;
  const context = await getSessionContext();
  if (!context?.organization) return new Response("Session expirée.", { status: 401 });
  if (!canAny(context, ["academic.manage", "reports.export"])) return new Response("Accès refusé.", { status: 403 });
  if (!isUuid(id)) return new Response("Année introuvable.", { status: 404 });
  const supabase = await createClient();
  const [{ data: year }, { data, error }] = await Promise.all([
    supabase.from("academic_years").select("name").eq("id", id).eq("organization_id", context.organization.id).maybeSingle(),
    supabase.rpc("academic_year_archive", { p_org: context.organization.id, p_year: id }),
  ]);
  if (error || !year) return new Response(error?.message ?? "Année introuvable.", { status: 404 });
  await supabase.rpc("log_event", {
    p_action: "export.year_archive",
    p_organization_id: context.organization.id,
    p_entity_type: "academic_years",
    p_entity_id: id,
    p_summary: `Archive de l'année ${year.name} exportée (${data?.length ?? 0} élève(s))`,
  });
  const csv = toImportCsv(
    ["Matricule", "Nom", "Prénom", "Date de naissance", "Classe", "Moyenne annuelle", "Rang", "Mention", "Décision", "Statut du résultat", "Inscription"],
    (data ?? []).map((r) => [
      r.matricule,
      r.last_name,
      r.first_name,
      r.birth_date ? r.birth_date.split("-").reverse().join("/") : "",
      fmt(r.class_name),
      fmt(r.average),
      fmt(r.rank),
      fmt(r.mention),
      fmt(r.decision),
      r.result_status === "validated" ? "Validé" : r.result_status === "draft" ? "Provisoire" : "",
      fmt(r.enrollment),
    ]),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="archive-${year.name.replace(/[^\w-]+/g, "-")}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
