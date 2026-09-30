"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

const BADGE_PAGES = ["/formation/badges", "/universite/badges", "/eleves/cartes"];

function done(studentId: string | null, message: string): ActionResult {
  if (studentId) revalidatePath(`/eleves/${studentId}`);
  for (const path of BADGE_PAGES) revalidatePath(path);
  return { ok: true, message };
}

/** Génère la carte (badge + QR) d'un élève, apprenant ou étudiant actif. */
export async function issueCard(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("students.badges.manage");
  if (!auth.ok) return auth;
  const studentId = String(formData.get("student_id") ?? "");
  if (!isUuid(studentId)) return { ok: false, message: "Titulaire introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("issue_student_badge", { p_student_id: studentId });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done(studentId, "Carte générée : le QR code est actif à la tablette.");
}

/**
 * Régénère le QR code : l'ancienne carte est désactivée (elle ne scanne plus),
 * une nouvelle est émise avec un nouveau QR ; la date de validité est reprise.
 */
export async function regenerateCardQr(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("students.badges.manage");
  if (!auth.ok) return auth;
  const studentId = String(formData.get("student_id") ?? "");
  if (!isUuid(studentId)) return { ok: false, message: "Titulaire introuvable." };
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200) || "QR code régénéré";
  const supabase = await createClient();
  const { data: previous } = await supabase
    .from("student_badges")
    .select("valid_until")
    .eq("organization_id", auth.context.organization.id)
    .eq("student_id", studentId)
    .eq("status", "active")
    .maybeSingle();
  const { data: badgeId, error } = await supabase.rpc("issue_student_badge", { p_student_id: studentId, p_reason: reason });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  if (previous?.valid_until && badgeId) {
    await supabase.from("student_badges").update({ valid_until: previous.valid_until }).eq("id", badgeId);
  }
  return done(studentId, "Nouveau QR code généré. L'ancien ne fonctionne plus.");
}

/** Désactive la carte (perdue, volée) : elle ne scanne plus, l'historique est conservé. */
export async function revokeCard(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("students.badges.manage");
  if (!auth.ok) return auth;
  const studentId = String(formData.get("student_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);
  if (!isUuid(studentId)) return { ok: false, message: "Titulaire introuvable." };
  if (reason.length < 3) return { ok: false, message: "Indiquez le motif de désactivation.", fieldErrors: { reason: ["Motif obligatoire."] } };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("student_badges")
    .update({ status: "revoked", revoked_reason: reason }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("student_id", studentId)
    .eq("status", "active");
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error, "Aucune carte active à désactiver.") };
  return done(studentId, "Carte désactivée : elle ne peut plus être scannée.");
}

/** Date de validité imprimée sur la carte (vide = fin de l'année en cours). */
export async function setCardValidity(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("students.badges.manage");
  if (!auth.ok) return auth;
  const studentId = String(formData.get("student_id") ?? "");
  if (!isUuid(studentId)) return { ok: false, message: "Titulaire introuvable." };
  const raw = String(formData.get("valid_until") ?? "").trim();
  if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false, message: "Date invalide.", fieldErrors: { valid_until: ["Date invalide."] } };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("student_badges")
    .update({ valid_until: raw || null }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("student_id", studentId)
    .eq("status", "active");
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error, "Générez d'abord la carte.") };
  return done(studentId, raw ? "Date de validité enregistrée." : "Validité : fin de l'année en cours.");
}

/** Design des cartes de l'établissement (modèle, couleurs, textes du verso). Validé en base. */
export async function saveCardDesign(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("settings.manage");
  if (!auth.ok) return auth;
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const design = {
    template: text("template") || "prestige",
    primary: text("primary"),
    accent: text("accent"),
    slogan: text("slogan"),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    administration: text("administration"),
    notice: text("notice"),
    lost_text: text("lost_text"),
    show_photo: formData.get("show_photo") === "on" || formData.get("show_photo") === "true",
    show_barcode: formData.get("show_barcode") === "on" || formData.get("show_barcode") === "true",
    show_validity: formData.get("show_validity") === "on" || formData.get("show_validity") === "true",
    show_enrolled_on: formData.get("show_enrolled_on") === "on" || formData.get("show_enrolled_on") === "true",
  };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_card_design", { p_organization_id: auth.context.organization.id, p_design: design });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/parametres/cartes");
  return { ok: true, message: "Design des cartes enregistré." };
}

/** Génère les cartes manquantes de tous les inscrits actifs d'une classe, session ou promotion. */
export async function issueClassCards(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("students.badges.manage");
  if (!auth.ok) return auth;
  const classId = String(formData.get("class_id") ?? "");
  if (!isUuid(classId)) return { ok: false, message: "Choisissez une classe." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_session_badges", { p_class_id: classId });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done(null, data ? `${data} carte(s) générée(s).` : "Tous les inscrits ont déjà une carte active.");
}
