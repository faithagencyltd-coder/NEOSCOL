"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isPermission } from "@/config/permissions";
import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

/** Suspendre / réactiver l'accès d'un membre à l'établissement (jamais soi-même : RLS). */
export async function setMembershipStatus(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("users.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("membership_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Compte introuvable." };
  const active = formData.get("active") === "true";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .update({ status: active ? "active" : "suspended" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id)
    .neq("user_id", auth.context.user.id)
    .select("id");
  if (error || !data?.length) return { ok: false, message: dbErrorMessage(error, "Vous ne pouvez pas modifier ce compte.") };
  revalidatePath("/utilisateurs");
  return { ok: true, message: active ? "Accès réactivé." : "Accès suspendu : la connexion à l'établissement est bloquée." };
}

/** Attribuer un rôle (contrôle en base : on ne délègue jamais plus de droits qu'on n'en possède). */
export async function addMemberRole(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("users.manage");
  if (!auth.ok) return auth;
  const membershipId = String(formData.get("membership_id") ?? "");
  const roleId = String(formData.get("role_id") ?? "");
  if (!isUuid(membershipId) || !isUuid(roleId)) return { ok: false, message: "Choisissez un rôle." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("membership_roles")
    .insert({ organization_id: auth.context.organization.id, membership_id: membershipId, role_id: roleId });
  if (error) return { ok: false, message: error.code === "23505" ? "Ce rôle est déjà attribué." : dbErrorMessage(error) };
  revalidatePath("/utilisateurs");
  return { ok: true, message: "Rôle attribué." };
}

export async function removeMemberRole(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("users.manage");
  if (!auth.ok) return auth;
  const membershipId = String(formData.get("membership_id") ?? "");
  const roleId = String(formData.get("role_id") ?? "");
  if (!isUuid(membershipId) || !isUuid(roleId)) return { ok: false, message: "Rôle introuvable." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("membership_roles")
    .delete()
    .eq("organization_id", auth.context.organization.id)
    .eq("membership_id", membershipId)
    .eq("role_id", roleId)
    .select("role_id");
  if (error || !data?.length) return { ok: false, message: dbErrorMessage(error, "Vous ne pouvez pas retirer ce rôle.") };
  revalidatePath("/utilisateurs");
  return { ok: true, message: "Rôle retiré." };
}

/**
 * Matrice des permissions : ajouter / retirer une permission à un rôle de
 * l'établissement. Le rôle Administrateur reste verrouillé (pas d'auto-blocage).
 */
export async function toggleRolePermission(formData: FormData): Promise<void> {
  const auth = await authorize("roles.manage");
  if (!auth.ok) return;
  const roleId = String(formData.get("role_id") ?? "");
  const code = String(formData.get("permission") ?? "");
  if (!isUuid(roleId) || !isPermission(code)) return;
  const supabase = await createClient();
  const { data: role } = await supabase
    .from("roles")
    .select("id, key, name")
    .eq("organization_id", auth.context.organization.id)
    .eq("id", roleId)
    .maybeSingle();
  if (!role || role.key === "org_admin") return;
  if (formData.get("enabled") === "true") {
    await supabase.from("role_permissions").insert({ role_id: roleId, permission_code: code });
  } else {
    await supabase.from("role_permissions").delete().eq("role_id", roleId).eq("permission_code", code);
  }
  await supabase.rpc("log_event", {
    p_organization_id: auth.context.organization.id,
    p_action: "settings.role_permission",
    p_entity_type: "roles",
    p_entity_id: roleId,
    p_summary: `${formData.get("enabled") === "true" ? "Permission accordée" : "Permission retirée"} : ${code} → ${role.name}`,
  });
  revalidatePath("/roles");
}

const roleSchema = z.object({
  name: z.string().trim().min(3, { error: "Nom trop court." }).max(60),
  description: z.string().trim().max(200).optional(),
  copy_from: z.string().optional(),
});

/** Nouveau rôle personnalisé (personnel), éventuellement copié d'un rôle existant. */
export async function createRole(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("roles.manage");
  if (!auth.ok) return auth;
  const parsed = roleSchema.safeParse({
    name: formData.get("name"),
    description: String(formData.get("description") ?? "") || undefined,
    copy_from: String(formData.get("copy_from") ?? "") || undefined,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  const supabase = await createClient();
  const key = `custom_${parsed.data.name.normalize("NFD").replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase().slice(0, 40)}`;
  const { data: role, error } = await supabase
    .from("roles")
    .insert({ organization_id: auth.context.organization.id, key, name: parsed.data.name, description: parsed.data.description ?? null, persona: "staff", is_system: false })
    .select("id")
    .single();
  if (error || !role) return { ok: false, message: error?.code === "23505" ? "Un rôle porte déjà ce nom." : dbErrorMessage(error) };
  if (parsed.data.copy_from && isUuid(parsed.data.copy_from)) {
    const { data: perms } = await supabase.from("role_permissions").select("permission_code").eq("role_id", parsed.data.copy_from);
    if (perms?.length) await supabase.from("role_permissions").insert(perms.map((p) => ({ role_id: role.id, permission_code: p.permission_code })));
  }
  revalidatePath("/roles");
  return { ok: true, message: `Rôle « ${parsed.data.name} » créé : cochez ses permissions dans la matrice.` };
}
