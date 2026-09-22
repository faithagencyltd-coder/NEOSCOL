"use server";

import { revalidatePath } from "next/cache";

import { fieldListSchema } from "@/features/forms/fields";
import { EDITABLE_FORMS, type EditableFormKind } from "@/features/forms/queries";
import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";

export async function saveFormDefinition(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("forms.manage");
  if (!auth.ok) return auth;
  const kind = String(formData.get("kind") ?? "") as EditableFormKind;
  if (!(kind in EDITABLE_FORMS)) return { ok: false, message: "Formulaire inconnu." };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("fields") ?? "[]"));
  } catch {
    return { ok: false, message: "Définition illisible." };
  }
  const parsed = fieldListSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Définition invalide." };
  const fields = parsed.data.map((f) => ({
    ...f,
    options: f.type === "select" ? f.options : undefined,
    section: f.section || undefined,
    help: f.help || undefined,
  }));

  const supabase = await createClient();
  const organizationId = auth.context.organization.id;
  const { data: current } = await supabase
    .from("form_definitions")
    .select("id, version")
    .eq("organization_id", organizationId)
    .eq("kind", kind)
    .eq("is_active", true)
    .maybeSingle();

  const { error } = current
    ? await supabase.from("form_definitions").update({ fields, version: current.version + 1 }).eq("id", current.id)
    : await supabase.from("form_definitions").insert({ organization_id: organizationId, kind, name: EDITABLE_FORMS[kind].title, fields });
  if (error) return { ok: false, message: dbErrorMessage(error, "L'enregistrement du formulaire a échoué.") };

  revalidatePath("/formulaires");
  return { ok: true, message: "Formulaire enregistré." };
}
