/**
 * MODULE 3 — UNIVERSITÉ / ENSEIGNEMENT SUPÉRIEUR. Fichier partagé serveur /
 * navigateur : réglages (organizations.settings.university) et libellés.
 */
import type { Tone } from "@/lib/labels";

export const HIGHER_ORG_TYPES = ["university", "institute"] as const;

export function isHigherOrg(type: string | null | undefined): boolean {
  return (HIGHER_ORG_TYPES as readonly (string | null | undefined)[]).includes(type);
}

export const UNIVERSITY_FEATURES = [
  "faculties", "departments", "groups", "semesters", "credits", "ranking", "internships", "theses",
  "defenses", "badges", "scan", "student_portal", "teacher_portal", "parent_portal", "payments", "documents",
] as const;
export type UniversityFeature = (typeof UNIVERSITY_FEATURES)[number];

export const FEATURE_LABELS: Record<UniversityFeature, { label: string; hint: string }> = {
  faculties: { label: "Facultés / écoles", hint: "Établissement → Facultés → Filières. Désactivé : Établissement → Filières." },
  departments: { label: "Départements", hint: "Faculté → Département → Filière." },
  groups: { label: "Groupes (TD / TP)", hint: "Division des promotions en groupes ; sinon Filière → Niveau → Étudiants." },
  semesters: { label: "Semestres", hint: "Organisation semestrielle des UE et des résultats." },
  credits: { label: "Crédits", hint: "Crédits par UE, semestre, année et cycle." },
  ranking: { label: "Classement", hint: "Rang des étudiants dans la promotion (désactivé par défaut)." },
  internships: { label: "Stages", hint: "Conventions, encadreurs, rapports, évaluations." },
  theses: { label: "Mémoires / thèses", hint: "Sujets, directeurs, dépôts, notes." },
  defenses: { label: "Soutenances", hint: "Planification, jury, notes, procès-verbaux." },
  badges: { label: "Badges et QR", hint: "Badges étudiants et enseignants." },
  scan: { label: "Scan des présences", hint: "Tablette « SCANNER VOTRE BADGE »." },
  student_portal: { label: "Portail étudiant", hint: "Résultats, crédits, parcours, paiements, documents." },
  teacher_portal: { label: "Portail enseignant", hint: "Enseignements, étudiants, présences, notes." },
  parent_portal: { label: "Portail parent", hint: "Désactivé par défaut. Les parents suivent leur enfant (informations choisies ci-dessous)." },
  payments: { label: "Paiements", hint: "Frais universitaires, tranches, reçus." },
  documents: { label: "Documents", hint: "Attestations, relevés, PV, diplômes." },
};

export type UniversityRules = {
  pass_mark: number;
  ue_compensation: boolean;
  semester_compensation: boolean;
  semester_weighting: "credits" | "coefficient";
  eliminatory_mark: number | null;
  absent_as_zero: boolean;
  retake_rule: "best" | "replace" | "cap" | "average";
  retake_cap: number;
  year_pass_ratio: number;
  conditional_pass_ratio: number;
  late_tolerance_minutes: number;
  open_before_minutes: number;
  entry_without_course: boolean;
};

export type UniversityConfig = {
  establishmentKind: string;
  features: Record<UniversityFeature, boolean>;
  rules: UniversityRules;
  teacherRanks: string[];
  decisions: Record<string, string>;
  parentSections: Record<ParentSection, boolean>;
};

const DEFAULT_FEATURES: Record<UniversityFeature, boolean> = {
  faculties: true, departments: true, groups: false, semesters: true, credits: true, ranking: false, internships: true,
  theses: true, defenses: true, badges: true, scan: true, student_portal: true, teacher_portal: true, parent_portal: false, payments: true, documents: true,
};

/** Informations que l'université choisit de montrer aux parents (portail parent). */
export const PARENT_SECTIONS = ["results", "grades", "attendance", "finances", "documents", "timetable"] as const;
export type ParentSection = (typeof PARENT_SECTIONS)[number];
export const PARENT_SECTION_LABELS: Record<ParentSection, string> = {
  results: "Résultats, crédits et parcours",
  grades: "Notes des évaluations",
  attendance: "Présences et absences",
  finances: "Paiements et reliquats",
  documents: "Documents officiels",
  timetable: "Emploi du temps",
};
const DEFAULT_PARENT_SECTIONS: Record<ParentSection, boolean> = { results: true, grades: true, attendance: true, finances: true, documents: true, timetable: true };
const DEFAULT_RULES: UniversityRules = {
  pass_mark: 10, ue_compensation: true, semester_compensation: true, semester_weighting: "credits", eliminatory_mark: null,
  absent_as_zero: true, retake_rule: "best", retake_cap: 10, year_pass_ratio: 1, conditional_pass_ratio: 0.75,
  late_tolerance_minutes: 10, open_before_minutes: 15, entry_without_course: false,
};
const DEFAULT_DECISIONS: Record<string, string> = {
  validated: "Admis(e)", compensated: "Admis(e) par compensation", retake: "Autorisé(e) au rattrapage", failed: "Ajourné(e)",
  year_pass: "Admis(e) en année supérieure", year_conditional: "Admis(e) avec dette de crédits", year_repeat: "Redouble",
};

/** Réglages effectifs (null : établissement hors enseignement supérieur). */
export function universityConfigOf(type: string | null | undefined, settings: unknown): UniversityConfig | null {
  if (!isHigherOrg(type)) return null;
  const raw = ((settings && typeof settings === "object" ? (settings as Record<string, unknown>).university : null) ?? {}) as Record<string, unknown>;
  return {
    establishmentKind: typeof raw.establishment_kind === "string" ? raw.establishment_kind : "universite",
    features: { ...DEFAULT_FEATURES, ...((raw.features ?? {}) as Partial<Record<UniversityFeature, boolean>>) },
    rules: { ...DEFAULT_RULES, ...((raw.rules ?? {}) as Partial<UniversityRules>) },
    teacherRanks: Array.isArray(raw.teacher_ranks) ? (raw.teacher_ranks as string[]) : ["Professeur titulaire", "Maître de conférences", "Chargé de cours", "Vacataire", "Intervenant"],
    decisions: { ...DEFAULT_DECISIONS, ...((raw.decisions ?? {}) as Record<string, string>) },
    parentSections: { ...DEFAULT_PARENT_SECTIONS, ...((raw.parent_portal_sections ?? {}) as Partial<Record<ParentSection, boolean>>) },
  };
}

export const ESTABLISHMENT_KINDS: Record<string, string> = {
  universite: "Université",
  institut: "Institut supérieur",
  ecole_superieure: "École supérieure",
  prive: "Établissement universitaire privé",
  faculte: "Faculté",
  autre: "Autre structure d'enseignement supérieur",
};
export const FACULTY_KINDS: Record<string, string> = { faculte: "Faculté", ecole: "École", institut: "Institut", autre: "Autre" };
export const TRACK_KINDS: Record<string, string> = { parcours: "Parcours", specialite: "Spécialité", option: "Option" };
export const ROOM_TYPES: Record<string, string> = {
  cours: "Salle de cours", amphi: "Amphithéâtre", labo: "Laboratoire", informatique: "Salle informatique", tp: "Salle de TP", autre: "Autre",
};
export const TEACHING_TYPES: Record<string, string> = {
  cm: "Cours magistral", td: "TD", tp: "TP", projet: "Projet", atelier: "Atelier", examen: "Examen", oral: "Oral", autre: "Autre",
};
export const RETAKE_RULES: Record<string, string> = {
  best: "Meilleure note (session 1 ou rattrapage)",
  replace: "La note de rattrapage remplace",
  cap: "Rattrapage plafonné",
  average: "Moyenne des deux sessions",
};
export const UE_STATUS: Record<string, { label: string; tone: Tone }> = {
  validated: { label: "Validée", tone: "success" },
  compensated: { label: "Compensée", tone: "info" },
  failed: { label: "Non validée", tone: "danger" },
  incomplete: { label: "Notes incomplètes", tone: "warning" },
  jury: { label: "Validée par le jury", tone: "primary" },
};
export const THESIS_STATUS: Record<string, { label: string; tone: Tone }> = {
  proposed: { label: "Sujet proposé", tone: "neutral" },
  approved: { label: "Sujet validé", tone: "info" },
  in_progress: { label: "En cours", tone: "primary" },
  submitted: { label: "Déposé", tone: "warning" },
  defended: { label: "Soutenu", tone: "success" },
  abandoned: { label: "Abandonné", tone: "neutral" },
};
export const THESIS_KINDS: Record<string, string> = { memoire: "Mémoire", these: "Thèse", projet: "Projet de fin d'études" };
export const DEFENSE_STATUS: Record<string, { label: string; tone: Tone }> = {
  scheduled: { label: "Programmée", tone: "info" },
  held: { label: "Tenue", tone: "success" },
  postponed: { label: "Reportée", tone: "warning" },
  cancelled: { label: "Annulée", tone: "neutral" },
};
export const INTERNSHIP_HOSTS: Record<string, string> = {
  entreprise: "Entreprise", organisme: "Organisme", administration: "Administration", laboratoire: "Laboratoire", autre: "Autre",
};
export const DIPLOMA_STATUS: Record<string, { label: string; tone: Tone }> = {
  issued: { label: "Délivré", tone: "success" },
  revoked: { label: "Révoqué", tone: "danger" },
};

export const fmtNote = (value: number | string | null | undefined) =>
  value === null || value === undefined || value === "" ? "—" : Number(value).toFixed(2).replace(".", ",");
export const fmtCredits = (value: number | string | null | undefined) =>
  value === null || value === undefined ? "—" : String(Number(value)).replace(".", ",");
