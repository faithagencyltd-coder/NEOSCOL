"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

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
