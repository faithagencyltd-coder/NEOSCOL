"use server";

import { createHash } from "node:crypto";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { emailSchema, newPasswordSchema, otpSchema, phoneSchema, signInSchema } from "@/features/auth/schemas";
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
async function logFailedSignIn(identifier: string, method: "password" | "otp") {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("audit_logs").insert({
    action: "auth.login_failed",
    summary: `Échec de connexion (${method})`,
    metadata: {
      ...(await requestMetadata()),
      identifier_sha256: createHash("sha256").update(identifier.toLowerCase()).digest("hex"),
      source: "app",
    },
  });
}

/** Après une authentification réussie : contrôle du compte, audit, redirection. */
async function completeSignIn(next: unknown): Promise<ActionResult> {
  const context = await getSessionContext();
  const supabase = await createClient();
  if (!context || context.profile?.is_active === false) {
    await supabase.auth.signOut();
    return { ok: false, message: "Ce compte est désactivé. Contactez l'administration de votre établissement." };
  }
  await supabase.rpc("log_event", {
    p_organization_id: context.organization?.id,
    p_action: "auth.login",
    p_summary: "Connexion",
    p_metadata: await requestMetadata(),
  });
  redirect(safeRedirectPath(next));
}

export async function signInWithPassword(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    return { ok: false, message: "Vérifiez les champs du formulaire.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    await logFailedSignIn(parsed.data.email, "password");
    return { ok: false, message: "Adresse e-mail ou mot de passe incorrect." };
  }
  return completeSignIn(formData.get("suite"));
}

export async function requestPhoneOtp(_: ActionResult<{ phone: string }> | null, formData: FormData): Promise<ActionResult<{ phone: string }>> {
  const parsed = phoneSchema.safeParse(formData.get("phone"));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Numéro invalide.", fieldErrors: { phone: parsed.error.issues.map((i) => i.message) } };
  }
  const supabase = await createClient();
  // shouldCreateUser: false — seuls les comptes créés par l'établissement peuvent se connecter.
  const { error } = await supabase.auth.signInWithOtp({ phone: parsed.data, options: { shouldCreateUser: false } });
  if (error && error.status !== 422 && error.status !== 400) {
    return { ok: false, message: "L'envoi du code a échoué. Réessayez dans quelques instants." };
  }
  // Même réponse que le numéro existe ou non (pas d'énumération des comptes).
  return { ok: true, message: "Si ce numéro est enregistré, un code vous a été envoyé par SMS.", data: { phone: parsed.data } };
}

export async function verifyPhoneOtp(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = otpSchema.safeParse({ phone: formData.get("phone"), token: formData.get("token") });
  if (!parsed.success) {
    return { ok: false, message: "Vérifiez le code saisi.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ phone: parsed.data.phone, token: parsed.data.token, type: "sms" });
  if (error) {
    await logFailedSignIn(parsed.data.phone, "otp");
    return { ok: false, message: "Code incorrect ou expiré." };
  }
  return completeSignIn(formData.get("suite"));
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
