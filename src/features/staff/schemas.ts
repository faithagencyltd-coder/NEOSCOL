import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const STAFF_FIELDS = ["first_name", "last_name", "sex", "job_title", "email", "phone", "hired_on"] as const;

export const staffSchema = z.object({
  first_name: z.string({ error: "Prénom requis." }).trim().min(1, { error: "Prénom requis." }).max(80),
  last_name: z.string({ error: "Nom requis." }).trim().min(1, { error: "Nom requis." }).max(80),
  sex: z.enum(["M", "F"], { error: "Sexe invalide." }).optional(),
  job_title: optionalText(120),
  email: z.email({ error: "E-mail invalide." }).trim().toLowerCase().optional(),
  phone: z.string().trim().regex(/^\+?[0-9 .-]{6,20}$/, { error: "Numéro invalide." }).optional(),
  hired_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Date invalide." }).optional(),
});

export const STAFF_STATUS = {
  active: { label: "Actif", tone: "success" },
  inactive: { label: "Désactivé", tone: "neutral" },
  withdrawn: { label: "Retiré", tone: "danger" },
} as const;

export const SCAN_REASON: Record<string, string> = {
  ok: "Accepté",
  unknown_badge: "Badge inconnu",
  other_organization: "Autre établissement",
  revoked_badge: "Badge désactivé",
  inactive_staff: "Personnel inactif",
  duplicate: "Double scan",
  already_checked_in: "Déjà pointé",
};

export const SCAN_KIND: Record<string, string> = { arrival: "Arrivée", departure: "Départ", lesson: "Déverrouillage de cours" };

/** Réponse de scan_staff_badge (tablette de pointage). */
export type ScanResult = {
  result: "accepted" | "rejected";
  reason?: string;
  kind?: "arrival" | "departure" | "lesson";
  message: string;
  at?: string;
  minutes_late?: number | null;
  staff?: { name: string; job_title: string | null; employee_number?: string; photo_file_id?: string | null } | null;
  lesson?: { class: string; subject: string; room: string | null; starts_at: string; ends_at: string } | null;
};
