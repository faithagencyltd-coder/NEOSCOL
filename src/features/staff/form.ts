import type { QuickField } from "@/components/shared/quick-form-dialog";

/** Champs de la fiche du personnel (création et modification). */
export function staffFormFields(values?: Record<string, unknown>): QuickField[] {
  const v = (key: string) => (values?.[key] === null || values?.[key] === undefined ? undefined : String(values[key]));
  return [
    { name: "last_name", label: "Nom", required: true, defaultValue: v("last_name") },
    { name: "first_name", label: "Prénom(s)", required: true, defaultValue: v("first_name") },
    { name: "job_title", label: "Fonction", placeholder: "ex. Professeur de mathématiques", defaultValue: v("job_title") },
    { name: "sex", label: "Sexe", type: "select", options: [{ value: "M", label: "Masculin" }, { value: "F", label: "Féminin" }], defaultValue: v("sex") },
    { name: "email", label: "E-mail", hint: "Nécessaire pour créer le compte de connexion.", defaultValue: v("email") },
    { name: "phone", label: "Téléphone", defaultValue: v("phone") },
    { name: "hired_on", label: "Date d'embauche", type: "date", defaultValue: v("hired_on") },
    { name: "is_teacher", label: "Enseignant / formateur", type: "checkbox", defaultValue: v("is_teacher") },
  ];
}
