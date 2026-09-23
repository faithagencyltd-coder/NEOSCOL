"use server";

import { randomInt } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

type Credentials = { login: string; password: string };

const ORG_TYPES = [
  "primary_school", "middle_school", "high_school", "school_complex", "university", "institute",
  "vocational_center", "technical_center", "private_school", "school_group",
] as const;

async function requirePlatformAdmin(): Promise<{ ok: true } | { ok: false; message: string }> {
  const context = await getSessionContext();
  if (!context) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  return data ? { ok: true } : { ok: false, message: "Réservé à l'administration de la plateforme NéoScol." };
}

function password(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return `${Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join("")}-${randomInt(10, 99)}`;
}

const adminSchema = z.object({
  first_name: z.string().trim().min(1, { error: "Prénom obligatoire." }).max(80),
  last_name: z.string().trim().min(1, { error: "Nom obligatoire." }).max(80),
  email: z.email({ error: "E-mail invalide." }),
});

/** Crée le compte de l'administrateur (clé de service, APRÈS contrôle plateforme) et le rattache. */
async function createOrgAdmin(organizationId: string, input: z.infer<typeof adminSchema>): Promise<ActionResult<Credentials>> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Configuration serveur incomplète (clé de service Supabase absente)." };
  const secret = password();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: input.email.toLowerCase(),
    password: secret,
    email_confirm: true,
    user_metadata: { first_name: input.first_name, last_name: input.last_name },
  });
  if (error || !created.user) return { ok: false, message: error?.message?.includes("already") ? "Cette adresse e-mail est déjà utilisée." : "Création du compte impossible." };
  await admin.from("profiles").update({ first_name: input.first_name, last_name: input.last_name }).eq("id", created.user.id);
  const supabase = await createClient();
  const { error: linkError } = await supabase.rpc("platform_add_org_admin", { p_organization_id: organizationId, p_user_id: created.user.id });
  if (linkError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, message: dbErrorMessage(linkError) };
  }
  return { ok: true, message: "Administrateur créé. Communiquez ces identifiants : le mot de passe ne sera plus affiché.", data: { login: input.email.toLowerCase(), password: secret } };
}

const orgSchema = z.object({
  name: z.string().trim().min(3, { error: "Nom trop court." }).max(160),
  code: z.string().trim().regex(/^[A-Za-z0-9]{2,10}$/, { error: "Code : 2 à 10 lettres ou chiffres (sert aux matricules)." }),
  type: z.enum(ORG_TYPES),
  city: z.string().trim().max(80).optional(),
  country: z.string().trim().length(2).default("CI"),
  currency: z.string().trim().length(3).default("XOF"),
});

/** Nouvel établissement (provisionné : rôles, formulaires, modèles) + son premier administrateur. */
export async function createOrganization(_: ActionResult<Credentials> | null, formData: FormData): Promise<ActionResult<Credentials>> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const org = orgSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    type: formData.get("type"),
    city: String(formData.get("city") ?? "") || undefined,
    country: String(formData.get("country") ?? "") || undefined,
    currency: String(formData.get("currency") ?? "") || undefined,
  });
  if (!org.success) return { ok: false, message: org.error.issues[0]?.message ?? "Données invalides." };
  const person = adminSchema.safeParse({ first_name: formData.get("admin_first_name"), last_name: formData.get("admin_last_name"), email: formData.get("admin_email") });
  if (!person.success) return { ok: false, message: person.error.issues[0]?.message ?? "Administrateur invalide." };
  const supabase = await createClient();
  const slug = org.data.name.normalize("NFD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60);
  const { data: orgId, error } = await supabase.rpc("create_organization", {
    p_name: org.data.name,
    p_code: org.data.code,
    p_slug: `${slug}-${org.data.code.toLowerCase()}`,
    p_type: org.data.type,
    p_city: org.data.city,
    p_country: org.data.country,
    p_currency: org.data.currency,
  });
  if (error || !orgId) return { ok: false, message: error?.code === "23505" ? "Ce code d'établissement est déjà utilisé." : dbErrorMessage(error) };
  const result = await createOrgAdmin(orgId, person.data);
  revalidatePath("/plateforme");
  if (!result.ok) return { ok: false, message: `Établissement créé, mais l'administrateur n'a pas pu l'être : ${result.message}` };
  return { ...result, message: `Établissement « ${org.data.name} » créé. ${result.message}` };
}

export async function addOrganizationAdmin(_: ActionResult<Credentials> | null, formData: FormData): Promise<ActionResult<Credentials>> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const orgId = String(formData.get("organization_id") ?? "");
  if (!isUuid(orgId)) return { ok: false, message: "Établissement introuvable." };
  const person = adminSchema.safeParse({ first_name: formData.get("admin_first_name"), last_name: formData.get("admin_last_name"), email: formData.get("admin_email") });
  if (!person.success) return { ok: false, message: person.error.issues[0]?.message ?? "Administrateur invalide." };
  const result = await createOrgAdmin(orgId, person.data);
  revalidatePath("/plateforme");
  return result;
}

/** Suspendre / réactiver un établissement : ses membres perdent immédiatement l'accès (RLS). */
export async function setOrganizationStatus(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const orgId = String(formData.get("organization_id") ?? "");
  const status = formData.get("status") === "active" ? "active" : "suspended";
  if (!isUuid(orgId)) return { ok: false, message: "Établissement introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update({ status }).eq("id", orgId);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/plateforme");
  return { ok: true, message: status === "active" ? "Établissement réactivé." : "Établissement suspendu : ses utilisateurs n'y ont plus accès." };
}
