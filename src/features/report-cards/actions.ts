"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { storeUpload } from "@/features/files/server";
import { reportConfigSchema } from "@/features/report-cards/config";
import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

function ids(formData: FormData) {
  const classId = String(formData.get("class_id") ?? "");
  const periodId = String(formData.get("period_id") ?? "");
  return isUuid(classId) && isUuid(periodId) ? { classId, periodId } : null;
}

export async function computeReportCards(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("report_cards.manage");
  if (!auth.ok) return auth;
  const target = ids(formData);
  if (!target) return { ok: false, message: "Classe ou période invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("compute_report_cards", { p_class_id: target.classId, p_period_id: target.periodId });
  if (error) return { ok: false, message: dbErrorMessage(error, "Le calcul a échoué.") };
  revalidatePath("/bulletins");
  return {
    ok: true,
    message: data === 0 ? "Aucun bulletin modifié (tous sont déjà publiés ou la classe est vide)." : `${data} bulletin(s) calculé(s).`,
  };
}

export async function publishReportCards(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("report_cards.publish");
  if (!auth.ok) return auth;
  const target = ids(formData);
  if (!target) return { ok: false, message: "Classe ou période invalide." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("report_cards")
    .update({ status: "published" }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("class_id", target.classId)
    .eq("academic_period_id", target.periodId)
    .eq("status", "draft");
  if (error) return { ok: false, message: dbErrorMessage(error, "La publication a échoué.") };
  revalidatePath("/bulletins");
  return { ok: true, message: `${count ?? 0} bulletin(s) publié(s) : les familles sont notifiées.` };
}

const appreciationSchema = z.object({
  appreciation: z.string().trim().max(1000).optional(),
  head_teacher_comment: z.string().trim().max(1000).optional(),
  decision: z.string().trim().max(200).optional(),
});

export async function saveAppreciation(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("report_cards.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("report_card_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Bulletin introuvable." };
  const parsed = appreciationSchema.safeParse({
    appreciation: String(formData.get("appreciation") ?? "") || undefined,
    head_teacher_comment: String(formData.get("head_teacher_comment") ?? "") || undefined,
    decision: String(formData.get("decision") ?? "") || undefined,
  });
  if (!parsed.success) return { ok: false, message: "Texte trop long." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("report_cards")
    .update(
      {
        appreciation: parsed.data.appreciation ?? null,
        head_teacher_comment: parsed.data.head_teacher_comment ?? null,
        decision: parsed.data.decision ?? null,
      },
      { count: "exact" },
    )
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id)
    .eq("status", "draft");
  if (error) return { ok: false, message: dbErrorMessage(error) };
  if (count === 0) return { ok: false, message: "Un bulletin publié ne peut plus être modifié." };
  revalidatePath("/bulletins");
  return { ok: true, message: "Appréciation enregistrée." };
}

/** Enregistre la configuration du bulletin : les bulletins brouillons sont recalculés en base. */
export async function saveReportConfig(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("report_cards.manage");
  if (!auth.ok) return auth;
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("config") ?? "{}"));
  } catch {
    return { ok: false, message: "Configuration illisible." };
  }
  const parsed = reportConfigSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Configuration invalide." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("report_card_settings")
    .update({ config: parsed.data }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error, "Enregistrement impossible.") };
  revalidatePath("/bulletins", "layout");
  return { ok: true, message: "Configuration enregistrée : les bulletins non publiés ont été recalculés." };
}

const brandingSchema = z.object({
  signatory_name: z.string().trim().max(120).optional(),
  signatory_title: z.string().trim().max(120).optional(),
  header_text: z.string().trim().max(200).optional(),
  footer_text: z.string().trim().max(200).optional(),
});

/** Signataire, en-tête et pied de page des documents officiels (settings.manage). */
export async function saveBranding(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("settings.manage");
  if (!auth.ok) return auth;
  const parsed = brandingSchema.safeParse({
    signatory_name: String(formData.get("signatory_name") ?? "") || undefined,
    signatory_title: String(formData.get("signatory_title") ?? "") || undefined,
    header_text: String(formData.get("header_text") ?? "") || undefined,
    footer_text: String(formData.get("footer_text") ?? "") || undefined,
  });
  if (!parsed.success) return { ok: false, message: "Texte trop long." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_branding")
    .update({
      signatory_name: parsed.data.signatory_name ?? null,
      signatory_title: parsed.data.signatory_title ?? null,
      header_text: parsed.data.header_text ?? null,
      footer_text: parsed.data.footer_text ?? null,
    })
    .eq("organization_id", auth.context.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/bulletins", "layout");
  return { ok: true, message: "Identité des documents enregistrée." };
}

const IMAGE_SLOTS = ["logo", "stamp", "signature"] as const;

/** Logo, cachet ou signature (PNG/JPEG) utilisés sur tous les documents officiels. */
export async function uploadBrandingImage(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("settings.manage");
  if (!auth.ok) return auth;
  const slot = IMAGE_SLOTS.find((s) => s === formData.get("slot"));
  if (!slot) return { ok: false, message: "Image inconnue." };
  const supabase = await createClient();
  const stored = await storeUpload(supabase, {
    organizationId: auth.context.organization.id,
    file: formData.get("file") as File,
    owner: "organization",
    ownerId: auth.context.organization.id,
    category: slot,
    accept: ["image"],
  });
  if (!stored.ok) return stored;
  const { error } = await supabase
    .from("organization_branding")
    .update(slot === "logo" ? { logo_path: stored.id } : slot === "stamp" ? { stamp_path: stored.id } : { signature_path: stored.id })
    .eq("organization_id", auth.context.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/bulletins", "layout");
  return { ok: true, message: "Image enregistrée : elle figure désormais sur les documents." };
}
