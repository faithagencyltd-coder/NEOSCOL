"use server";

import { revalidatePath, revalidateTag, updateTag } from "next/cache";

import { canWritePlatform, getPlatformRole, platformDeniedMessage } from "@/lib/auth/platform";
import { getSessionContext } from "@/lib/auth/session";
import { SITE_SETTINGS_TAG } from "@/lib/site-settings";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

import { HOME_SECTIONS, parseSystems } from "./site-web";

async function requirePlatformAdmin(): Promise<{ ok: true } | { ok: false; message: string }> {
  const context = await getSessionContext();
  if (!context) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const role = await getPlatformRole();
  const data = canWritePlatform(role);
  return data ? { ok: true } : { ok: false, message: platformDeniedMessage(role) };
}

function refresh() {
  updateTag(SITE_SETTINGS_TAG);
  revalidateTag(SITE_SETTINGS_TAG, { expire: 0 });
  revalidatePath("/plateforme/site-web");
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const int = (f: FormData, k: string) => {
  const n = Number(text(f, k));
  return Number.isInteger(n) ? n : 0;
};
const idOrNull = (f: FormData) => (isUuid(text(f, "id")) ? text(f, "id") : (null as never));

export async function saveSiteWebSettings(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const sections = Object.fromEntries(HOME_SECTIONS.map((s) => [s.key, formData.get(`section_${s.key}`) === "on"]));
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_save_site_web", {
    p_slogan: text(formData, "slogan"),
    p_slogan_en: text(formData, "slogan_en"),
    p_seo: text(formData, "seo_description"),
    p_seo_en: text(formData, "seo_description_en"),
    p_whatsapp_enabled: formData.get("whatsapp_enabled") === "on",
    p_whatsapp_message: text(formData, "whatsapp_message"),
    p_whatsapp_label: text(formData, "whatsapp_label"),
    p_whatsapp_position: formData.get("whatsapp_position") === "left" ? "left" : "right",
    p_home_sections: sections,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Réglages du site enregistrés." };
}

export async function saveSocialLink(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const url = text(formData, "url");
  if (!/^https:\/\/\S{4,}$/.test(url)) return { ok: false, message: "Adresse invalide : elle doit commencer par https://" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_save_social_link", {
    p_id: idOrNull(formData),
    p_network: text(formData, "network") || "other",
    p_label: text(formData, "label"),
    p_url: url,
    p_active: formData.get("is_active") === "on",
    p_sort: int(formData, "sort_order"),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Réseau enregistré." };
}

export async function saveCountryProfile(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const systems = parseSystems(text(formData, "systems"));
  if (!systems.ok) return { ok: false, message: systems.message };
  const availability = text(formData, "availability");
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_save_country_profile", {
    p_code: text(formData, "code"),
    p_displayed: formData.get("is_displayed") === "on",
    p_availability: ["configurable", "preparing", "available"].includes(availability) ? availability : "configurable",
    p_context: text(formData, "education_context"),
    p_context_en: text(formData, "education_context_en"),
    p_structure: text(formData, "academic_structure"),
    p_structure_en: text(formData, "academic_structure_en"),
    p_systems: systems.value,
    p_marketing: text(formData, "marketing_text"),
    p_marketing_en: text(formData, "marketing_text_en"),
    p_sort: int(formData, "sort_order") || 100,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Pays enregistré." };
}

export async function saveSiteVideo(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_save_site_video", {
    p_id: idOrNull(formData),
    p_topic: text(formData, "topic") || "other",
    p_title: text(formData, "title"),
    p_title_en: text(formData, "title_en"),
    p_description: text(formData, "description"),
    p_video_url: text(formData, "video_url"),
    p_poster_url: text(formData, "poster_url"),
    p_published: formData.get("is_published") === "on",
    p_sort: int(formData, "sort_order"),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Vidéo enregistrée." };
}

export async function saveTestimonial(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_save_testimonial", {
    p_id: idOrNull(formData),
    p_name: text(formData, "author_name"),
    p_role: text(formData, "author_role"),
    p_organization: text(formData, "organization"),
    p_quote: text(formData, "quote"),
    p_photo_url: text(formData, "photo_url"),
    p_consent: formData.get("consent_confirmed") === "on",
    p_published: formData.get("is_published") === "on",
    p_sort: int(formData, "sort_order"),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Témoignage enregistré." };
}

export async function updateLead(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const status = text(formData, "status");
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_update_lead", {
    p_id: text(formData, "id"),
    p_status: ["new", "in_progress", "done", "spam"].includes(status) ? status : "in_progress",
    p_note: text(formData, "admin_note"),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/plateforme/site-web");
  return { ok: true, message: "Demande mise à jour." };
}
