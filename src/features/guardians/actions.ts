"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { readFields } from "@/lib/utils/form-data";
import { isUuid } from "@/lib/utils/search-params";

const optional = (max: number) => z.string().trim().max(max).optional();

const guardianUpdateSchema = z.object({
  first_name: z.string({ error: "Prénom requis." }).trim().min(1, { error: "Prénom requis." }).max(80),
  last_name: z.string({ error: "Nom requis." }).trim().min(1, { error: "Nom requis." }).max(80),
  sex: z.enum(["M", "F"]).optional(),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s.-]/g, ""))
    .pipe(z.string().regex(/^\+?[0-9]{8,15}$/, { error: "Numéro invalide." }))
    .optional(),
  phone_secondary: optional(30),
  email: z.email({ error: "E-mail invalide." }).trim().toLowerCase().optional(),
  profession: optional(80),
  employer: optional(120),
  address: optional(200),
  city: optional(80),
  national_id: optional(60),
});

const FIELDS = [
  "first_name", "last_name", "sex", "phone", "phone_secondary", "email",
  "profession", "employer", "address", "city", "national_id",
] as const;

export async function updateGuardian(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("guardians.manage");
  if (!auth.ok) return auth;
  const guardianId = String(formData.get("guardian_id") ?? "");
  if (!isUuid(guardianId)) return { ok: false, message: "Parent introuvable." };
  const parsed = guardianUpdateSchema.safeParse(readFields(formData, FIELDS));
  if (!parsed.success) {
    return { ok: false, message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const d = parsed.data;
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("guardians")
    .update(
      {
        first_name: d.first_name,
        last_name: d.last_name.toUpperCase(),
        sex: d.sex ?? null,
        phone: d.phone ?? null,
        phone_secondary: d.phone_secondary ?? null,
        email: d.email ?? null,
        profession: d.profession ?? null,
        employer: d.employer ?? null,
        address: d.address ?? null,
        city: d.city ?? null,
        national_id: d.national_id ?? null,
      },
      { count: "exact" },
    )
    .eq("organization_id", auth.context.organization.id)
    .eq("id", guardianId);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error, "La modification a échoué.") };
  revalidatePath(`/parents/${guardianId}`);
  revalidatePath("/parents");
  return { ok: true, message: "Fiche mise à jour." };
}
