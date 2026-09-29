import type { QuickField } from "@/components/shared/quick-form-dialog";

import { CC_FIELDS, columnsToText, type CcMapping } from "./types";

/** Champs du formulaire d'une correspondance (établissement ou modèle pays). */
export function mappingFields(m: CcMapping | null): QuickField[] {
  return [
    { name: "name", label: "Nom", required: true, defaultValue: m?.name, placeholder: "Liste officielle des INE" },
    {
      name: "direction",
      label: "Sens",
      type: "select",
      required: true,
      options: [
        { value: "import", label: "Import (fichier reçu)" },
        { value: "export", label: "Export (fichier à transmettre)" },
      ],
      defaultValue: m?.direction ?? "import",
    },
    {
      name: "columns",
      label: "Colonnes (une par ligne : EN-TÊTE = champ)",
      type: "textarea",
      required: true,
      wide: true,
      defaultValue: m ? columnsToText(m.columns) : "MATRICULE = matricule\nINE = national_id\nNOM = last_name\nPRENOMS = first_name",
      hint: `Champs : ${CC_FIELDS.map((f) => `${f.key} (${f.label})`).join(", ")}.`,
    },
    {
      name: "delimiter",
      label: "Séparateur CSV",
      type: "select",
      options: [
        { value: ";", label: "Point-virgule ;" },
        { value: ",", label: "Virgule ," },
        { value: "tab", label: "Tabulation" },
      ],
      defaultValue: m?.delimiter ?? ";",
    },
    {
      name: "date_format",
      label: "Format des dates",
      type: "select",
      options: [
        { value: "dd/MM/yyyy", label: "31/12/2026" },
        { value: "yyyy-MM-dd", label: "2026-12-31" },
        { value: "MM/dd/yyyy", label: "12/31/2026" },
      ],
      defaultValue: m?.date_format ?? "dd/MM/yyyy",
    },
    { name: "description", label: "Description", type: "textarea", wide: true, defaultValue: m?.description ?? "" },
    { name: "is_active", label: "Active", type: "checkbox", defaultValue: !m || m.is_active ? "true" : "false" },
  ];
}
