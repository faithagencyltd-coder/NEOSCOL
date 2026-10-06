import "server-only";

import { randomBytes } from "node:crypto";

import { sha256 } from "@/lib/auth/security";
import { loadIntegration, sendEmail } from "@/lib/messaging/server";
import { createAdminClient } from "@/lib/supabase/admin";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Vérification de l'adresse e-mail d'un nouvel établissement : l'établissement
 * reste en lecture seule (contrôlé en base) jusqu'au clic sur le lien (jeton
 * haché en base, usage unique, 48 h). Exigée seulement si la plateforme l'impose
 * ET si l'envoi d'e-mails est configuré : sinon l'établissement est actif
 * immédiatement (repli : jamais d'établissement bloqué faute d'e-mail).
 */
export async function verificationRequired(): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const { data } = await admin.from("platform_security_settings").select("email_verification_required").eq("id", 1).maybeSingle();
  if (!data?.email_verification_required) return false;
  return Boolean(await loadIntegration("brevo_email"));
}

export async function sendVerificationEmail(args: { userId: string; organizationId: string; email: string; firstName?: string; orgName: string; baseUrl: string }): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const token = randomBytes(32).toString("base64url");
  const { error } = await admin.from("email_verification_tokens").insert({
    user_id: args.userId,
    organization_id: args.organizationId,
    token_hash: sha256(token),
    expires_at: new Date(Date.now() + 48 * 3600_000).toISOString(),
  });
  if (error) return false;
  const link = `${args.baseUrl}/verification-email?jeton=${token}`;
  const hello = args.firstName ? `Bonjour ${escape(args.firstName)},` : "Bonjour,";
  const result = await sendEmail(
    {
      to: args.email,
      subject: "Activez votre établissement sur NeoScool",
      html: `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;background:#f4f7fb;padding:24px;color:#0b1f4d">
<div style="max-width:520px;margin:auto;background:#fff;border-radius:16px;padding:28px">
<h1 style="font-size:20px;margin:0 0 16px"><span style="color:#f7931e">.</span><span style="color:#0b2e6f">Neo</span><span style="color:#1666e0">Scool</span></h1><p>${hello}</p>
<p>Confirmez votre adresse e-mail pour activer <strong>${escape(args.orgName)}</strong>. Le lien est valable 48 heures.</p>
<p style="margin:28px 0"><a href="${escape(link)}" style="background:#1d63ed;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:600">Activer mon établissement</a></p>
<p style="color:#64748b;font-size:12px">Si vous n'êtes pas à l'origine de cette inscription, ignorez cet e-mail.</p></div></body></html>`,
      text: `${hello}\n\nConfirmez votre adresse e-mail pour activer ${args.orgName} (lien valable 48 heures) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette inscription, ignorez cet e-mail.`,
    },
    { organizationId: args.organizationId, purpose: "email_verification", userId: args.userId },
  );
  return result.ok;
}

/** Nombre de liens envoyés dans l'heure (anti-abus du bouton « Renvoyer »). */
export async function recentVerificationCount(userId: string): Promise<number> {
  const admin = createAdminClient();
  if (!admin) return 0;
  const { count } = await admin
    .from("email_verification_tokens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", new Date(Date.now() - 3600_000).toISOString());
  return count ?? 0;
}

/**
 * Compte particulier (NeoScool Opportunities) : lien de confirmation de l'adresse.
 * Renvoie true seulement si l'e-mail est réellement parti ; le compte n'est mis
 * « en attente » que dans ce cas (jamais de compte bloqué faute d'e-mail).
 */
export async function sendPublicAccountVerification(args: { userId: string; email: string; firstName?: string; baseUrl: string }): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const token = randomBytes(32).toString("base64url");
  const { error } = await admin.from("public_account_email_tokens").insert({ user_id: args.userId, token_hash: sha256(token), expires_at: new Date(Date.now() + 48 * 3600_000).toISOString() });
  if (error) return false;
  const link = `${args.baseUrl}/verification-email?jeton=${token}`;
  const hello = args.firstName ? `Bonjour ${escape(args.firstName)},` : "Bonjour,";
  const result = await sendEmail(
    {
      to: args.email,
      subject: "Confirmez votre adresse e-mail — NeoScool",
      html: `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;background:#f4f7fb;padding:24px;color:#0b1f4d">
<div style="max-width:520px;margin:auto;background:#fff;border-radius:16px;padding:28px">
<h1 style="font-size:20px;margin:0 0 16px"><span style="color:#f7931e">.</span><span style="color:#0b2e6f">Neo</span><span style="color:#1666e0">Scool</span></h1><p>${hello}</p>
<p>Confirmez votre adresse e-mail pour répondre aux annonces et publier sur NeoScool Opportunities. Le lien est valable 48 heures.</p>
<p style="margin:28px 0"><a href="${escape(link)}" style="background:#1d63ed;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:600">Confirmer mon adresse</a></p>
<p style="color:#64748b;font-size:12px">Si vous n'êtes pas à l'origine de cette inscription, ignorez cet e-mail.</p></div></body></html>`,
      text: `${hello}\n\nConfirmez votre adresse e-mail (lien valable 48 heures) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette inscription, ignorez cet e-mail.`,
    },
    { purpose: "email_verification", userId: args.userId },
  );
  return result.ok;
}

/** Liens envoyés dans l'heure à un compte particulier (anti-abus du bouton « Renvoyer »). */
export async function recentPublicVerificationCount(userId: string): Promise<number> {
  const admin = createAdminClient();
  if (!admin) return 0;
  const { count } = await admin.from("public_account_email_tokens").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", new Date(Date.now() - 3600_000).toISOString());
  return count ?? 0;
}
