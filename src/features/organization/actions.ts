"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { readFields } from "@/lib/utils/form-data";

const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, { error: "Couleur invalide (format #RRGGBB)." });
const optional = (max: number) => z.string().trim().max(max).optional();

const identitySchema = z.object({
  name: z.string({ error: "Nom requis." }).trim().min(2, { error: "Nom requis." }).max(200),
  short_name: optional(40),
  email: z.email({ error: "Adresse e-mail invalide." }).optional(),
  phone: optional(40),
  website: optional(200),
  address: optional(300),
  city: optional(120),
  primary_color: color,
  secondary_color: color,
});

/**
 * Identité de l'établissement (settings.manage) : coordonnées et couleurs,
 * reprises sur tous les documents. Code, statut et mode démo restent réservés
 * à la plateforme (contrôlé en base).
 */
export async function saveIdentity(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("settings.manage");
  if (!auth.ok) return auth;
  const parsed = identitySchema.safeParse(readFields(formData, ["name", "short_name", "email", "phone", "website", "address", "city", "primary_color", "secondary_color"]));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Champs invalides.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { primary_color, secondary_color, ...info } = parsed.data;
  const organizationId = auth.context.organization.id;
  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      name: info.name,
      short_name: info.short_name ?? null,
      email: info.email ?? null,
      phone: info.phone ?? null,
      website: info.website ?? null,
      address: info.address ?? null,
      city: info.city ?? null,
    })
    .eq("id", organizationId);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  const { error: brandingError } = await supabase
    .from("organization_branding")
    .upsert({ organization_id: organizationId, primary_color: primary_color.toUpperCase(), secondary_color: secondary_color.toUpperCase() });
  if (brandingError) return { ok: false, message: dbErrorMessage(brandingError) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Identité de l'établissement enregistrée : elle s'applique aux prochains documents." };
}
