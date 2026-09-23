import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Documents officiels émis pour un élève (RLS : documents.read). */
export async function listStudentDocuments(organizationId: string, studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("issued_documents")
    .select("id, kind, number, title, status, issued_at, revoked_reason")
    .eq("organization_id", organizationId)
    .eq("student_id", studentId)
    .order("issued_at", { ascending: false })
    .limit(100);
  return data ?? [];
}
