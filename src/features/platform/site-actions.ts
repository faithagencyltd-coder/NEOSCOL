"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath, revalidateTag, updateTag } from "next/cache";

import { canWritePlatform, getPlatformRole, platformDeniedMessage } from "@/lib/auth/platform";
import { getSessionContext } from "@/lib/auth/session";
import { SITE_SETTINGS_TAG } from "@/lib/site-settings";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";

import { validatePrimaryColor } from "./brand";

async function requirePlatformAdmin(): Promise<{ ok: true } | { ok: false; message: string }> {
  const context = await getSessionContext();
  if (!context) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const role = await getPlatformRole();
  const data = canWritePlatform(role);
  return data ? { ok: true } : { ok: false, message: platformDeniedMessage(role) };
}

/** Rafraîchit immédiatement les pages qui affichent ces réglages. */
function refresh() {
  updateTag(SITE_SETTINGS_TAG);
  revalidateTag(SITE_SETTINGS_TAG, { expire: 0 });
  revalidatePath("/", "layout");
}

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

export async function saveSiteContacts(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const whatsapp = text(formData, "whatsapp").replace(/\D/g, "");
  if (whatsapp && (whatsapp.length < 8 || whatsapp.length > 15)) {
    return { ok: false, message: "Numéro WhatsApp invalide : indicatif du pays puis numéro, par exemple 229 01 90 00 00 00." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_save_site_contacts", {
    p_email: text(formData, "contact_email"),
    p_phone: text(formData, "contact_phone"),
    p_whatsapp: whatsapp,
    p_address: text(formData, "address"),
    p_hours: text(formData, "support_hours"),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Coordonnées enregistrées." };
}

export async function saveSiteFaq(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const questions = formData.getAll("q").map(String);
  const answers = formData.getAll("a").map(String);
  const faq = questions.map((q, i) => ({ q: q.trim(), a: (answers[i] ?? "").trim() })).filter((x) => x.q || x.a);
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_save_site_faq", { p_faq: faq });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: faq.length ? `${faq.length} question(s) publiée(s).` : "Questions d'origine rétablies." };
}

export async function saveSiteLegal(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_save_site_legal", { p_terms: text(formData, "terms"), p_privacy: text(formData, "privacy") });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Textes publiés." };
}

/** Détecte le format réel de l'image (octets de tête), sans se fier au nom du fichier. */
function imageKind(bytes: Uint8Array): "png" | "jpg" | "webp" | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "webp";
  return null;
}

/**
 * Couleur principale et logo. intent : save (couleur), logo (nouveau logo),
 * reset_color, reset_logo. Un logo remplacé reste conservé dans le stockage.
 */
export async function saveSiteBrand(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const supabase = await createClient();
  const { data: current } = await supabase.from("platform_site_settings").select("primary_color, logo_path").eq("id", 1).single();
  let color = current?.primary_color ?? null;
  let logo = current?.logo_path ?? null;
  const intent = text(formData, "intent");

  if (intent === "reset_color") color = null;
  else if (intent === "reset_logo") logo = null;
  else if (intent === "logo") {
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choisissez une image." };
    if (file.size > 1024 * 1024) return { ok: false, message: "Image trop lourde (1 Mo au maximum)." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = imageKind(bytes);
    if (!kind) return { ok: false, message: "Format non accepté : PNG, JPEG ou WebP uniquement." };
    const path = `logo/${randomUUID()}.${kind}`;
    const { error: uploadError } = await supabase.storage
      .from("platform-assets")
      .upload(path, bytes, { contentType: kind === "jpg" ? "image/jpeg" : `image/${kind}`, upsert: false });
    if (uploadError) return { ok: false, message: `Envoi du logo impossible : ${uploadError.message}` };
    logo = path;
  } else {
    const checked = validatePrimaryColor(text(formData, "primary_color"));
    if (!checked.ok) return checked;
    color = checked.color;
  }

  const { error } = await supabase.rpc("platform_save_site_brand", { p_primary_color: color ?? "", p_logo_path: logo ?? "" });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  const messages: Record<string, string> = {
    reset_color: "Couleur d'origine rétablie.",
    reset_logo: "Logo d'origine rétabli.",
    logo: "Nouveau logo en ligne.",
  };
  return { ok: true, message: messages[intent] ?? "Couleur enregistrée." };
}
