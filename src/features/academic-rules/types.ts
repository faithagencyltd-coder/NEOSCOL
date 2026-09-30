/** Règles académiques (validées en base par app.academic_rules_error). */
export type AcademicDecision = { min: number; code: string; label: string };
export type AcademicMention = { min: number; label: string };
export type AcademicRules = {
  grading_scale?: number;
  pass_mark?: number;
  annual: { mode: "weights"; weights: number[] } | { mode: "formula"; formula: string };
  missing_period?: "reweight" | "incomplete";
  round?: number;
  mentions?: AcademicMention[];
  decisions: AcademicDecision[];
};

export type RuleResult = {
  average: number | null;
  complete: boolean;
  passed: boolean;
  mention: string | null;
  decision_code: string | null;
  decision_label: string | null;
  error?: string;
};

export type RuleSetRow = {
  id: string;
  organization_id: string | null;
  country_code: string | null;
  education_type: string;
  name: string;
  version: number;
  status: "draft" | "published" | "archived";
  rules: AcademicRules;
  notes: string | null;
  created_at: string;
  published_at: string | null;
  based_on_id: string | null;
};

export const DEFAULT_RULES: AcademicRules = {
  grading_scale: 20,
  pass_mark: 10,
  annual: { mode: "weights", weights: [1, 1, 1] },
  missing_period: "reweight",
  round: 2,
  mentions: [
    { min: 16, label: "Très bien" },
    { min: 14, label: "Bien" },
    { min: 12, label: "Assez bien" },
    { min: 10, label: "Passable" },
    { min: 0, label: "Insuffisant" },
  ],
  decisions: [
    { min: 10, code: "promoted", label: "Admis(e) en classe supérieure" },
    { min: 8.5, code: "repeat", label: "Autorisé(e) à redoubler" },
    { min: 0, code: "excluded", label: "Exclu(e) pour insuffisance de résultats" },
  ],
};

export const RULE_STATUS: Record<string, { label: string; tone: "neutral" | "success" | "warning" }> = {
  draft: { label: "Brouillon", tone: "warning" },
  published: { label: "En vigueur", tone: "success" },
  archived: { label: "Archivée", tone: "neutral" },
};

export const RULE_SOURCE: Record<string, string> = {
  organization: "Règles de l'établissement",
  country: "Modèle du pays",
  platform: "Modèle de la plateforme",
  default: "Règles par défaut de NEOSCOOL",
};
