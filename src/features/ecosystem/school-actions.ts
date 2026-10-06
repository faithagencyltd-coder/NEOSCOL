"use server";

import { revalidatePath } from "next/cache";

import { storeUpload } from "@/features/files/server";
import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

/**
 * Écosystème public, côté établissement : fiche Discover, images, vérification,
 * demandes reçues, campagnes, visibilité, publicité externe. Droits revérifiés
 * par la base (Paramètres, Inscriptions, Communication, Personnel) et module ouvert.
 */

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const refresh = () => revalidatePath("/visibilite", "layout");
const SOCIALS = ["facebook", "instagram", "tiktok", "whatsapp", "linkedin", "youtube"] as const;

/** Formations : une par ligne, « Nom — description » (la description est facultative). */
function parsePrograms(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100)
    .map((line) => {
      const [name, ...rest] = line.split(/\s+[—–-]\s+/);
      return { name: name!.slice(0, 160), description: rest.join(" — ").slice(0, 400) || null };
    });
}

export async function savePublicProfile(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("settings.manage");
  if (!auth.ok) return auth;
  const socials: Record<string, string> = Object.fromEntries(SOCIALS.map((k) => [k, text(formData, `social_${k}`)] as const).filter(([, v]) => v));
  if (Object.values(socials).some((v) => !/^https?:\/\//i.test(v) && !/^\+?[0-9 ]{6,20}$/.test(v))) {
    return { ok: false, message: "Réseaux sociaux : indiquez une adresse complète (https://…) ou un numéro WhatsApp." };
  }
  const data = {
    slug: text(formData, "slug"),
    tagline: text(formData, "tagline"),
    description: text(formData, "description"),
    address: text(formData, "address"),
    city: text(formData, "city"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
    website: text(formData, "website"),
    socials,
    admission: text(formData, "admission"),
    enrollment_period: text(formData, "enrollment_period"),
    start_date: text(formData, "start_date"),
    extra: text(formData, "extra"),
    enrollment_url: text(formData, "enrollment_url"),
    programs: parsePrograms(text(formData, "programs")),
    cover_file_id: isUuid(text(formData, "cover_file_id")) ? text(formData, "cover_file_id") : "",
    gallery: formData.getAll("gallery").map(String).filter(isUuid).slice(0, 12),
    translations: {
      en: Object.fromEntries((["tagline", "description", "admission"] as const).map((k) => [k, text(formData, `${k}_en`)]).filter(([, v]) => v)),
    },
  };
  const { error } = await (await createClient()).rpc("save_public_profile", { p_org: auth.context.organization.id, p_data: data, p_publish: formData.get("publish") === "on" || formData.get("publish") === "true" });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: formData.get("publish") ? "Fiche enregistrée et publiée (ou en attente de validation par NeoScool)." : "Fiche enregistrée (non publiée)." };
}

/** Image de la bibliothèque publique (couverture, galerie, campagnes) : vraies photos de l'établissement. */
export async function uploadPublicMedia(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("settings.manage", "communication.send");
  if (!auth.ok) return auth;
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "Aucun fichier sélectionné." };
  const stored = await storeUpload(await createClient(), { organizationId: auth.context.organization.id, file, owner: "organization", category: "public", accept: ["image"] });
  if (!stored.ok) return stored;
  refresh();
  return { ok: true, message: "Image ajoutée à la bibliothèque." };
}

/** Demande de vérification : une pièce par exigence (PDF ou image). */
export async function submitVerification(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("settings.manage");
  if (!auth.ok) return auth;
  const supabase = await createClient();
  const documents: { requirement_id: string; file_id: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("doc_") || !(value instanceof File) || value.size === 0) continue;
    const requirement = key.slice(4);
    if (!isUuid(requirement)) continue;
    const stored = await storeUpload(supabase, { organizationId: auth.context.organization.id, file: value, owner: "organization", category: "verification", accept: ["pdf", "image"] });
    if (!stored.ok) return stored;
    documents.push({ requirement_id: requirement, file_id: stored.id });
  }
  const { error } = await supabase.rpc("submit_verification_request", { p_org: auth.context.organization.id, p_documents: documents, p_message: text(formData, "message") });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Demande de vérification envoyée à NeoScool." };
}

export async function updateLead(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("enrollments.manage");
  if (!auth.ok) return auth;
  const id = text(formData, "id");
  if (!isUuid(id)) return { ok: false, message: "Demande introuvable." };
  const { error } = await (await createClient()).rpc("update_org_lead", {
    p_id: id,
    p_status: text(formData, "status"),
    p_assign_me: formData.get("assign_me") === "on" || formData.get("assign_me") === "true",
    p_event_kind: text(formData, "event_kind") || "note",
    p_event_body: text(formData, "event_body"),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Suivi enregistré." };
}

export async function saveCampaign(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("communication.send");
  if (!auth.ok) return auth;
  const id = text(formData, "id");
  const list = (key: string) => text(formData, key).split(",").map((s) => s.trim()).filter(Boolean);
  const data = {
    title: text(formData, "title"),
    description: text(formData, "description"),
    objective: text(formData, "objective"),
    target: text(formData, "target"),
    media: formData.getAll("media").map(String).filter(isUuid).slice(0, 6),
    countries: list("countries").map((c) => c.toUpperCase()),
    cities: list("cities"),
    audience: text(formData, "audience"),
    starts_on: text(formData, "starts_on"),
    ends_on: text(formData, "ends_on"),
    budget_amount: text(formData, "budget_amount").replace(/\D/g, ""),
    budget_currency: text(formData, "budget_amount") ? auth.context.organization.currency : "",
    destination_url: text(formData, "destination_url"),
    contact: text(formData, "contact"),
  };
  const { error } = await (await createClient()).rpc("save_promo_campaign", {
    p_org: auth.context.organization.id,
    p_id: (isUuid(id) ? id : null) as string,
    p_data: data,
    p_submit: formData.get("submit") === "on" || formData.get("submit") === "true",
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: formData.get("submit") ? "Campagne envoyée : publiée, ou en attente de validation par NeoScool." : "Brouillon enregistré." };
}

export async function endCampaign(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("communication.send");
  if (!auth.ok) return auth;
  const { error } = await (await createClient()).rpc("end_promo_campaign", { p_org: auth.context.organization.id, p_id: text(formData, "id") });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Campagne terminée." };
}

export async function orderVisibility(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("settings.manage", "communication.send", "staff.manage");
  if (!auth.ok) return auth;
  const { error } = await (await createClient()).rpc("create_visibility_order", {
    p_offer: text(formData, "offer_id"),
    p_target_type: text(formData, "target_type"),
    p_target: text(formData, "target_id"),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Commande enregistrée : elle sera appliquée dès que NeoScool aura confirmé votre paiement." };
}

export async function cancelVisibilityOrder(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { error } = await (await createClient()).rpc("cancel_visibility_order", { p_order: text(formData, "id") });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Commande annulée." };
}

export async function saveAdRequest(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("communication.send");
  if (!auth.ok) return auth;
  const id = text(formData, "id");
  const list = (key: string) => text(formData, key).split(",").map((s) => s.trim()).filter(Boolean);
  const { error } = await (await createClient()).rpc("save_ad_request", {
    p_org: auth.context.organization.id,
    p_id: (isUuid(id) ? id : null) as string,
    p_data: {
      mode: text(formData, "mode"),
      platform: text(formData, "platform"),
      campaign_id: text(formData, "campaign_id"),
      objective: text(formData, "objective"),
      countries: list("countries").map((c) => c.toUpperCase()),
      cities: list("cities"),
      audience: text(formData, "audience"),
      starts_on: text(formData, "starts_on"),
      ends_on: text(formData, "ends_on"),
      budget_amount: text(formData, "budget_amount").replace(/\D/g, ""),
      budget_currency: text(formData, "budget_amount") ? auth.context.organization.currency : "",
    },
    p_submit: formData.get("submit") === "on" || formData.get("submit") === "true",
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Demande enregistrée." };
}

export async function adRequestAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("communication.send");
  if (!auth.ok) return auth;
  const action = text(formData, "action");
  const results = action === "results" ? Object.fromEntries((["impressions", "clicks", "leads", "spend"] as const).map((k) => [k, Number(text(formData, k).replace(/\D/g, "") || 0)])) : null;
  const { error } = await (await createClient()).rpc("school_ad_request_action", {
    p_org: auth.context.organization.id,
    p_id: text(formData, "id"),
    p_action: action,
    p_results: results as Record<string, number>,
    p_source: text(formData, "source"),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: action === "validate" ? "Plan validé : NeoScool peut lancer la campagne." : action === "cancel" ? "Demande annulée." : "Résultats enregistrés." };
}
