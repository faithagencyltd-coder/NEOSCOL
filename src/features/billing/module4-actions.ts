"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";

import { MODULE4_COMPONENTS } from "./constants";

const KEYS = MODULE4_COMPONENTS.map((c) => c.key);

/** Module 4 : domaines souscrits (1 à 3). Le prix ne change pas ; contrôles en base. */
export async function saveModule4Components(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("billing.manage");
  if (!auth.ok) return auth;
  const components = KEYS.filter((k) => formData.get(`component_${k}`) === "on");
  if (components.length === 0) return { ok: false, message: "Veuillez sélectionner au moins un domaine." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_subscription_components", { p_org: auth.context.organization.id, p_components: components });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Domaines du Module 4 enregistrés." };
}

/** Module 4 : création de l'espace d'un domaine souscrit (établissement rattaché). */
export async function createModule4Space(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("settings.manage");
  if (!auth.ok) return auth;
  const component = String(formData.get("component") ?? "");
  if (!(KEYS as readonly string[]).includes(component)) return { ok: false, message: "Domaine inconnu." };
  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_component_space", {
    p_parent: auth.context.organization.id,
    p_component: component,
    p_name: name || undefined,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Espace créé : vous pouvez l'ouvrir depuis « Mes espaces »." };
}
