import "server-only";

import { createHash } from "node:crypto";

import { cookies } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils/search-params";

/**
 * Affiliation : le lien /r/<code> enregistre un clic en base et pose le cookie
 * « ns_ref » (identifiant aléatoire du clic, rien d'autre). À l'inscription d'un
 * établissement, le serveur relit ce clic EN BASE (affilié approuvé, durée
 * d'attribution) : modifier le cookie ne permet pas de s'attribuer une école.
 */
export const REF_COOKIE = "ns_ref";

export const ipHash = (ip: string) => createHash("sha256").update(`neoscool-affiliate:${ip}`).digest("hex");

export async function referralClickId(): Promise<string | null> {
  const v = (await cookies()).get(REF_COOKIE)?.value ?? "";
  return isUuid(v) ? v : null;
}

/** Champ « code de recommandation » à l'inscription : seulement si le programme et les codes sont actifs. */
export async function referralCodesEnabled(): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const { data } = await admin.from("affiliate_settings").select("enabled, codes_enabled").eq("id", 1).maybeSingle();
  return Boolean(data?.enabled && data.codes_enabled);
}

/** Attribution d'un établissement qui vient d'être créé (jamais bloquante pour l'inscription). */
export async function attributeSignup(input: { organizationId: string; userId: string; code: string | null; phone: string | null; ip: string }) {
  const admin = createAdminClient();
  if (!admin) return null;
  const click = await referralClickId();
  if (!click && !input.code) return null;
  const { data, error } = await admin.rpc("affiliate_attribute_signup", {
    p_org: input.organizationId,
    p_user: input.userId,
    p_click: click as string,
    p_code: (input.code ?? "") as string,
    p_phone: (input.phone ?? "") as string,
    p_ip_hash: ipHash(input.ip),
  });
  if (error) return null;
  (await cookies()).delete(REF_COOKIE);
  return data as { attributed: boolean; source?: string; flags?: string[]; reason?: string } | null;
}
