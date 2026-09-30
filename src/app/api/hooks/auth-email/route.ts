import { NextResponse } from "next/server";

import { publicEnv } from "@/lib/env";
import { sendEmail } from "@/lib/messaging/server";
import { verifyStandardWebhook } from "@/lib/messaging/webhook";

/**
 * « Send Email Hook » de Supabase Auth : les e-mails d'authentification
 * (confirmation d'adresse, mot de passe oublié, invitation, lien magique,
 * changement d'adresse) partent par l'intégration e-mail de NEOSCOOL (Brevo).
 * Signature « Standard Webhooks » vérifiée avec SEND_EMAIL_HOOK_SECRET.
 * Activation : supabase/config.toml ([auth.hook.send_email]) ou tableau de bord Supabase.
 */
type HookPayload = {
  user: { email?: string; new_email?: string; user_metadata?: { first_name?: string } };
  email_data: { token: string; token_hash: string; redirect_to: string; email_action_type: string; site_url: string; token_new?: string; token_hash_new?: string };
};

const SUBJECTS: Record<string, { subject: string; intro: string; cta: string }> = {
  signup: { subject: "Confirmez votre adresse e-mail — NEOSCOOL", intro: "Confirmez votre adresse pour activer votre compte NEOSCOOL.", cta: "Confirmer mon adresse" },
  recovery: { subject: "Réinitialisation de votre mot de passe — NEOSCOOL", intro: "Vous avez demandé à réinitialiser votre mot de passe.", cta: "Choisir un nouveau mot de passe" },
  invite: { subject: "Invitation à rejoindre NEOSCOOL", intro: "Vous êtes invité(e) à rejoindre votre établissement sur NEOSCOOL.", cta: "Accepter l'invitation" },
  magiclink: { subject: "Votre lien de connexion — NEOSCOOL", intro: "Voici votre lien de connexion à NEOSCOOL.", cta: "Me connecter" },
  email_change: { subject: "Confirmez votre nouvelle adresse — NEOSCOOL", intro: "Confirmez le changement d'adresse e-mail de votre compte NEOSCOOL.", cta: "Confirmer la nouvelle adresse" },
  reauthentication: { subject: "Code de vérification — NEOSCOOL", intro: "Voici votre code de vérification.", cta: "" },
};

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function render(action: string, link: string, token: string, name?: string) {
  const t = SUBJECTS[action] ?? SUBJECTS.magiclink!;
  const hello = name ? `Bonjour ${escape(name)},` : "Bonjour,";
  const button = t.cta
    ? `<p style="margin:28px 0"><a href="${escape(link)}" style="background:#1d63ed;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:600">${t.cta}</a></p>`
    : "";
  const html = `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;background:#f4f7fb;padding:24px;color:#0b1f4d">
<div style="max-width:520px;margin:auto;background:#fff;border-radius:16px;padding:28px">
<h1 style="font-size:20px;margin:0 0 16px">NEOSCOOL</h1><p>${hello}</p><p>${t.intro}</p>${button}
<p>Code : <strong style="font-size:18px;letter-spacing:3px">${escape(token)}</strong></p>
<p style="color:#64748b;font-size:12px">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : rien ne sera modifié.</p></div></body></html>`;
  const text = `${hello}\n\n${t.intro}\n${t.cta ? `${t.cta} : ${link}\n` : ""}Code : ${token}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`;
  return { subject: t.subject, html, text };
}

export async function POST(request: Request) {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET ?? "";
  const body = await request.text();
  const valid = verifyStandardWebhook(
    body,
    { id: request.headers.get("webhook-id"), timestamp: request.headers.get("webhook-timestamp"), signature: request.headers.get("webhook-signature") },
    secret,
  );
  if (!valid) return NextResponse.json({ error: { http_code: 401, message: "Signature invalide." } }, { status: 401 });

  let payload: HookPayload;
  try {
    payload = JSON.parse(body) as HookPayload;
  } catch {
    return NextResponse.json({ error: { http_code: 400, message: "Requête invalide." } }, { status: 400 });
  }
  const { user, email_data: data } = payload;
  const to = user?.email;
  if (!to || !data?.email_action_type) return NextResponse.json({ error: { http_code: 400, message: "Requête invalide." } }, { status: 400 });

  // Lien de vérification standard de Supabase Auth (le jeton reste vérifié par Supabase).
  const verify = (hash: string) =>
    `${publicEnv.supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(hash)}&type=${encodeURIComponent(data.email_action_type)}&redirect_to=${encodeURIComponent(data.redirect_to || data.site_url)}`;
  const name = user.user_metadata?.first_name;
  const sends = [{ to, ...render(data.email_action_type, verify(data.token_hash), data.token, name) }];
  // Changement d'adresse sécurisé : un e-mail à chaque adresse.
  if (data.email_action_type === "email_change" && user.new_email && data.token_hash_new) {
    sends.push({ to: user.new_email, ...render("email_change", verify(data.token_hash_new), data.token_new ?? "", name) });
  }
  for (const message of sends) {
    const result = await sendEmail(message, { purpose: `auth_${data.email_action_type}`.replace(/[^a-z_]/g, "").slice(0, 40) });
    if (!result.ok) return NextResponse.json({ error: { http_code: 500, message: "Envoi de l'e-mail impossible pour le moment." } }, { status: 500 });
  }
  return NextResponse.json({});
}
