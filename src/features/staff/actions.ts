"use server";

import { randomInt } from "node:crypto";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { storeUpload } from "@/features/files/server";
import { STAFF_FIELDS, staffSchema, type ScanResult } from "@/features/staff/schemas";
import { authorize } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { readBoolean, readFields } from "@/lib/utils/form-data";
import { isUuid } from "@/lib/utils/search-params";

function parseStaff(formData: FormData) {
  return staffSchema.safeParse(readFields(formData, STAFF_FIELDS));
}

export async function createStaffMember(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("staff.manage");
  if (!auth.ok) return auth;
  const parsed = parseStaff(formData);
  if (!parsed.success) return { ok: false, message: "Vérifiez les champs signalés.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_members")
    .insert({ ...parsed.data, organization_id: auth.context.organization.id, is_teacher: readBoolean(formData, "is_teacher") })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: dbErrorMessage(error, "La création a échoué.") };
  revalidatePath("/personnel");
  redirect(`/personnel/${data.id}?cree=1`);
}

export async function updateStaffMember(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("staff.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("staff_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Membre du personnel introuvable." };
  const parsed = parseStaff(formData);
  if (!parsed.success) return { ok: false, message: "Vérifiez les champs signalés.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("staff_members")
    .update(
      {
        ...Object.fromEntries(STAFF_FIELDS.map((k) => [k, parsed.data[k] ?? null])),
        first_name: parsed.data.first_name,
        last_name: parsed.data.last_name,
        is_teacher: readBoolean(formData, "is_teacher"),
      },
      { count: "exact" },
    )
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/personnel/${id}`);
  revalidatePath("/personnel/badges");
  return { ok: true, message: "Fiche mise à jour." };
}

const statusSchema = z.object({
  staff_id: z.uuid(),
  status: z.enum(["active", "inactive", "withdrawn"]),
  reason: z.string().trim().min(3, { error: "Le motif est obligatoire." }).max(500),
});

/** Désactivation / retrait / réactivation : le badge actif est désactivé automatiquement (base). */
export async function changeStaffStatus(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("staff.manage");
  if (!auth.ok) return auth;
  const parsed = statusSchema.safeParse({ staff_id: formData.get("staff_id"), status: formData.get("status"), reason: formData.get("reason") });
  if (!parsed.success) return { ok: false, message: z.flattenError(parsed.error).fieldErrors.reason?.[0] ?? "Données invalides." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("staff_members")
    .update({ status: parsed.data.status, status_reason: parsed.data.reason }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", parsed.data.staff_id);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/personnel/${parsed.data.staff_id}`);
  revalidatePath("/personnel");
  return { ok: true, message: "Statut mis à jour." };
}

export async function setStaffArchived(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("staff.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("staff_id") ?? "");
  const archive = formData.get("archive") === "true";
  if (!isUuid(id)) return { ok: false, message: "Membre du personnel introuvable." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("staff_members")
    .update({ archived_at: archive ? new Date().toISOString() : null }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/personnel/${id}`);
  revalidatePath("/personnel/badges");
  revalidatePath("/personnel");
  return { ok: true, message: archive ? "Fiche archivée (badge désactivé)." : "Fiche restaurée." };
}

export async function deleteStaffMember(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("staff.delete");
  if (!auth.ok) return auth;
  const id = String(formData.get("staff_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Membre du personnel introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_staff_member", { p_staff_id: id, p_confirmation: String(formData.get("confirmation") ?? "") });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/personnel");
  redirect("/personnel?supprime=1");
}

export async function uploadStaffPhoto(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("staff.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("staff_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Membre du personnel introuvable." };
  const supabase = await createClient();
  const stored = await storeUpload(supabase, {
    organizationId: auth.context.organization.id,
    file: formData.get("file") as File,
    owner: "staff",
    ownerId: id,
    category: "photo",
    accept: ["image"],
  });
  if (!stored.ok) return stored;
  const { error, count } = await supabase
    .from("staff_members")
    .update({ photo_path: stored.id }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/personnel/${id}`);
  revalidatePath("/personnel/badges");
  return { ok: true, message: "Photo enregistrée : elle figurera sur le badge." };
}

/** Génère ou régénère le badge (l'ancien est désactivé, l'historique est conservé). */
export async function issueBadge(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("staff.badges.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("staff_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Membre du personnel introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("issue_staff_badge", {
    p_staff_id: id,
    p_reason: String(formData.get("reason") ?? "").trim() || undefined,
  });
  if (error) return { ok: false, message: dbErrorMessage(error, "Génération du badge impossible.") };
  revalidatePath(`/personnel/${id}`);
  revalidatePath("/personnel/badges");
  return { ok: true, message: "Nouveau badge généré ; l'ancien QR Code est désactivé." };
}

export async function revokeBadge(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("staff.badges.manage");
  if (!auth.ok) return auth;
  const badgeId = String(formData.get("badge_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!isUuid(badgeId)) return { ok: false, message: "Badge introuvable." };
  if (reason.length < 3) return { ok: false, message: "Le motif est obligatoire." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_badges")
    .update({ status: "revoked", revoked_reason: reason })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", badgeId)
    .eq("status", "active")
    .select("staff_id")
    .maybeSingle();
  if (error || !data) return { ok: false, message: dbErrorMessage(error, "Désactivation impossible.") };
  revalidatePath(`/personnel/${data.staff_id}`);
  return { ok: true, message: "Badge désactivé : il sera refusé par la tablette." };
}

function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return `${Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join("")}-${randomInt(10, 99)}!`;
}

/**
 * Crée le compte de connexion d'un membre du personnel (identifiant = e-mail
 * ou matricule). Le mot de passe provisoire n'est affiché qu'une fois.
 * Le compte d'authentification est créé avec le client « service role » APRÈS
 * contrôle de users.manage ; l'adhésion et le rôle passent par la RLS.
 */
export async function createStaffAccount(
  _: ActionResult<{ password: string; login: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ password: string; login: string }>> {
  const auth = await authorize("users.manage");
  if (!auth.ok) return auth;
  const staffId = String(formData.get("staff_id") ?? "");
  const roleId = String(formData.get("role_id") ?? "");
  if (!isUuid(staffId) || !isUuid(roleId)) return { ok: false, message: "Sélectionnez un rôle." };
  const supabase = await createClient();
  const organizationId = auth.context.organization.id;
  const { data: staff } = await supabase
    .from("staff_members")
    .select("id, first_name, last_name, email, phone, employee_number, user_id, status, archived_at")
    .eq("organization_id", organizationId)
    .eq("id", staffId)
    .maybeSingle();
  if (!staff) return { ok: false, message: "Membre du personnel introuvable." };
  if (staff.user_id) return { ok: false, message: "Un compte de connexion existe déjà." };
  if (staff.status !== "active" || staff.archived_at) return { ok: false, message: "Réactivez d'abord ce membre du personnel." };
  if (!staff.email) return { ok: false, message: "Renseignez d'abord l'adresse e-mail du membre du personnel." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Configuration serveur incomplète (clé de service Supabase absente)." };

  const password = temporaryPassword();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: staff.email,
    password,
    email_confirm: true,
    user_metadata: { first_name: staff.first_name, last_name: staff.last_name },
  });
  if (createError || !created.user) {
    return { ok: false, message: createError?.message?.includes("already") ? "Cette adresse e-mail est déjà utilisée par un autre compte." : "Création du compte impossible." };
  }
  const userId = created.user.id;
  const rollback = async (message: string) => {
    await admin.auth.admin.deleteUser(userId);
    return { ok: false as const, message };
  };
  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .insert({ organization_id: organizationId, user_id: userId, status: "active", joined_at: new Date().toISOString(), invited_by: auth.context.user.id })
    .select("id")
    .single();
  if (membershipError || !membership) return rollback(dbErrorMessage(membershipError, "Adhésion impossible."));
  const { error: roleError } = await supabase
    .from("membership_roles")
    .insert({ organization_id: organizationId, membership_id: membership.id, role_id: roleId });
  if (roleError) return rollback(dbErrorMessage(roleError, "Attribution du rôle impossible."));
  const { error: linkError } = await supabase.from("staff_members").update({ user_id: userId }).eq("id", staffId);
  if (linkError) return rollback(dbErrorMessage(linkError));
  await supabase.rpc("log_event", {
    p_action: "staff.account_created",
    p_organization_id: organizationId,
    p_entity_type: "staff_members",
    p_entity_id: staffId,
    p_summary: `Compte de connexion créé pour ${staff.first_name} ${staff.last_name}`,
  });
  // Pas de revalidation ici : la boîte de dialogue doit rester affichée avec le mot de passe ;
  // la page est rafraîchie à sa fermeture.
  return {
    ok: true,
    message: "Compte créé. Communiquez ces identifiants en main propre : le mot de passe ne sera plus affiché.",
    data: { password, login: `${staff.email} ou ${staff.employee_number}` },
  };
}

/** Scan d'un badge sur la tablette : tous les contrôles sont faits en base. */
export async function scanBadge(code: string): Promise<{ ok: true; result: ScanResult } | { ok: false; message: string }> {
  const auth = await authorize("staff_attendance.scan");
  if (!auth.ok) return auth;
  const value = String(code ?? "").trim().slice(0, 200);
  if (!value) return { ok: false, message: "Aucun code lu." };
  const supabase = await createClient();
  const device = ((await headers()).get("user-agent") ?? "").slice(0, 120);
  const { data, error } = await supabase.rpc("scan_staff_badge", { p_organization_id: auth.context.organization.id, p_code: value, p_device: device });
  if (error || !data) return { ok: false, message: dbErrorMessage(error, "Le scan n'a pas pu être traité.") };
  return { ok: true, result: data as ScanResult };
}
