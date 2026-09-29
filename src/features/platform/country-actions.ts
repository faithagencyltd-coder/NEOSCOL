"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";

async function requirePlatformAdmin(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!(await getSessionContext())) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  return data ? { ok: true } : { ok: false, message: "Réservé à l'administration de la plateforme NéoScol." };
}

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

const countrySchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, { error: "Code ISO à 2 lettres (ex. BJ, FR)." }),
  name: z.string().trim().min(2, { error: "Nom du pays obligatoire." }).max(80),
  name_en: z.string().trim().max(80).optional(),
  dial_code: z.string().trim().regex(/^\+[1-9][0-9]{0,3}$/, { error: "Indicatif au format +229." }),
  default_currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, { error: "Devise au format ISO (XOF, EUR…)." }),
  timezone: z.string().trim().min(3).max(64),
  phone_pattern: z.string().trim().max(120).optional(),
  date_format: z.enum(["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"]),
  default_language: z.enum(["fr", "en"]),
  grading_scale: z.coerce.number().int().min(5).max(100),
  school_periods: z.enum(["trimester", "semester"]),
  national_id_label: z.string().trim().max(80).optional(),
  national_id_pattern: z.string().trim().max(200).optional(),
  sort_order: z.coerce.number().int().min(0).max(9999),
});

/** Ajout ou modification d'un pays : aucune modification du code n'est nécessaire. */
export async function saveCountry(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const parsed = countrySchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    name_en: String(formData.get("name_en") ?? "") || undefined,
    dial_code: formData.get("dial_code"),
    default_currency: formData.get("default_currency"),
    timezone: formData.get("timezone"),
    phone_pattern: String(formData.get("phone_pattern") ?? "") || undefined,
    date_format: formData.get("date_format") || "dd/MM/yyyy",
    default_language: formData.get("default_language") || "fr",
    grading_scale: formData.get("grading_scale") || 20,
    school_periods: formData.get("school_periods") || "trimester",
    national_id_label: String(formData.get("national_id_label") ?? "") || undefined,
    national_id_pattern: String(formData.get("national_id_pattern") ?? "") || undefined,
    sort_order: formData.get("sort_order") || 100,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  const d = parsed.data;
  const languages = ["fr", "en"].filter((l) => formData.get(`lang_${l}`) === "on");
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_upsert_country", {
    p_country: {
      code: d.code,
      name: d.name,
      name_en: d.name_en ?? null,
      dial_code: d.dial_code,
      default_currency: d.default_currency,
      currencies: list(formData.get("currencies")).map((c) => c.toUpperCase()),
      languages: languages.length ? languages : [d.default_language],
      default_language: languages.length && !languages.includes(d.default_language) ? languages[0] : d.default_language,
      timezone: d.timezone,
      phone_pattern: d.phone_pattern ?? null,
      date_format: d.date_format,
      settings: {
        grading_scale: d.grading_scale,
        school_periods: d.school_periods,
        national_id_label: d.national_id_label ?? null,
        national_id_pattern: d.national_id_pattern ?? null,
      },
      is_active: formData.get("is_active") === "on",
      sort_order: d.sort_order,
    },
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/plateforme/pays");
  revalidatePath("/inscription");
  revalidatePath("/plateforme/country-connect");
  return { ok: true, message: `Pays ${d.name} enregistré : disponible dans NéoScol.` };
}

export async function saveCurrency(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const parsed = z
    .object({
      code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, { error: "Code ISO à 3 lettres (ex. EUR)." }),
      name: z.string().trim().min(2).max(80),
      symbol: z.string().trim().min(1).max(8),
      decimals: z.coerce.number().int().min(0).max(4),
    })
    .safeParse({ code: formData.get("code"), name: formData.get("name"), symbol: formData.get("symbol"), decimals: formData.get("decimals") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Devise invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_upsert_currency", {
    p_code: parsed.data.code,
    p_name: parsed.data.name,
    p_symbol: parsed.data.symbol,
    p_decimals: parsed.data.decimals,
    p_active: formData.get("is_active") === "on",
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/plateforme/pays");
  return { ok: true, message: `Devise ${parsed.data.code} enregistrée.` };
}
