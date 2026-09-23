import "server-only";

import type { ReportRow, ReportSectionKey } from "@/features/reports/sections";
import { createClient } from "@/lib/supabase/server";

export type ReportData = {
  rows: ReportRow[];
  total?: number;
  par_mois?: { mois: string; recettes: number; depenses: number }[];
  par_mode?: { mode: string; montant: number; nombre: number }[];
  depenses_par_categorie?: { categorie: string; montant: number }[];
};

/** Agrégats calculés en base (permissions reports.* vérifiées par la fonction). */
export async function getReportSection(organizationId: string, section: ReportSectionKey): Promise<ReportData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_section", { p_organization_id: organizationId, p_section: section });
  if (error || !data) return null;
  return data as unknown as ReportData;
}
