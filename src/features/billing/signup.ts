"use server";

import { createHash } from "node:crypto";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { newPasswordSchema } from "@/features/auth/schemas";
import { secureCookiesForRequest } from "@/lib/utils/cookie-security";
import { ACTIVE_ORG_COOKIE } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";

const ORG_TYPES = [
  "primary_school", "middle_school", "high_school", "school_complex", "university", "institute",
  "vocational_center", "technical_center", "private_school", "school_group",
] as const;

const signupSchema = z.object({
  org_name: z.string().trim().min(3, { error: "Nom de l'établissement trop court." }).max(160),
  org_type: z.enum(ORG_TYPES, { error: "Choisissez le type d'établissement." }),
  city: z.string().trim().max(80).optional(),
  country: z.string().trim().regex(/^[A-Z]{2}$/, { error: "Pays invalide." }),
  phone: z.string().trim().max(40).optional(),
  first_name: z.string().trim().min(1, { error: "Prénom obligatoire." }).max(80),
  last_name: z.string().trim().min(1, { error: "Nom obligatoire." }).max(80),
  email: z.email({ error: "Adresse e-mail invalide." }).trim().toLowerCase(),
  plan: z.string().regex(/^[A-Z][A-Z_]{2,39}$/, { error: "Formule invalide." }),
  interval: z.enum(["MONTHLY", "YEARLY"]),
  terms: z.literal("on", { error: "Acceptez les conditions pour continuer." }),
});

const MAX_ATTEMPTS_PER_HOUR = 5;

/** Code établissement proposé à partir du nom (initiales, sans accents). */
function codeBase(name: string): string {
  const words = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const initials = words.filter((w) => w.length > 2 || /\d/.test(w)).map((w) => w[0]).join("");
  return (initials.length >= 2 ? initials : words.join("")).slice(0, 6);
}

/**
 * Inscription d'un établissement : compte du responsable, établissement
 * provisionné (rôles, formulaires, modèles) et essai gratuit de 14 jours.
 * Aucun paiement demandé. Protections : validation stricte, champ piège
 * anti-robot, limite de tentatives par adresse IP (hachée).
 */
export async function signUpOrganization(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (String(formData.get("site_web") ?? "") !== "") {
    return { ok: false, message: "Inscription impossible." }; // champ piège rempli : robot
  }
  const parsed = signupSchema.safeParse({
    org_name: formData.get("org_name"),
    org_type: formData.get("org_type"),
    city: String(formData.get("city") ?? "") || undefined,
    country: formData.get("country"),
    phone: String(formData.get("phone") ?? "") || undefined,
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    email: formData.get("email"),
    plan: formData.get("plan"),
    interval: formData.get("interval"),
    terms: formData.get("terms"),
  });
  const password = newPasswordSchema.safeParse({ password: formData.get("password"), confirmation: formData.get("confirmation") });
  if (!parsed.success || !password.success) {
    return {
      ok: false,
      message: "Vérifiez les champs du formulaire.",
      fieldErrors: {
        ...(parsed.success ? {} : z.flattenError(parsed.error).fieldErrors),
        ...(password.success ? {} : z.flattenError(password.error).fieldErrors),
      },
    };
  }
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Inscription momentanément indisponible (configuration serveur)." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnue";
  const ipHash = createHash("sha256").update(`neoscol-signup:${ip}`).digest("hex");
  const { count } = await admin
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", "auth.signup_attempt")
    .eq("metadata->>ip_sha256", ipHash)
    .gte("created_at", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= MAX_ATTEMPTS_PER_HOUR) {
    return { ok: false, message: "Trop de tentatives d'inscription depuis cette connexion. Réessayez dans une heure." };
  }
  await admin.from("audit_logs").insert({
    action: "auth.signup_attempt",
    summary: "Tentative d'inscription d'un établissement",
    metadata: { ip_sha256: ipHash, email_sha256: createHash("sha256").update(parsed.data.email).digest("hex"), source: "app" },
  });

  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: password.data.password,
    email_confirm: true,
    user_metadata: { first_name: parsed.data.first_name, last_name: parsed.data.last_name },
  });
  if (userError || !created.user) {
    return {
      ok: false,
      message: /already|exists|registered/i.test(userError?.message ?? "")
        ? "Un compte existe déjà avec cette adresse e-mail. Connectez-vous ou utilisez une autre adresse."
        : "Création du compte impossible. Réessayez.",
      fieldErrors: /already|exists|registered/i.test(userError?.message ?? "") ? { email: ["Adresse déjà utilisée."] } : undefined,
    };
  }
  await admin.from("profiles").update({ first_name: parsed.data.first_name, last_name: parsed.data.last_name, phone: parsed.data.phone ?? null }).eq("id", created.user.id);

  const { data: org, error: orgError } = await admin.rpc("signup_create_organization", {
    p_user: created.user.id,
    p_name: parsed.data.org_name,
    p_code_base: codeBase(parsed.data.org_name),
    p_type: parsed.data.org_type,
    p_city: parsed.data.city ?? "",
    p_country: parsed.data.country,
    p_phone: parsed.data.phone ?? "",
    p_email: parsed.data.email,
    p_plan_code: parsed.data.plan,
    p_interval: parsed.data.interval,
  });
  if (orgError || !org) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, message: "Création de l'établissement impossible. Aucune donnée n'a été conservée ; réessayez." };
  }
  const organizationId = (org as { organization_id: string }).organization_id;

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email: parsed.data.email, password: password.data.password });
  (await cookies()).set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: await secureCookiesForRequest(),
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/abonnement?bienvenue=1");
}
