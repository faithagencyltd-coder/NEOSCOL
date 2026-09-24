"use server";

import { createHash } from "node:crypto";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isPortalKind, normalizeOrgCode, PORTAL_PERSONAS, PORTALS, type PortalKind } from "@/features/auth/portals";
import { emailSchema, newPasswordSchema, otpSchema, parentOtpSchema, phoneSchema, signInSchema, studentSignInSchema } from "@/features/auth/schemas";
import { ACTIVE_ORG_COOKIE, getSessionContext } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { safeRedirectPath } from "@/lib/utils/safe-redirect";

async function requestMetadata() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: h.get("user-agent")?.slice(0, 300) ?? null,
  };
}

/** Journalise un échec de connexion (identifiant haché, jamais en clair). */
async function logFailedSignIn(identifier: string, method: "password" | "otp" | "portal", organizationId?: string, actorId?: string) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("audit_logs").insert({
    organization_id: organizationId ?? null,
    actor_id: actorId ?? null,
    action: method === "portal" ? "auth.portal_denied" : "auth.login_failed",
    summary: method === "portal" ? "Connexion refusée : compte hors de l'établissement ou du portail du lien" : `Échec de connexion (${method})`,
    metadata: {
      ...(await requestMetadata()),
      identifier_sha256: createHash("sha256").update(identifier.toLowerCase()).digest("hex"),
      source: "app",
    },
  });
}

/** Établissement et portail visés par le lien des portails (/acces/CODE). */
type PortalScope = { id: string; name: string; kind: PortalKind };

/**
 * Lit et revérifie l'établissement transmis par le lien des portails.
 * null : connexion classique (/connexion) ; "invalid" : lien inconnu ou établissement inactif.
 */
async function portalScope(formData: FormData): Promise<PortalScope | null | "invalid"> {
  const raw = formData.get("etablissement");
  if (raw === null || raw === "") return null;
  const code = normalizeOrgCode(raw);
  const kind = formData.get("portail");
  if (!code || !isPortalKind(kind)) return "invalid";
  const supabase = await createClient();
  const { data } = await supabase.rpc("organization_portal", { p_code: code });
  const org = data?.[0];
  return org ? { id: org.id, name: org.name, kind } : "invalid";
}

const INVALID_PORTAL: ActionResult = { ok: false, message: "Lien d'accès invalide ou établissement inactif. Demandez le lien à votre établissement." };

/**
 * Après une authentification réussie : contrôle du compte, audit, redirection.
 * Depuis le lien des portails, le compte doit appartenir à l'établissement du
 * lien avec un rôle correspondant au portail ; cet établissement devient actif.
 */
async function completeSignIn(next: unknown, scope?: PortalScope | null): Promise<ActionResult> {
  const context = await getSessionContext();
  const supabase = await createClient();
  if (!context || context.profile?.is_active === false) {
    await supabase.auth.signOut();
    return { ok: false, message: "Ce compte est désactivé. Contactez l'administration de votre établissement." };
  }
  let organizationId = context.organization?.id;
  if (scope) {
    const member = context.organizations.some((o) => o.id === scope.id);
    const { data: memberships } = member
      ? await supabase
          .from("memberships")
          .select("membership_roles(role:roles(persona))")
          .eq("user_id", context.user.id)
          .eq("organization_id", scope.id)
          .eq("status", "active")
      : { data: [] };
    const personas = (memberships ?? []).flatMap((m) => m.membership_roles.map((mr) => mr.role?.persona));
    if (!personas.some((p) => p && PORTAL_PERSONAS[scope.kind].includes(p))) {
      await logFailedSignIn(`${context.user.email ?? context.user.phone ?? context.user.id}|${scope.kind}`, "portal", scope.id, context.user.id);
      await supabase.auth.signOut();
      return {
        ok: false,
        message: member
          ? `Ce compte n'a pas accès au ${PORTALS[scope.kind].label.toLowerCase()} de ${scope.name}. Choisissez le portail qui correspond à votre profil.`
          : `Ce compte n'appartient pas à ${scope.name}. Utilisez le lien de votre propre établissement.`,
      };
    }
    organizationId = scope.id;
    (await cookies()).set(ACTIVE_ORG_COOKIE, scope.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    await supabase.from("profiles").update({ last_organization_id: scope.id }).eq("id", context.user.id);
  }
  await supabase.rpc("log_event", {
    p_organization_id: organizationId,
    p_action: "auth.login",
    p_summary: scope ? `Connexion (${PORTALS[scope.kind].label})` : "Connexion",
    p_metadata: { ...(await requestMetadata()), ...(scope ? { portal: scope.kind, via: "lien_portails" } : {}) },
  });
  redirect(safeRedirectPath(next));
}

/** Normalise un nom pour la comparaison (casse, accents, espaces). */
function sameName(a: string | null | undefined, b: string) {
  const n = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/gi, "").toLowerCase();
  return Boolean(a) && n(a!) === n(b);
}

/** Adresse de connexion d'un compte à partir de son identifiant technique (service role, lecture seule). */
async function accountEmail(userId: string | null | undefined): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin || !userId) return null;
  const { data } = await admin.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

/**
 * Personnel : identifiant = adresse e-mail OU matricule. Le matricule est
 * résolu côté serveur (jamais exposé au navigateur) ; message d'erreur unique.
 */
export async function signInWithPassword(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    return { ok: false, message: "Vérifiez les champs du formulaire.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const scope = await portalScope(formData);
  if (scope === "invalid") return INVALID_PORTAL;
  let email = parsed.data.email.toLowerCase();
  if (!email.includes("@")) {
    const admin = createAdminClient();
    let staffQuery = admin?.from("staff_members").select("user_id").ilike("employee_number", parsed.data.email).not("user_id", "is", null);
    if (staffQuery && scope) staffQuery = staffQuery.eq("organization_id", scope.id);
    const { data: staff } = staffQuery ? await staffQuery.limit(2) : { data: [] };
    email = (staff?.length === 1 ? await accountEmail(staff[0]!.user_id) : null) ?? "";
  }
  const supabase = await createClient();
  const { error } = email ? await supabase.auth.signInWithPassword({ email, password: parsed.data.password }) : { error: true };
  if (error) {
    await logFailedSignIn(parsed.data.email, "password", scope?.id);
    return { ok: false, message: "Identifiant ou mot de passe incorrect." };
  }
  return completeSignIn(formData.get("suite"), scope);
}

/**
 * Élève / apprenant : matricule + date de naissance + mot de passe
 * (sécurité complémentaire). Les trois doivent correspondre.
 */
export async function signInStudent(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = studentSignInSchema.safeParse({
    matricule: formData.get("matricule"),
    birth_date: formData.get("birth_date"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Vérifiez les champs du formulaire.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const scope = await portalScope(formData);
  if (scope === "invalid") return INVALID_PORTAL;
  const admin = createAdminClient();
  let studentQuery = admin?.from("students").select("user_id, birth_date").eq("matricule", parsed.data.matricule);
  if (studentQuery && scope) studentQuery = studentQuery.eq("organization_id", scope.id);
  const { data: student } = studentQuery ? await studentQuery.maybeSingle() : { data: null };
  const email = student && student.birth_date === parsed.data.birth_date ? await accountEmail(student.user_id) : null;
  const supabase = await createClient();
  const { error } = email ? await supabase.auth.signInWithPassword({ email, password: parsed.data.password }) : { error: true };
  if (error) {
    await logFailedSignIn(parsed.data.matricule, "password", scope?.id);
    return { ok: false, message: "Matricule, date de naissance ou mot de passe incorrect." };
  }
  return completeSignIn(formData.get("suite"), scope);
}

/**
 * Parent : téléphone + nom + prénom. Le code n'est envoyé que si ces trois
 * informations correspondent à un parent disposant d'un accès portail ; la
 * réponse est identique dans tous les cas (aucune énumération possible).
 */
export async function requestParentOtp(_: ActionResult<{ phone: string }> | null, formData: FormData): Promise<ActionResult<{ phone: string }>> {
  const parsed = parentOtpSchema.safeParse({ phone: formData.get("phone"), last_name: formData.get("last_name"), first_name: formData.get("first_name") });
  const phone = phoneSchema.safeParse(formData.get("phone"));
  if (!parsed.success || !phone.success) {
    const errors = parsed.success ? {} : z.flattenError(parsed.error).fieldErrors;
    return {
      ok: false,
      message: "Vérifiez les champs du formulaire.",
      fieldErrors: { ...errors, phone: phone.success ? undefined : phone.error.issues.map((i) => i.message) },
    };
  }
  const scope = await portalScope(formData);
  if (scope === "invalid") return INVALID_PORTAL;
  const admin = createAdminClient();
  const digits = phone.data.replace(/\D/g, "");
  let guardianQuery = admin
    ?.from("guardians")
    .select("first_name, last_name, phone, phone_secondary, user_id")
    .not("user_id", "is", null)
    .is("archived_at", null)
    .or(`phone.eq.${phone.data},phone_secondary.eq.${phone.data},phone.eq.${digits},phone_secondary.eq.${digits}`);
  // Depuis le lien des portails : seuls les parents de cet établissement reçoivent un code.
  if (guardianQuery && scope) guardianQuery = guardianQuery.eq("organization_id", scope.id);
  const { data: guardians } = guardianQuery ? await guardianQuery : { data: [] };
  const match = (guardians ?? []).find((g) => sameName(g.last_name, parsed.data.last_name) && sameName(g.first_name, parsed.data.first_name));
  if (match) {
    const supabase = await createClient();
    await supabase.auth.signInWithOtp({ phone: phone.data, options: { shouldCreateUser: false } });
  } else {
    await logFailedSignIn(phone.data, "otp", scope?.id);
  }
  return { ok: true, message: "Si ces informations correspondent à un compte parent, un code vous a été envoyé par SMS.", data: { phone: phone.data } };
}

export async function verifyPhoneOtp(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = otpSchema.safeParse({ phone: formData.get("phone"), token: formData.get("token") });
  if (!parsed.success) {
    return { ok: false, message: "Vérifiez le code saisi.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const scope = await portalScope(formData);
  if (scope === "invalid") return INVALID_PORTAL;
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ phone: parsed.data.phone, token: parsed.data.token, type: "sms" });
  if (error) {
    await logFailedSignIn(parsed.data.phone, "otp", scope?.id);
    return { ok: false, message: "Code incorrect ou expiré." };
  }
  return completeSignIn(formData.get("suite"), scope);
}

export async function requestPasswordReset(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { ok: false, message: "Adresse e-mail invalide.", fieldErrors: { email: ["Adresse e-mail invalide."] } };
  }
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${publicEnv.siteUrl}/auth/confirm?suite=/reinitialiser-mot-de-passe`,
  });
  return {
    ok: true,
    message: "Si un compte correspond à cette adresse, un lien de réinitialisation vient d'être envoyé.",
  };
}

export async function updatePassword(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Vérifiez les champs du formulaire.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const context = await getSessionContext();
  if (!context) {
    return { ok: false, message: "Votre lien a expiré. Demandez un nouveau lien de réinitialisation." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { ok: false, message: error.code === "same_password" ? "Choisissez un mot de passe différent de l'actuel." : "La modification a échoué." };
  }
  await supabase.rpc("log_event", {
    p_organization_id: context.organization?.id,
    p_action: "auth.password_changed",
    p_summary: "Mot de passe modifié",
    p_metadata: await requestMetadata(),
  });
  return { ok: true, message: "Votre mot de passe a été modifié." };
}

export async function signOut(): Promise<void> {
  const context = await getSessionContext();
  const supabase = await createClient();
  if (context) {
    await supabase.rpc("log_event", {
      p_organization_id: context.organization?.id,
      p_action: "auth.logout",
      p_summary: "Déconnexion",
    });
  }
  await supabase.auth.signOut();
  (await cookies()).delete(ACTIVE_ORG_COOKIE);
  redirect("/connexion");
}

export async function switchOrganization(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const context = await getSessionContext();
  if (!context) redirect("/connexion");
  // Le cookie ne donne aucun droit : on vérifie l'adhésion, et la RLS reste la barrière.
  if (!context.organizations.some((o) => o.id === organizationId)) {
    redirect("/tableau-de-bord");
  }
  (await cookies()).set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  const supabase = await createClient();
  await supabase.from("profiles").update({ last_organization_id: organizationId }).eq("id", context.user.id);
  await supabase.rpc("log_event", {
    p_organization_id: organizationId,
    p_action: "auth.switch_organization",
    p_summary: "Changement d'établissement actif",
  });
  redirect("/tableau-de-bord");
}
