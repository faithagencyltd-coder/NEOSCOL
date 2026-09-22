import { z } from "zod";

/**
 * Formulaires personnalisables : définition des champs (stockée en JSON dans
 * form_definitions.fields) et validation SERVEUR construite à partir de cette
 * définition. Le client ne décide jamais de ce qui est valide.
 */
export const FIELD_TYPES = {
  text: "Texte court",
  textarea: "Texte long",
  number: "Nombre",
  date: "Date",
  select: "Liste de choix",
  checkbox: "Case à cocher",
  phone: "Téléphone",
  email: "E-mail",
  file: "Pièce à fournir",
} as const;

export type FieldType = keyof typeof FIELD_TYPES;

export const fieldDefinitionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, { error: "Identifiant invalide (minuscules, chiffres, _)." }),
  label: z.string().trim().min(1, { error: "Libellé requis." }).max(120),
  type: z.enum(Object.keys(FIELD_TYPES) as [FieldType, ...FieldType[]]),
  required: z.boolean().optional().default(false),
  options: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  section: z.string().trim().max(60).optional(),
  help: z.string().trim().max(200).optional(),
});

export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;

export const fieldListSchema = z
  .array(fieldDefinitionSchema)
  .max(60, { error: "60 champs maximum." })
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    fields.forEach((field, index) => {
      if (seen.has(field.key)) {
        ctx.addIssue({ code: "custom", message: `Identifiant en double : ${field.key}`, path: [index, "key"] });
      }
      seen.add(field.key);
      if (field.type === "select" && (!field.options || field.options.length === 0)) {
        ctx.addIssue({ code: "custom", message: `« ${field.label} » : ajoutez au moins une option.`, path: [index, "options"] });
      }
    });
  });

/** Lit une définition stockée en base ; les champs invalides sont ignorés. */
export function parseFields(value: unknown): FieldDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const parsed = fieldDefinitionSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Nom du contrôle HTML d'un champ personnalisé. */
export const inputName = (key: string) => `cf_${key}`;

function valueSchema(field: FieldDefinition) {
  const requiredMessage = `« ${field.label} » est obligatoire.`;
  switch (field.type) {
    case "checkbox":
    case "file":
      // « Pièce à fournir » : on enregistre sa réception (dépôt physique au secrétariat).
      return z.boolean();
    case "number": {
      const n = z.coerce.number({ error: `« ${field.label} » doit être un nombre.` });
      return field.required ? n : n.optional();
    }
    case "date": {
      const d = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: `« ${field.label} » : date invalide.` });
      return field.required ? d : d.optional();
    }
    case "email": {
      const e = z.email({ error: `« ${field.label} » : e-mail invalide.` });
      return field.required ? e : e.optional();
    }
    case "phone": {
      const p = z.string().regex(/^\+?[0-9 .-]{6,20}$/, { error: `« ${field.label} » : numéro invalide.` });
      return field.required ? p : p.optional();
    }
    case "select": {
      const options = field.options ?? [];
      const s = z.string().refine((v) => options.includes(v), { error: `« ${field.label} » : choix invalide.` });
      return field.required ? s : s.optional();
    }
    default: {
      const t = z.string().max(field.type === "textarea" ? 2000 : 200);
      return field.required ? t.min(1, { error: requiredMessage }) : t.optional();
    }
  }
}

export type CustomValues = Record<string, string | number | boolean>;

/** Valide les valeurs saisies (FormData) contre la définition. */
export function parseCustomValues(
  fields: FieldDefinition[],
  formData: FormData,
): { ok: true; values: CustomValues } | { ok: false; errors: Record<string, string[]> } {
  const values: CustomValues = {};
  const errors: Record<string, string[]> = {};
  for (const field of fields) {
    const raw = formData.get(inputName(field.key));
    const input =
      field.type === "checkbox" || field.type === "file"
        ? raw === "on"
        : typeof raw === "string" && raw.trim() !== ""
          ? raw.trim()
          : undefined;
    if (field.required && input === undefined && field.type !== "checkbox" && field.type !== "file") {
      errors[inputName(field.key)] = [`« ${field.label} » est obligatoire.`];
      continue;
    }
    const parsed = valueSchema(field).safeParse(input);
    if (!parsed.success) {
      errors[inputName(field.key)] = [parsed.error.issues[0]?.message ?? "Valeur invalide."];
    } else if (parsed.data !== undefined) {
      values[field.key] = parsed.data;
    }
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, values };
}

/** Transforme un libellé en identifiant stable (« Date d'arrivée » → date_d_arrivee). */
export function slugifyKey(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[a-z]/.test(slug) ? slug : `champ_${slug}`.slice(0, 40);
}

/** Valeur affichable d'un champ personnalisé enregistré. */
export function displayValue(field: FieldDefinition, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (field.type === "checkbox") return value === true ? "Oui" : "Non";
  if (field.type === "file") return value === true ? "Fournie" : "Manquante";
  if (field.type === "date" && typeof value === "string") {
    const [y, m, d] = value.split("-");
    return y && m && d ? `${d}/${m}/${y}` : value;
  }
  return String(value);
}
