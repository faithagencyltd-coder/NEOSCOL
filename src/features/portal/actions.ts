"use server";

import { randomInt } from "node:crypto";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { CHILD_COOKIE, getPortalStudents } from "@/features/portal/queries";
import { authorize } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

type Credentials = { login: string; password?: string };

function password(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return `${Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join("")}-${randomInt(10, 99)}`;
}

function refresh() {
  revalidatePath("/parents", "layout");
  revalidatePath("/eleves", "layout");
}

/**
 * Active le portail d'un parent : compte créé (service role, après contrôle
 * portal_access.manage) avec son téléphone ; connexion par téléphone + nom +
 * prénom + code SMS. Le rattachement et le rôle passent par la base (RPC).
 */
export async function activateGuardianPortal(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("portal_access.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("guardian_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Parent introuvable." };
  const supabase = await createClient();
  const { data: guardian } = await supabase
    .from("guardians")
    .select("id, first_name, last_name, phone, email, user_id")
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id)
    .maybeSingle();
  if (!guardian) return { ok: false, message: "Parent introuvable." };
  if (guardian.user_id) return { ok: false, message: "Le portail est déjà activé." };
  const phone = guardian.phone?.replace(/[\s.-]/g, "") ?? "";
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return { ok: false, message: "Renseignez d'abord un téléphone au format international (+225…)." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Configuration serveur incomplète (clé de service Supabase absente)." };
  const { data: created, error } = await admin.auth.admin.createUser({
    phone,
    phone_confirm: true,
    ...(guardian.email ? { email: guardian.email, email_confirm: true } : {}),
    user_metadata: { first_name: guardian.first_name, last_name: guardian.last_name },
  });
  if (error || !created.user) {
    return { ok: false, message: error?.message?.includes("already") ? "Ce téléphone ou cet e-mail est déjà utilisé par un autre compte." : "Création du compte impossible." };
  }
  const { error: grantError } = await supabase.rpc("grant_portal_access", { p_kind: "guardian", p_record_id: id, p_user_id: created.user.id });
  if (grantError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, message: dbErrorMessage(grantError) };
  }
  refresh();
  return { ok: true, message: `Portail parent activé : connexion avec le ${phone}, le nom, le prénom et le code reçu par SMS.` };
}

/**
 * Active le portail d'un élève : connexion par matricule + date de naissance +
 * mot de passe (affiché une seule fois).
 */
export async function activateStudentPortal(_: ActionResult<Credentials> | null, formData: FormData): Promise<ActionResult<Credentials>> {
  const auth = await authorize("portal_access.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("student_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Élève introuvable." };
  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, first_name, last_name, matricule, birth_date, email, user_id")
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id)
    .maybeSingle();
  if (!student) return { ok: false, message: "Élève introuvable." };
  if (student.user_id) return { ok: false, message: "Le portail est déjà activé." };
  if (!student.birth_date) return { ok: false, message: "Renseignez d'abord la date de naissance (elle sert à la connexion)." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Configuration serveur incomplète (clé de service Supabase absente)." };
  const secret = password();
  const { data: created, error } = await admin.auth.admin.createUser({
    // Adresse technique non routable si l'élève n'a pas d'e-mail : la connexion se fait par matricule.
    email: student.email ?? `${student.matricule.toLowerCase()}@eleves.neoscol.invalid`,
    password: secret,
    email_confirm: true,
    user_metadata: { first_name: student.first_name, last_name: student.last_name },
  });
  if (error || !created.user) return { ok: false, message: error?.message?.includes("already") ? "Cette adresse e-mail est déjà utilisée." : "Création du compte impossible." };
  const { error: grantError } = await supabase.rpc("grant_portal_access", { p_kind: "student", p_record_id: id, p_user_id: created.user.id });
  if (grantError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, message: dbErrorMessage(grantError) };
  }
  // Pas de revalidation : le mot de passe doit rester affiché ; la page est rafraîchie à la fermeture.
  return {
    ok: true,
    message: "Portail élève activé. Communiquez ces identifiants en main propre : le mot de passe ne sera plus affiché.",
    data: { login: student.matricule, password: secret },
  };
}

export async function setPortalAccount(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("portal_access.manage");
  if (!auth.ok) return auth;
  const kind = formData.get("kind") === "student" ? "student" : "guardian";
  const id = String(formData.get("record_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Dossier introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_portal_account_status", { p_kind: kind, p_record_id: id, p_active: formData.get("active") === "true" });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: formData.get("active") === "true" ? "Compte portail réactivé." : "Compte portail suspendu." };
}

const overrideSchema = z.object({
  student_id: z.uuid(),
  mode: z.enum(["unrestricted", "restricted"]),
  reason: z.string().trim().min(3, { error: "Le motif est obligatoire." }).max(500),
  expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Dérogation : débloquer (échéancier accordé) ou restreindre manuellement le portail d'un élève. */
export async function setPortalOverride(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("portal_access.manage");
  if (!auth.ok) return auth;
  const parsed = overrideSchema.safeParse({
    student_id: formData.get("student_id"),
    mode: formData.get("mode"),
    reason: formData.get("reason"),
    expires_on: String(formData.get("expires_on") ?? "") || undefined,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  const supabase = await createClient();
  const { error } = await supabase.from("portal_access_overrides").upsert({ ...parsed.data, organization_id: auth.context.organization.id, expires_on: parsed.data.expires_on ?? null });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: parsed.data.mode === "unrestricted" ? "Portail débloqué (dérogation enregistrée)." : "Portail restreint manuellement." };
}

export async function removePortalOverride(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("portal_access.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("student_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Élève introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.from("portal_access_overrides").delete().eq("organization_id", auth.context.organization.id).eq("student_id", id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Dérogation retirée : les règles de l'établissement s'appliquent de nouveau." };
}

const settingsSchema = z.object({
  restrictions_enabled: z.boolean(),
  grace_days: z.coerce.number().int().min(0).max(120),
  min_overdue_amount: z.coerce.number().min(0).max(100_000_000),
  restrict_grades: z.boolean(),
  restrict_report_cards: z.boolean(),
  restrict_documents: z.boolean(),
  restrict_timetable: z.boolean(),
  days_before_due: z.coerce.number().int().min(0).max(60),
  overdue_interval_days: z.coerce.number().int().min(1).max(90),
  open_before_minutes: z.coerce.number().int().min(0).max(120),
  late_tolerance_minutes: z.coerce.number().int().min(0).max(120),
  duplicate_window_seconds: z.coerce.number().int().min(0).max(3600),
  track_departure: z.boolean(),
  lock_after_validation: z.boolean(),
});

/** Paramètres de l'établissement : restrictions d'impayé, rappels, pointage, verrouillage des notes. */
export async function saveOrganizationSettings(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("settings.manage");
  if (!auth.ok) return auth;
  const bool = (key: string) => formData.get(key) === "on";
  const parsed = settingsSchema.safeParse({
    restrictions_enabled: bool("restrictions_enabled"),
    grace_days: formData.get("grace_days"),
    min_overdue_amount: formData.get("min_overdue_amount"),
    restrict_grades: bool("restrict_grades"),
    restrict_report_cards: bool("restrict_report_cards"),
    restrict_documents: bool("restrict_documents"),
    restrict_timetable: bool("restrict_timetable"),
    days_before_due: formData.get("days_before_due"),
    overdue_interval_days: formData.get("overdue_interval_days"),
    open_before_minutes: formData.get("open_before_minutes"),
    late_tolerance_minutes: formData.get("late_tolerance_minutes"),
    duplicate_window_seconds: formData.get("duplicate_window_seconds"),
    track_departure: bool("track_departure"),
    lock_after_validation: bool("lock_after_validation"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Valeurs invalides." };
  const v = parsed.data;
  const settings = (auth.context.organization.settings ?? {}) as Record<string, Record<string, unknown>>;
  const next = {
    ...settings,
    portal_restrictions: {
      ...settings.portal_restrictions,
      enabled: v.restrictions_enabled,
      grace_days: v.grace_days,
      min_overdue_amount: v.min_overdue_amount,
      features: { grades: v.restrict_grades, report_cards: v.restrict_report_cards, documents: v.restrict_documents, timetable: v.restrict_timetable },
    },
    reminders: { ...settings.reminders, days_before_due: v.days_before_due, overdue_interval_days: v.overdue_interval_days },
    staff_attendance: {
      ...settings.staff_attendance,
      open_before_minutes: v.open_before_minutes,
      late_tolerance_minutes: v.late_tolerance_minutes,
      duplicate_window_seconds: v.duplicate_window_seconds,
      track_departure: v.track_departure,
    },
    grading: { ...settings.grading, lock_after_validation: v.lock_after_validation },
  };
  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update({ settings: next }).eq("id", auth.context.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  await supabase.rpc("log_event", {
    p_action: "settings.updated",
    p_organization_id: auth.context.organization.id,
    p_entity_type: "organizations",
    p_entity_id: auth.context.organization.id,
    p_summary: `Paramètres modifiés (restrictions portail : ${v.restrictions_enabled ? "activées" : "désactivées"})`,
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Paramètres enregistrés. Les restrictions s'appliquent immédiatement." };
}

/** Portail parent : choix de l'enfant affiché (uniquement parmi ses enfants). */
export async function selectChild(studentId: string): Promise<void> {
  const auth = await authorize("portal.parent", "portal.student");
  if (!auth.ok || !isUuid(studentId)) return;
  const students = await getPortalStudents(auth.context.organization.id);
  if (!students.some((s) => s.id === studentId)) return;
  (await cookies()).set(CHILD_COOKIE, studentId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 180 });
  revalidatePath("/portail", "layout");
}
