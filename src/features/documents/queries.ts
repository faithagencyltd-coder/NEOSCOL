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

/** Modèles personnalisés actifs (proposés à l'émission). */
export async function listCustomTemplates(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("document_templates")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("kind", "custom")
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}

/** Tous les modèles de l'établissement (Document Studio). */
export async function listTemplates(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("document_templates")
    .select("id, kind, name, description, layout, is_default, is_active, updated_at")
    .eq("organization_id", organizationId)
    .order("name");
  return data ?? [];
}
