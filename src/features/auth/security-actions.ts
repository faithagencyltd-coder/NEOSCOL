"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { recentVerificationCount, sendVerificationEmail } from "@/lib/auth/email-verification";
import { checkLoginGate, recordLoginAttempt, securityState } from "@/lib/auth/security";
import { getSessionContext } from "@/lib/auth/session";
import { publicBaseUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { safeRedirectPath } from "@/lib/utils/safe-redirect";
import { isUuid } from "@/lib/utils/search-params";

const CODE = /^\d{6}$/;
const readCode = (formData: FormData) => String(formData.get("code") ?? "").replace(/\s/g, "");

async function verifiedTotp() {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  return { supabase, factor: data?.totp.find((f) => f.status === "verified") ?? null };
}

/**
 * Connexion — 2e étape : code à 6 chiffres de l'application d'authentification.
 * Verrouillage après plusieurs codes faux (même mécanisme que le mot de passe).
 */
export async function verifyMfaLogin(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const context = await getSessionContext();
  if (!context) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const code = readCode(formData);
  if (!CODE.test(code)) return { ok: false, message: "Saisissez les 6 chiffres affichés par votre application." };
  const gate = await checkLoginGate(`mfa:${context.user.id}`, null);
  if (!gate.ok) return { ok: false, message: gate.message };
  const { supabase, factor } = await verifiedTotp();
  if (!factor) redirect(safeRedirectPath(formData.get("suite")));
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  await recordLoginAttempt(gate, !error);
  if (error) return { ok: false, message: "Code incorrect ou expiré. Utilisez le code affiché en ce moment." };
  await supabase.rpc("log_event", { p_action: "auth.login_mfa", p_summary: "Connexion confirmée par double authentification" });
  redirect(safeRedirectPath(formData.get("suite")));
}

export type EnrollData = { factorId: string; qr: string; secret: string };

/** Activation — étape 1 : nouveau facteur TOTP (QR code à scanner). */
export async function startTotpEnrollment(): Promise<ActionResult<EnrollData>> {
  const context = await getSessionContext();
  if (!context) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (factors?.totp.some((f) => f.status === "verified")) return { ok: false, message: "La double authentification est déjà activée." };
  // Tentatives inachevées : supprimées pour repartir d'un QR code neuf.
  for (const f of factors?.all ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `NEOSCOOL ${new Date().toISOString().slice(0, 10)}`, issuer: "NEOSCOOL" });
  if (error || !data) return { ok: false, message: "Activation impossible pour le moment. Réessayez." };
  return { ok: true, data: { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret } };
}

/** Activation — étape 2 : premier code, qui prouve que l'application est bien configurée. */
export async function confirmTotpEnrollment(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const context = await getSessionContext();
  if (!context) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const factorId = String(formData.get("factor_id") ?? "");
  const code = readCode(formData);
  if (!isUuid(factorId)) return { ok: false, message: "Recommencez l'activation." };
  if (!CODE.test(code)) return { ok: false, message: "Saisissez les 6 chiffres affichés par votre application." };
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { ok: false, message: "Code incorrect. Vérifiez l'heure de votre téléphone et saisissez le code affiché." };
  await supabase.rpc("log_event", { p_action: "auth.mfa_enabled", p_summary: "Double authentification activée" });
  revalidatePath("/securite");
  return { ok: true, message: "Double authentification activée : un code vous sera demandé à chaque connexion." };
}

/** Désactivation : session déjà vérifiée par code ; impossible si elle est obligatoire pour ce compte. */
export async function disableTotp(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const context = await getSessionContext();
  if (!context) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const state = await securityState();
  if (state?.mfa_required && state.sensitive) return { ok: false, message: "La double authentification est obligatoire pour votre rôle." };
  const code = readCode(formData);
  const { supabase, factor } = await verifiedTotp();
  if (!factor) return { ok: false, message: "La double authentification n'est pas activée." };
  if (!CODE.test(code)) return { ok: false, message: "Saisissez un code actuel pour confirmer." };
  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (verifyError) return { ok: false, message: "Code incorrect." };
  const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
  if (error) return { ok: false, message: "Désactivation impossible. Réessayez." };
  await supabase.rpc("log_event", { p_action: "auth.mfa_disabled", p_summary: "Double authentification désactivée" });
  revalidatePath("/securite");
  return { ok: true, message: "Double authentification désactivée." };
}

export async function revokeSession(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("session_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Session introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_my_session", { p_session: id });
  if (error) return { ok: false, message: error.message.includes("Session") || error.message.includes("Utilisez") ? error.message : "Impossible de fermer cette session." };
  revalidatePath("/securite");
  return { ok: true, message: "Appareil déconnecté." };
}

export async function signOutOtherDevices(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) return { ok: false, message: "Impossible de déconnecter les autres appareils." };
  await supabase.rpc("log_event", { p_action: "auth.sessions_revoked", p_summary: "Déconnexion de tous les autres appareils" });
  revalidatePath("/securite");
  return { ok: true, message: "Tous les autres appareils ont été déconnectés." };
}

/** Renvoie le lien d'activation de l'établissement (3 envois par heure au plus). */
export async function resendVerificationEmail(): Promise<ActionResult> {
  const context = await getSessionContext();
  if (!context?.organization || !context.user.email) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const supabase = await createClient();
  const { data } = await supabase.rpc("email_verification_state", { p_org: context.organization.id });
  const state = data as { pending: boolean; group_id: string | null } | null;
  if (!state?.pending) return { ok: true, message: "Adresse déjà vérifiée." };
  if ((await recentVerificationCount(context.user.id)) >= 3) return { ok: false, message: "Trop de demandes : réessayez dans une heure." };
  const orgId = state.group_id ?? context.organization.id;
  const org = context.organizations.find((o) => o.id === orgId) ?? context.organization;
  const sent = await sendVerificationEmail({
    userId: context.user.id,
    organizationId: orgId,
    email: context.user.email,
    firstName: context.profile?.first_name ?? undefined,
    orgName: org.name,
    baseUrl: await publicBaseUrl(),
  });
  return sent ? { ok: true, message: `Lien d'activation envoyé à ${context.user.email}.` } : { ok: false, message: "Envoi impossible pour le moment. Réessayez plus tard." };
}
