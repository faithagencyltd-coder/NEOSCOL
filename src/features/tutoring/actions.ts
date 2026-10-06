"use server";

import { revalidatePath } from "next/cache";

import { splitList } from "@/features/tutoring/constants";
import { canWritePlatform, getPlatformRole, platformDeniedMessage } from "@/lib/auth/platform";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

/** Tutor Match : actions des familles, des tuteurs et du Super Admin. Tous les contrôles sont en base. */
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const on = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
const refresh = () => {
  revalidatePath("/espace/tutorat");
  revalidatePath("/espace/tuteur");
};

async function signedIn(): Promise<ActionResult | null> {
  return (await getSessionContext()) ? null : { ok: false, message: "Connectez-vous pour continuer." };
}
async function writer(): Promise<ActionResult | null> {
  if (!(await getSessionContext())) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const role = await getPlatformRole();
  return canWritePlatform(role) ? null : { ok: false, message: platformDeniedMessage(role) };
}
async function rpc(name: string, args: Record<string, unknown>, message: string, guard: () => Promise<ActionResult | null> = signedIn): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const { error } = await (await createClient()).rpc(name as never, args as never);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  revalidatePath("/plateforme/tutorat", "layout");
  return { ok: true, message };
}

// ---------------------------------------------------------------- Tuteur
export async function saveTutorProfile(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  return rpc(
    "tutor_save_profile",
    {
      p: {
        headline: text(f, "headline"),
        bio: text(f, "bio"),
        subjects: splitList(text(f, "subjects")).slice(0, 12),
        levels: splitList(text(f, "levels")).slice(0, 12),
        country: text(f, "country"),
        city: text(f, "city"),
        zones: splitList(text(f, "zones")).slice(0, 12),
        modes: ["home", "online", "center"].filter((m) => on(f, `mode_${m}`)),
        languages: ["fr", "en", "ar", "es", "pt", "de"].filter((l) => on(f, `lang_${l}`)),
        rate_amount: text(f, "rate_amount").replace(/\s/g, ""),
        rate_unit: text(f, "rate_unit"),
        availability: text(f, "availability"),
        experience_years: text(f, "experience_years"),
        qualifications: text(f, "qualifications"),
        references: text(f, "references"),
        accept_terms: on(f, "accept_terms"),
      },
    },
    "Fiche enregistrée.",
  );
}
export async function setTutorVisibility(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  return rpc("tutor_set_visibility", { p_visible: text(f, "visible") === "true" }, "Visibilité mise à jour.");
}
export async function requestTutorVerification(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  return rpc("tutor_request_verification", { p_note: text(f, "note") }, "Demande de vérification envoyée à l'équipe NeoScool.");
}
export async function respondTutorRequest(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const id = text(f, "id");
  if (!isUuid(id)) return { ok: false, message: "Demande introuvable." };
  return rpc("tutor_request_respond", { p_id: id, p_action: text(f, "action"), p_note: text(f, "note"), p_schedule: text(f, "schedule") }, "Réponse envoyée.");
}

// ---------------------------------------------------------------- Famille
export async function createTutorRequest(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const tutor = text(f, "tutor_id");
  if (!isUuid(tutor)) return { ok: false, message: "Tuteur introuvable." };
  return rpc(
    "tutor_request_create",
    {
      p_tutor: tutor,
      p_child_label: text(f, "child_label"),
      p_level: text(f, "level"),
      p_subject: text(f, "subject"),
      p_mode: text(f, "mode"),
      p_schedule: text(f, "schedule"),
      p_message: text(f, "message"),
      p_source: text(f, "source") === "suggestion" ? "suggestion" : "search",
    },
    "Demande envoyée au tuteur.",
  );
}
export async function parentRequestAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const id = text(f, "id");
  if (!isUuid(id)) return { ok: false, message: "Demande introuvable." };
  return rpc("tutor_request_parent_action", { p_id: id, p_action: text(f, "action"), p_reason: text(f, "reason") }, "Demande mise à jour.");
}
export async function sendTutorMessage(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const id = text(f, "id");
  if (!isUuid(id)) return { ok: false, message: "Demande introuvable." };
  return rpc("tutor_request_message", { p_id: id, p_body: text(f, "body") }, "Message envoyé.");
}
export async function saveTutorSession(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const request = text(f, "request_id");
  const session = text(f, "session_id");
  if (!isUuid(request)) return { ok: false, message: "Demande introuvable." };
  const when = text(f, "date") && text(f, "time") ? new Date(`${text(f, "date")}T${text(f, "time")}:00`).toISOString() : new Date().toISOString();
  return rpc(
    "tutor_session_save",
    {
      p_request: request,
      p_session: (isUuid(session) ? session : null) as string,
      p_starts_at: when,
      p_duration: Number(text(f, "duration") || 60),
      p_mode: text(f, "mode") || "online",
      p_note: text(f, "note"),
      p_status: text(f, "status") || "planned",
    },
    isUuid(session) ? "Séance mise à jour." : "Séance ajoutée.",
  );
}
export async function blockTutor(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const tutor = text(f, "tutor_id");
  if (!isUuid(tutor)) return { ok: false, message: "Tuteur introuvable." };
  const blocked = text(f, "blocked") !== "false";
  return rpc("tutor_block", { p_tutor: tutor, p_blocked: blocked }, blocked ? "Tuteur bloqué : il n'apparaît plus et ne peut plus vous écrire." : "Tuteur débloqué.");
}
export async function reportTutor(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const tutor = text(f, "tutor_id");
  if (!isUuid(tutor)) return { ok: false, message: "Tuteur introuvable." };
  return rpc("submit_content_report", { p_type: "tutor", p_target: tutor, p_reason: text(f, "reason") || "other", p_details: text(f, "details") }, "Signalement envoyé à l'équipe NeoScool.");
}
export async function suggestionPreference(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const dismiss = text(f, "dismiss");
  return rpc(
    "tutor_suggestion_preference",
    { p_opt_out: text(f, "opt_out") === "true", p_dismiss: (isUuid(dismiss) ? dismiss : null) as string },
    isUuid(dismiss) ? "Suggestion masquée." : text(f, "opt_out") === "true" ? "Vous ne recevrez plus de suggestions de soutien." : "Suggestions de soutien réactivées.",
  );
}

// ---------------------------------------------------------------- Console
export async function saveTutorSettings(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  return rpc(
    "platform_save_tutor_settings",
    {
      p: {
        independent_tutors: on(f, "independent_tutors"),
        school_teachers: on(f, "school_teachers"),
        require_verification: on(f, "require_verification"),
        forbid_own_school: on(f, "forbid_own_school"),
        suggestions_enabled: on(f, "suggestions_enabled"),
        suggestion_threshold: Number(text(f, "suggestion_threshold").replace(",", ".") || 10),
        suggestion_periods: Number(text(f, "suggestion_periods") || 2),
        suggestion_cooldown_days: Number(text(f, "suggestion_cooldown_days") || 90),
        max_open_requests: Number(text(f, "max_open_requests") || 10),
        terms: text(f, "terms"),
      },
    },
    "Réglages de Tutor Match enregistrés.",
    writer,
  );
}
export async function reviewTutor(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const user = text(f, "user_id");
  if (!isUuid(user)) return { ok: false, message: "Fiche introuvable." };
  return rpc("platform_review_tutor", { p_user: user, p_action: text(f, "action"), p_note: text(f, "note") }, "Fiche mise à jour.", writer);
}
export async function runTutorSuggestions(): Promise<ActionResult> {
  const denied = await writer();
  if (denied) return denied;
  const { data, error } = await (await createClient()).rpc("tutor_generate_suggestions");
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/plateforme/tutorat", "layout");
  return { ok: true, message: `${data ?? 0} suggestion(s) envoyée(s) aux familles concernées.` };
}
