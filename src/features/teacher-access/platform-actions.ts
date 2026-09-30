"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { readBoolean } from "@/lib/utils/form-data";

async function requirePlatformAdmin(): Promise<{ ok: true } | { ok: false; message: string }> {
  const context = await getSessionContext();
  if (!context) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  return data ? { ok: true } : { ok: false, message: "Réservé à l'administration de la plateforme Neoscool." };
}

function refresh() {
  revalidatePath("/plateforme/enseignants");
}

const settingsSchema = z.object({
  price: z.coerce.number({ error: "Prix invalide." }).int({ error: "Prix entier (sans décimales)." }).min(0, { error: "Prix invalide." }).max(100_000_000, { error: "Prix trop élevé." }),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, { error: "Devise invalide (ex. XOF)." }),
  period_months: z.coerce.number().refine((v) => [1, 3, 6, 12].includes(v), { error: "Périodicité invalide." }),
  grace_days: z.coerce.number().int().min(0, { error: "Délai de grâce : 0 à 60 jours." }).max(60, { error: "Délai de grâce : 0 à 60 jours." }),
});

/** Règle de l'abonnement supplémentaire : activer / désactiver, prix, périodicité, délai de grâce (historisé en base). */
export async function saveTeacherAccessSettings(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const parsed = settingsSchema.safeParse({
    price: formData.get("price"),
    currency: formData.get("currency") ?? "XOF",
    period_months: formData.get("period_months"),
    grace_days: formData.get("grace_days") ?? 0,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  const enabled = readBoolean(formData, "enabled");
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_save_teacher_access_settings", {
    p_enabled: enabled,
    p_price: parsed.data.price,
    p_currency: parsed.data.currency,
    p_period_months: parsed.data.period_months,
    p_grace_days: parsed.data.grace_days,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return {
    ok: true,
    message: enabled
      ? "Règle active : l'accès d'un enseignant à un établissement supplémentaire demande désormais l'abonnement configuré."
      : "Règle désactivée : les enseignants accèdent librement à tous leurs établissements.",
  };
}

const manualSchema = z.object({
  user_id: z.uuid(),
  organization_id: z.uuid(),
  amount: z.coerce.number().int({ error: "Montant entier." }).positive({ error: "Montant invalide." }),
  reference: z.string().trim().min(3, { error: "Référence du paiement obligatoire." }).max(120),
  method: z.string().trim().max(60).optional(),
  note: z.string().trim().max(500).optional(),
});

/** Paiement reçu hors ligne (espèces, virement…) : active l'accès pour une période. */
export async function recordTeacherAccessPayment(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const parsed = manualSchema.safeParse({
    user_id: formData.get("user_id"),
    organization_id: formData.get("organization_id"),
    amount: formData.get("amount"),
    reference: formData.get("reference"),
    method: String(formData.get("method") ?? "") || undefined,
    note: String(formData.get("note") ?? "") || undefined,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_teacher_access_record_payment", {
    p_user: parsed.data.user_id,
    p_org: parsed.data.organization_id,
    p_amount: parsed.data.amount,
    p_reference: parsed.data.reference,
    p_method: parsed.data.method ?? "manuel",
    p_note: parsed.data.note,
  });
  if (error || !data) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  const result = data as { covers_to: string };
  return { ok: true, message: `Paiement enregistré : accès activé jusqu'au ${new Date(`${result.covers_to}T12:00:00Z`).toLocaleDateString("fr-FR")}.` };
}

const statusSchema = z.object({
  user_id: z.uuid(),
  organization_id: z.uuid(),
  action: z.enum(["suspend", "restore", "exempt", "remove_exemption"]),
  reason: z.string().trim().min(3, { error: "Le motif est obligatoire." }).max(500),
});

const STATUS_MESSAGES = {
  suspend: "Accès suspendu. Le compte de l'enseignant et ses autres établissements ne sont pas touchés.",
  restore: "Accès rétabli selon la période payée.",
  exempt: "Accès offert : aucun paiement ne sera demandé.",
  remove_exemption: "Offre retirée : l'accès suit de nouveau le paiement.",
} as const;

/** Suspendre, rétablir, offrir ou retirer l'offre (motif obligatoire, audité, notifié à l'enseignant). */
export async function setTeacherAccessStatus(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const parsed = statusSchema.safeParse({
    user_id: formData.get("user_id"),
    organization_id: formData.get("organization_id"),
    action: formData.get("action"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_teacher_access_set_status", {
    p_user: parsed.data.user_id,
    p_org: parsed.data.organization_id,
    p_action: parsed.data.action,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: STATUS_MESSAGES[parsed.data.action] };
}
