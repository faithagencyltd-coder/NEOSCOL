"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorize } from "@/lib/auth/authorize";
import { displayName } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

const PERSONAS = ["staff", "teacher", "parent", "student"] as const;

const announcementSchema = z.object({
  title: z.string().trim().min(3, { error: "Titre trop court." }).max(200),
  body: z.string().trim().min(3, { error: "Le message est vide." }).max(5000),
  personas: z.array(z.enum(PERSONAS)).min(1, { error: "Choisissez au moins un public." }),
  class_ids: z.array(z.uuid()).max(50),
  is_pinned: z.boolean(),
  publication: z.enum(["now", "draft", "scheduled"]),
  publish_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Créer / modifier une annonce ciblée (communication.announce) ; la publication notifie les destinataires. */
export async function saveAnnouncement(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("communication.announce");
  if (!auth.ok) return auth;
  const parsed = announcementSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    personas: formData.getAll("personas"),
    class_ids: formData.getAll("class_ids").filter(Boolean),
    is_pinned: formData.get("is_pinned") === "on",
    publication: formData.get("publication") ?? "now",
    publish_on: String(formData.get("publish_on") ?? "") || undefined,
    expires_on: String(formData.get("expires_on") ?? "") || undefined,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  const v = parsed.data;
  if (v.publication === "scheduled" && !v.publish_on) return { ok: false, message: "Indiquez la date de publication." };
  const publishedAt = v.publication === "now" ? new Date().toISOString() : v.publication === "scheduled" ? `${v.publish_on}T07:00:00Z` : null;
  const row = {
    organization_id: auth.context.organization.id,
    title: v.title,
    body: v.body,
    audience: { personas: v.personas, class_ids: v.class_ids },
    is_pinned: v.is_pinned,
    published_at: publishedAt,
    expires_at: v.expires_on ? `${v.expires_on}T23:59:59Z` : null,
    author_name: displayName(auth.context),
  };
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = isUuid(id)
    ? await supabase.from("announcements").update(row).eq("organization_id", auth.context.organization.id).eq("id", id)
    : await supabase.from("announcements").insert(row);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/communication");
  return { ok: true, message: publishedAt && v.publication === "now" ? "Annonce publiée : les destinataires sont notifiés." : "Annonce enregistrée." };
}

export async function deleteAnnouncement(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("communication.announce");
  if (!auth.ok) return auth;
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Annonce introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").delete().eq("organization_id", auth.context.organization.id).eq("id", id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/communication");
  return { ok: true, message: "Annonce supprimée." };
}

/** Nouvelle conversation : destinataires contrôlés en base selon le rôle. */
export async function startThread(_: ActionResult<{ threadId: string }> | null, formData: FormData): Promise<ActionResult<{ threadId: string }>> {
  const auth = await authorize("communication.message");
  if (!auth.ok) return auth;
  const recipients = formData.getAll("recipients").map(String).filter(isUuid);
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!recipients.length) return { ok: false, message: "Choisissez au moins un destinataire." };
  if (subject.length < 2 || body.length < 1) return { ok: false, message: "Objet et message sont obligatoires." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_thread", {
    p_organization_id: auth.context.organization.id,
    p_subject: subject.slice(0, 200),
    p_body: body.slice(0, 10000),
    p_recipients: recipients,
  });
  if (error || !data) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/messages");
  return { ok: true, message: "Message envoyé.", data: { threadId: data } };
}

/** Réponse dans une conversation (tout participant, y compris parents et élèves). */
export async function replyThread(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  const threadId = String(formData.get("thread_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!isUuid(threadId) || !body) return { ok: false, message: "Message vide." };
  const supabase = await createClient();
  const { error } = await supabase.from("messages").insert({ organization_id: auth.context.organization.id, thread_id: threadId, body: body.slice(0, 10000) });
  if (error) return { ok: false, message: dbErrorMessage(error, "Vous ne participez pas à cette conversation.") };
  revalidatePath("/messages");
  revalidatePath("/portail/messages");
  return { ok: true, message: "Réponse envoyée." };
}
