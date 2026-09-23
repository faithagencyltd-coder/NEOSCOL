import { z } from "zod";

import { ASSESSMENT_KINDS } from "@/lib/labels";

/** Configuration du bulletin (report_card_settings.config), validée côté serveur ET en base. */
const kinds = Object.keys(ASSESSMENT_KINDS) as [keyof typeof ASSESSMENT_KINDS, ...(keyof typeof ASSESSMENT_KINDS)[]];
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, { error: "Couleur invalide (#RRGGBB)." });
const rule = z.object({ min: z.coerce.number().min(0).max(20), label: z.string().trim().min(1).max(80) });

export const reportConfigSchema = z
  .object({
    title: z.string().trim().min(3).max(80),
    calculation: z.enum(["assessments", "columns"]),
    columns: z
      .array(
        z.object({
          key: z.string().regex(/^[a-z0-9_]{1,30}$/, { error: "Identifiant de colonne invalide." }),
          label: z.string().trim().min(1, { error: "Libellé de colonne requis." }).max(20),
          kinds: z.array(z.enum(kinds)).max(7),
          weight: z.coerce.number().positive({ error: "Pondération positive attendue." }).max(100),
        }),
      )
      .max(12),
    show_teacher: z.boolean(),
    show_rank: z.boolean(),
    show_subject_rank: z.boolean(),
    show_class_stats: z.boolean(),
    show_attendance: z.boolean(),
    show_appreciation: z.boolean(),
    show_logo: z.boolean(),
    show_stamp: z.boolean(),
    show_qr: z.boolean(),
    mentions: z.array(rule).max(10),
    decisions: z.array(rule).max(10),
    signatures: z.array(z.object({ label: z.string().trim().min(1).max(60) })).min(1).max(4),
    primary_color: color,
    accent_color: color,
    footer_note: z.string().trim().max(300),
  })
  .superRefine((config, ctx) => {
    const keys = new Set<string>();
    config.columns.forEach((c, i) => {
      if (keys.has(c.key)) ctx.addIssue({ code: "custom", message: `Colonne en double : ${c.label}`, path: ["columns", i] });
      keys.add(c.key);
    });
    if (config.calculation === "columns" && config.columns.length === 0) {
      ctx.addIssue({ code: "custom", message: "Le calcul par colonnes nécessite au moins une colonne.", path: ["columns"] });
    }
  });

export type ReportConfig = z.infer<typeof reportConfigSchema>;

export const DEFAULT_REPORT_CONFIG: ReportConfig = {
  title: "BULLETIN DE NOTES",
  calculation: "assessments",
  columns: [
    { key: "interro1", label: "INTERRO 1", kinds: ["test", "oral"], weight: 1 },
    { key: "interro2", label: "INTERRO 2", kinds: ["test", "oral"], weight: 1 },
    { key: "devoir", label: "DEVOIR", kinds: ["homework", "practical", "project"], weight: 1 },
    { key: "examen", label: "EXAMEN", kinds: ["exam", "other"], weight: 2 },
  ],
  show_teacher: true,
  show_rank: true,
  show_subject_rank: false,
  show_class_stats: true,
  show_attendance: true,
  show_appreciation: true,
  show_logo: true,
  show_stamp: true,
  show_qr: true,
  mentions: [
    { min: 16, label: "Très bien" },
    { min: 14, label: "Bien" },
    { min: 12, label: "Assez bien" },
    { min: 10, label: "Passable" },
    { min: 0, label: "Insuffisant" },
  ],
  decisions: [
    { min: 10, label: "Admis(e) en classe supérieure" },
    { min: 8.5, label: "Autorisé(e) à redoubler" },
    { min: 0, label: "Exclu(e) pour insuffisance de résultats" },
  ],
  signatures: [{ label: "Le professeur principal" }, { label: "Le chef d'établissement" }],
  primary_color: "#0B1F3A",
  accent_color: "#1E6FFF",
  footer_note: "",
};

/** Lit la configuration stockée en complétant les valeurs manquantes. */
export function readReportConfig(raw: unknown): ReportConfig {
  const merged = { ...DEFAULT_REPORT_CONFIG, ...(raw && typeof raw === "object" ? raw : {}) };
  const parsed = reportConfigSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_REPORT_CONFIG;
}

export const BOOLEAN_OPTIONS: { key: keyof ReportConfig; label: string }[] = [
  { key: "show_teacher", label: "Nom de l'enseignant par matière" },
  { key: "show_rank", label: "Rang de l'élève" },
  { key: "show_subject_rank", label: "Rang par matière" },
  { key: "show_class_stats", label: "Moyenne, minimum et maximum de la classe" },
  { key: "show_attendance", label: "Absences et retards de la période" },
  { key: "show_appreciation", label: "Appréciation (mention) par matière" },
  { key: "show_logo", label: "Logo de l'établissement" },
  { key: "show_stamp", label: "Cachet" },
  { key: "show_qr", label: "QR Code de vérification" },
];
