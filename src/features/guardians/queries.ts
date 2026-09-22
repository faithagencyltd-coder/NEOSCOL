import "server-only";

import { createClient } from "@/lib/supabase/server";
import { likePattern, normalizeSearch } from "@/lib/utils/search-params";

export const GUARDIANS_PAGE_SIZE = 20;

export async function listGuardians(organizationId: string, filters: { q?: string; page: number }) {
  const supabase = await createClient();
  let query = supabase
    .from("guardians")
    .select(
      "id, first_name, last_name, phone, email, profession, user_id, student_guardians(relationship, student:students(id, first_name, last_name, archived_at))",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .is("archived_at", null);
  if (filters.q) query = query.ilike("search_text", likePattern(normalizeSearch(filters.q)));
  const from = (filters.page - 1) * GUARDIANS_PAGE_SIZE;
  const { data, count, error } = await query
    .order("last_name")
    .order("first_name")
    .range(from, from + GUARDIANS_PAGE_SIZE - 1);
  if (error) throw new Error("Impossible de charger les parents.");
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getGuardian(organizationId: string, guardianId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("guardians")
    .select(
      "*, student_guardians(id, relationship, is_primary, is_financial_responsible, portal_access, student:students(id, first_name, last_name, matricule, status, archived_at))",
    )
    .eq("organization_id", organizationId)
    .eq("id", guardianId)
    .maybeSingle();
  return data;
}
