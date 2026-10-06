"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { newPasswordSchema } from "@/features/auth/schemas";
import { recentPublicVerificationCount, sendPublicAccountVerification, verificationRequired } from "@/lib/auth/email-verification";
import { clientIp } from "@/lib/auth/security";
import { getSessionContext } from "@/lib/auth/session";
import { verifyTurnstileToken } from "@/lib/messaging/server";
import { publicBaseUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

/**
 * Écosystème public : demandes d'information (sans compte), comptes de
 * particuliers, annonces, candidatures, favoris, signalements. La base
 * revérifie chaque règle (module ouvert, propriétaire, limites anti-abus).
 */

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const MAX_UPLOAD = 5 * 1024 * 1024;

/** Formulaire « Demander des informations » d'une fiche ou d'une campagne. */
export async function submitPublicLead(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  // Champ piège : robot → réponse neutre, rien n'est enregistré.
  if (text(formData, "website")) return { ok: true, message: "Demande envoyée." };
  const captcha = await verifyTurnstileToken(text(formData, "cf-turnstile-response") || null, await clientIp());
  if (captcha.required && !captcha.ok) return { ok: false, message: "Merci de valider la vérification anti-robot." };
  const name = text(formData, "full_name");
  if (name.length < 2) return { ok: false, message: "Indiquez votre nom." };
  const campaign = text(formData, "campaign_id");
  const { error } = await (await createClient()).rpc("submit_org_lead", {
    p_slug: text(formData, "slug"),
    p_name: name,
    p_phone: text(formData, "phone"),
    p_email: text(formData, "email"),
    p_program: text(formData, "program"),
    p_subject: text(formData, "subject") || "information",
    p_message: text(formData, "message"),
    p_source: text(formData, "source") || "profile",
    p_campaign: (isUuid(campaign) ? campaign : null) as string,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return { ok: true, message: "Demande envoyée : l'établissement vous recontactera." };
}

const accountSchema = z.object({
  first_name: z.string().trim().min(1, { error: "Prénom obligatoire." }).max(80),
  last_name: z.string().trim().min(1, { error: "Nom obligatoire." }).max(80),
  email: z.email({ error: "E-mail invalide." }),
  account_type: z.enum(["candidate", "parent", "teacher", "trainer", "other"], { error: "Profil invalide." }),
  country: z.string().trim().length(2, { error: "Pays obligatoire." }),
  city: z.string().trim().max(80).optional(),
});

/** Compte NeoScool d'un particulier (candidat, parent, enseignant…) pour Opportunities. */
export async function registerPublicAccount(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (text(formData, "website")) return { ok: true };
  const parsed = accountSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    email: text(formData, "email").toLowerCase(),
    account_type: formData.get("account_type"),
    country: text(formData, "country").toUpperCase(),
    city: text(formData, "city") || undefined,
  });
  const password = newPasswordSchema.safeParse({ password: formData.get("password"), confirmation: formData.get("confirmation") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  if (!password.success) return { ok: false, message: password.error.issues[0]?.message ?? "Mot de passe invalide." };
  const captcha = await verifyTurnstileToken(text(formData, "cf-turnstile-response") || null, await clientIp());
  if (!captcha.ok) return { ok: false, message: "Confirmez que vous n'êtes pas un robot, puis réessayez." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Inscription momentanément indisponible (configuration serveur)." };

  // Limite anti-abus : au plus 5 comptes par heure depuis une même connexion.
  const ipHash = createHash("sha256").update(`neoscool-public:${(await clientIp()) ?? "inconnue"}`).digest("hex");
  const { count } = await admin.from("audit_logs").select("id", { count: "exact", head: true }).eq("action", "auth.public_signup").eq("metadata->>ip_sha256", ipHash).gte("created_at", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= 5) return { ok: false, message: "Trop d'inscriptions depuis cette connexion. Réessayez dans une heure." };
  await admin.from("audit_logs").insert({ action: "auth.public_signup", summary: "Création d'un compte particulier", metadata: { ip_sha256: ipHash, source: "app" } });

  const { data: created, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: password.data.password,
    email_confirm: true,
    user_metadata: { first_name: parsed.data.first_name, last_name: parsed.data.last_name },
  });
  if (error || !created.user) {
    return { ok: false, message: /already|exists|registered/i.test(error?.message ?? "") ? "Un compte existe déjà avec cette adresse : connectez-vous." : "Création du compte impossible. Réessayez." };
  }
  await admin.from("profiles").update({ first_name: parsed.data.first_name, last_name: parsed.data.last_name }).eq("id", created.user.id);
  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email: parsed.data.email, password: password.data.password });
  const { error: accountError } = await supabase.rpc("register_public_account", { p_type: parsed.data.account_type, p_country: parsed.data.country, p_city: parsed.data.city ?? "" });
  if (accountError) return { ok: false, message: dbErrorMessage(accountError) };
  // Confirmation de l'adresse quand la plateforme l'exige (et seulement si l'e-mail part vraiment).
  if (await verificationRequired()) {
    const sent = await sendPublicAccountVerification({ userId: created.user.id, email: parsed.data.email, firstName: parsed.data.first_name, baseUrl: await publicBaseUrl() });
    if (sent) await admin.from("public_accounts").update({ email_verification: "pending" }).eq("user_id", created.user.id);
  }
  redirect(safeNext(text(formData, "next")) ?? "/espace");
}

/** Renvoie le lien de confirmation de l'adresse (3 envois par heure au plus). */
export async function resendPublicAccountEmail(): Promise<ActionResult> {
  const context = await getSessionContext();
  if (!context?.user.email) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const { data: state } = await (await createClient()).rpc("my_public_account_email_state");
  if (state !== "pending") return { ok: true, message: "Adresse déjà confirmée." };
  if ((await recentPublicVerificationCount(context.user.id)) >= 3) return { ok: false, message: "Trop de demandes : réessayez dans une heure." };
  const sent = await sendPublicAccountVerification({ userId: context.user.id, email: context.user.email, firstName: context.profile?.first_name ?? undefined, baseUrl: await publicBaseUrl() });
  return sent ? { ok: true, message: `Lien de confirmation envoyé à ${context.user.email}.` } : { ok: false, message: "Envoi impossible pour le moment. Réessayez plus tard." };
}

/** Profil « Opportunities » d'un compte déjà existant (personnel d'établissement, parent…). */
export async function completePublicAccount(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!(await getSessionContext())) return { ok: false, message: "Connectez-vous d'abord." };
  const { error } = await (await createClient()).rpc("register_public_account", {
    p_type: text(formData, "account_type"),
    p_country: text(formData, "country").toUpperCase(),
    p_city: text(formData, "city"),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/espace");
  return { ok: true, message: "Profil enregistré." };
}

function safeNext(value: string): string | null {
  return value.startsWith("/") && !value.startsWith("//") ? value : null;
}

const fields = ["category", "title", "description", "country", "city", "location", "subject", "level", "compensation", "contract", "schedule", "starts_on", "expires_at", "visibility", "organization_id"] as const;

/** Annonce (particulier ou établissement) : brouillon ou publication (modération éventuelle). */
export async function saveOpportunity(_: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  if (!(await getSessionContext())) return { ok: false, message: "Connectez-vous pour publier." };
  const data = Object.fromEntries(fields.map((f) => [f, text(formData, f)]));
  const id = text(formData, "id");
  const { data: saved, error } = await (await createClient()).rpc("save_opportunity", {
    p_id: (isUuid(id) ? id : null) as string,
    p_data: data,
    p_submit: formData.get("submit") !== "draft",
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/espace");
  revalidatePath("/opportunites");
  revalidatePath("/visibilite/opportunites");
  return { ok: true, message: formData.get("submit") === "draft" ? "Brouillon enregistré." : "Annonce envoyée : publiée, ou en attente de validation par NeoScool.", data: { id: saved as string } };
}

export async function archiveOpportunity(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const id = text(formData, "id");
  if (!isUuid(id)) return { ok: false, message: "Annonce introuvable." };
  const { error } = await (await createClient()).rpc("archive_opportunity", { p_id: id });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/espace");
  revalidatePath("/visibilite/opportunites");
  return { ok: true, message: "Annonce archivée." };
}

/** Candidature / réponse avec CV facultatif (PDF, JPEG ou PNG, 5 Mo). */
export async function applyOpportunity(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!(await getSessionContext())) return { ok: false, message: "Connectez-vous pour répondre." };
  const id = text(formData, "opportunity_id");
  if (!isUuid(id)) return { ok: false, message: "Annonce introuvable." };
  const supabase = await createClient();
  let cv: string | null = null;
  const file = formData.get("cv");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD) return { ok: false, message: "Fichier trop volumineux (5 Mo maximum)." };
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = bytes.subarray(0, 4).toString("hex") === "25504446" ? "application/pdf" : bytes.subarray(0, 4).toString("hex") === "89504e47" ? "image/png" : bytes.subarray(0, 3).toString("hex") === "ffd8ff" ? "image/jpeg" : null;
    if (!mime) return { ok: false, message: "Formats acceptés : PDF, JPEG ou PNG." };
    const { data, error } = await supabase.rpc("upload_opportunity_file", { p_name: file.name || "cv", p_mime: mime, p_content: `\\x${bytes.toString("hex")}` });
    if (error) return { ok: false, message: dbErrorMessage(error) };
    cv = data as string;
  }
  const { error } = await supabase.rpc("apply_opportunity", { p_id: id, p_message: text(formData, "message"), p_cv: cv as string });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/opportunites/${id}`);
  revalidatePath("/espace");
  return { ok: true, message: "Réponse envoyée. Suivez-la dans « Mon espace »." };
}

export async function updateApplication(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const id = text(formData, "application_id");
  if (!isUuid(id)) return { ok: false, message: "Candidature introuvable." };
  const supabase = await createClient();
  const status = text(formData, "status");
  if (status) {
    const { error } = await supabase.rpc("update_application_status", { p_application: id, p_status: status, p_note: text(formData, "note") });
    if (error) return { ok: false, message: dbErrorMessage(error) };
  }
  const body = text(formData, "body");
  if (body) {
    const { error } = await supabase.rpc("add_application_message", { p_application: id, p_body: body });
    if (error) return { ok: false, message: dbErrorMessage(error) };
  }
  revalidatePath("/espace", "layout");
  revalidatePath("/visibilite/opportunites");
  return { ok: true, message: status ? "Statut mis à jour." : "Message envoyé." };
}

export async function toggleFavorite(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!(await getSessionContext())) return { ok: false, message: "Connectez-vous pour enregistrer un favori." };
  const id = text(formData, "opportunity_id");
  const { data, error } = await (await createClient()).rpc("toggle_opportunity_favorite", { p_id: id });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/opportunites/${id}`);
  return { ok: true, message: data ? "Ajouté à vos favoris." : "Retiré de vos favoris." };
}

export async function reportContent(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!(await getSessionContext())) return { ok: false, message: "Connectez-vous pour signaler un contenu." };
  const target = text(formData, "target_id");
  if (!isUuid(target)) return { ok: false, message: "Contenu introuvable." };
  const { error } = await (await createClient()).rpc("submit_content_report", {
    p_type: text(formData, "target_type"),
    p_target: target,
    p_reason: text(formData, "reason"),
    p_details: text(formData, "details"),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return { ok: true, message: "Signalement transmis à l'équipe NeoScool. Merci." };
}
