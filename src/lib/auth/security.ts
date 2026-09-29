import "server-only";

import { createHash } from "node:crypto";

import { headers } from "next/headers";

import { turnstileSettings, verifyTurnstileToken } from "@/lib/messaging/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Protection des connexions : verrouillage progressif du compte, anti-robot
 * (Turnstile) après des échecs, contrôles faits côté serveur. Identifiant et
 * adresse IP sont hachés : jamais stockés en clair.
 */
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function clientIp(): Promise<string | undefined> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
}

export type LoginGate =
  | { ok: true; identifierHash: string; ipHash: string | null }
  | { ok: false; message: string; captcha?: boolean };

/** Avant la tentative : compte verrouillé ? anti-robot exigé et valide ? */
export async function checkLoginGate(identifier: string, captchaToken: string | null): Promise<LoginGate> {
  const identifierHash = sha256(`neoscol-login:${identifier.trim().toLowerCase()}`);
  const ip = await clientIp();
  const ipHash = ip ? sha256(`neoscol-ip:${ip}`) : null;
  const admin = createAdminClient();
  if (!admin) return { ok: true, identifierHash, ipHash };
  const { data } = await admin.rpc("login_guard", { p_identifier_hash: identifierHash, p_ip_hash: ipHash as string });
  const guard = (data ?? {}) as { locked?: boolean; locked_until?: string; captcha?: boolean };
  if (guard.locked) {
    const minutes = guard.locked_until ? Math.max(1, Math.ceil((new Date(guard.locked_until).getTime() - Date.now()) / 60000)) : null;
    return { ok: false, message: `Compte temporairement verrouillé après plusieurs échecs${minutes ? ` : réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}` : ""}. Vous pouvez aussi réinitialiser votre mot de passe.` };
  }
  const turnstile = await turnstileSettings();
  if (turnstile && (guard.captcha || turnstile.mode === "always")) {
    const check = await verifyTurnstileToken(captchaToken, ip);
    if (!check.ok) return { ok: false, captcha: true, message: "Confirmez que vous n'êtes pas un robot, puis réessayez." };
  }
  return { ok: true, identifierHash, ipHash };
}

export async function recordLoginAttempt(gate: { identifierHash: string; ipHash: string | null }, success: boolean) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.rpc("login_record", { p_identifier_hash: gate.identifierHash, p_ip_hash: gate.ipHash as string, p_success: success });
}

export type SecurityState = { mfa_enrolled: boolean; aal: string; platform_admin: boolean; sensitive: boolean; mfa_required: boolean };

export async function securityState(): Promise<SecurityState | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_security_state");
  return (data as SecurityState | null) ?? null;
}

/**
 * Double authentification : « verify » si la session doit être élevée (code
 * TOTP attendu), « enroll » si elle est obligatoire pour ce compte mais pas
 * encore activée, sinon null.
 */
export async function mfaRequirement(): Promise<"verify" | "enroll" | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data && data.nextLevel === "aal2" && data.currentLevel !== "aal2") return "verify";
  const state = await securityState();
  if (state?.mfa_required && state.sensitive && !state.mfa_enrolled) return "enroll";
  return null;
}
