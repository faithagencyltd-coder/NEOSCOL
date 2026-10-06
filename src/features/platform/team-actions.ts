"use server";

import { randomInt } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getPlatformRole, platformDeniedMessage, canWritePlatform } from "@/lib/auth/platform";
import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

/**
 * Équipe de la plateforme (réservée aux propriétaires) et contrôle des
 * modules. La base revérifie chaque droit : ces contrôles évitent seulement
 * de créer un compte pour rien et donnent un message clair.
 */

type Credentials = { login: string; password: string };

const ROLES = ["owner", "admin", "viewer"] as const;

function password(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return `${Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join("")}-${randomInt(10, 99)}`;
}

async function requireOwner(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!(await getSessionContext())) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const role = await getPlatformRole();
  return role === "owner" ? { ok: true } : { ok: false, message: "Seul un propriétaire peut gérer l'équipe de la plateforme." };
}

const memberSchema = z.object({
  email: z.email({ error: "E-mail invalide." }),
  first_name: z.string().trim().max(80).optional(),
  last_name: z.string().trim().max(80).optional(),
  role: z.enum(ROLES, { error: "Rôle invalide." }),
});

/** Ajoute un compte existant, ou crée le compte (mot de passe provisoire affiché une seule fois). */
export async function addTeamMember(_: ActionResult<Credentials> | null, formData: FormData): Promise<ActionResult<Credentials>> {
  const auth = await requireOwner();
  if (!auth.ok) return auth;
  const input = memberSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    first_name: formData.get("first_name") || undefined,
    last_name: formData.get("last_name") || undefined,
    role: formData.get("role"),
  });
  if (!input.success) return { ok: false, message: input.error.issues[0]?.message ?? "Saisie invalide." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Configuration serveur incomplète (clé de service Supabase absente)." };
  const supabase = await createClient();

  const { data: existing } = await admin.from("profiles").select("id").ilike("email", input.data.email).maybeSingle();
  if (existing) {
    const { error } = await supabase.rpc("platform_add_team_member", { p_user: existing.id, p_role: input.data.role });
    if (error) return { ok: false, message: dbErrorMessage(error) };
    revalidatePath("/plateforme/equipe");
    return { ok: true, message: "Compte existant ajouté à l'équipe : il garde son mot de passe actuel." };
  }

  if (!input.data.first_name || !input.data.last_name) return { ok: false, message: "Aucun compte avec cet e-mail : indiquez le prénom et le nom pour le créer." };
  const secret = password();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: input.data.email,
    password: secret,
    email_confirm: true,
    user_metadata: { first_name: input.data.first_name, last_name: input.data.last_name },
  });
  if (error || !created.user) return { ok: false, message: "Création du compte impossible." };
  await admin.from("profiles").update({ first_name: input.data.first_name, last_name: input.data.last_name }).eq("id", created.user.id);
  const { error: linkError } = await supabase.rpc("platform_add_team_member", { p_user: created.user.id, p_role: input.data.role });
  if (linkError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, message: dbErrorMessage(linkError) };
  }
  revalidatePath("/plateforme/equipe");
  return {
    ok: true,
    message: "Compte créé et ajouté à l'équipe. Communiquez ces identifiants : le mot de passe ne sera plus affiché. Demandez-lui d'activer la double authentification.",
    data: { login: input.data.email, password: secret },
  };
}

export async function setTeamRole(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requireOwner();
  if (!auth.ok) return auth;
  const user = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!isUuid(user) || !(ROLES as readonly string[]).includes(role)) return { ok: false, message: "Saisie invalide." };
  const { error } = await (await createClient()).rpc("platform_set_team_role", { p_user: user, p_role: role });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/plateforme/equipe");
  return { ok: true, message: "Rôle modifié." };
}

export async function removeTeamMember(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requireOwner();
  if (!auth.ok) return auth;
  const user = String(formData.get("user_id") ?? "");
  if (!isUuid(user)) return { ok: false, message: "Membre introuvable." };
  const { error } = await (await createClient()).rpc("platform_remove_team_member", { p_user: user, p_reason: String(formData.get("reason") ?? "") });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/plateforme/equipe");
  return { ok: true, message: "Accès à la console retiré. Le compte lui-même est conservé." };
}

/** Règle d'un module : ouvert (on), arrêté (off) ou règle retirée (remove). */
export async function setFeatureRule(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!(await getSessionContext())) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const role = await getPlatformRole();
  if (!canWritePlatform(role)) return { ok: false, message: platformDeniedMessage(role) };
  // Cible combinée « country:CI » / « org_type:university » (formulaire d'exception).
  const [targetScope, targetValue] = String(formData.get("target") ?? "").split(":");
  const scope = targetScope && targetValue ? targetScope : String(formData.get("scope") ?? "");
  const value = targetScope && targetValue ? targetValue : String(formData.get("value") ?? "");
  const state = String(formData.get("state") ?? "");
  if (!["global", "country", "org_type"].includes(scope) || !["on", "off", "remove"].includes(state)) return { ok: false, message: "Saisie invalide." };
  const { error } = await (await createClient()).rpc("platform_set_feature_rule", {
    p_feature: String(formData.get("feature") ?? ""),
    p_scope: scope,
    p_value: value,
    p_enabled: (state === "remove" ? null : state === "on") as boolean,
    p_reason: String(formData.get("reason") ?? ""),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/plateforme/modules");
  return { ok: true, message: state === "remove" ? "Règle retirée." : state === "on" ? "Fonctionnalité ouverte à ce niveau." : "Fonctionnalité arrêtée à ce niveau." };
}
