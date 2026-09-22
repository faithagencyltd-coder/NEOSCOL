import "server-only";

import { parseFields } from "@/features/forms/fields";
import { createClient } from "@/lib/supabase/server";

export const EDITABLE_FORMS = {
  enrollment: { title: "Formulaire d'inscription", description: "Informations et pièces demandées lors d'une nouvelle inscription." },
  reenrollment: { title: "Formulaire de réinscription", description: "Utilisé pour les réinscriptions (à défaut, le formulaire d'inscription)." },
  student: { title: "Fiche élève", description: "Champs complémentaires du dossier permanent de l'élève." },
} as const;

export type EditableFormKind = keyof typeof EDITABLE_FORMS;

export async function getFormDefinitions(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("form_definitions")
    .select("id, kind, name, fields, version, updated_at")
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  return (Object.keys(EDITABLE_FORMS) as EditableFormKind[]).map((kind) => {
    const row = (data ?? []).find((d) => d.kind === kind);
    return { kind, ...EDITABLE_FORMS[kind], id: row?.id ?? null, version: row?.version ?? 0, updatedAt: row?.updated_at ?? null, fields: parseFields(row?.fields) };
  });
}
