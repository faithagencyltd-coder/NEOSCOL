"use server";

import { headers } from "next/headers";

import { verifyTurnstileToken } from "@/lib/messaging/server";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";

import { validateLead } from "./lead";

/**
 * Demande de contact ou de démonstration depuis le site. Champ piège contre
 * les robots, anti-robot Turnstile si activé, limites anti-abus en base.
 */
export async function submitLead(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const locale = formData.get("locale") === "en" ? "en" : "fr";
  // Champ invisible rempli : robot. Réponse neutre, rien n'est enregistré.
  if (String(formData.get("website") ?? "").trim()) return { ok: true };
  const checked = validateLead(formData, locale);
  if (!checked.ok) return checked;
  const h = await headers();
  const captcha = await verifyTurnstileToken(String(formData.get("cf-turnstile-response") ?? ""), h.get("x-forwarded-for")?.split(",")[0]?.trim());
  if (captcha.required && !captcha.ok) {
    return { ok: false, message: locale === "en" ? "Please complete the anti-robot check." : "Merci de valider la vérification anti-robot." };
  }
  const supabase = await createClient();
  const v = checked.value;
  const { error } = await supabase.rpc("submit_site_lead", {
    p_kind: v.kind,
    p_full_name: v.fullName,
    p_email: v.email,
    p_phone: v.phone,
    p_organization: v.organization,
    p_organization_type: v.organizationType,
    p_country: v.country,
    p_message: v.message,
    p_locale: locale,
  });
  if (error) {
    return { ok: false, message: /Trop de demandes/.test(error.message) ? (locale === "en" ? "Too many requests. Please try again later." : error.message) : locale === "en" ? "Your request could not be sent." : "Votre demande n'a pas pu être envoyée." };
  }
  return { ok: true, message: "sent" };
}
