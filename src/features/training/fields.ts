import type { QuickField } from "@/components/shared/quick-form-dialog";

type Values = Partial<Record<string, unknown>>;
const val = (values: Values, key: string) => {
  const value = values[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
};

/** Formation : tous les champs sont définis librement par le centre. */
export function formationFields(values: Values = {}): QuickField[] {
  const v = (key: string) => val(values, key);
  return [
    { name: "name", label: "Intitulé de la formation", required: true, placeholder: "Informatique bureautique", defaultValue: v("name"), wide: true },
    { name: "code", label: "Code", required: true, placeholder: "BUREAU", defaultValue: v("code") },
    { name: "training_level", label: "Niveau requis / niveau de la formation", placeholder: "BEPC, niveau 3e…", defaultValue: v("training_level") },
    { name: "duration_hours", label: "Durée (heures)", type: "number", min: 1, placeholder: "120", defaultValue: v("duration_hours") },
    { name: "duration_label", label: "Durée affichée", placeholder: "3 mois", defaultValue: v("duration_label") },
    { name: "tuition_amount", label: "Coût de la formation", type: "number", min: 0, step: "1", placeholder: "150000", defaultValue: v("tuition_amount") },
    { name: "registration_fee", label: "Frais d'inscription", type: "number", min: 0, step: "1", placeholder: "10000", defaultValue: v("registration_fee") },
    { name: "default_installments", label: "Échéances proposées", type: "number", min: 1, max: 24, placeholder: "3", defaultValue: v("default_installments"), hint: "Nombre de versements mensuels par défaut." },
    { name: "certificate_title", label: "Certificat délivré", placeholder: "Attestation de formation en bureautique", defaultValue: v("certificate_title"), wide: true },
    { name: "admission_conditions", label: "Conditions d'admission", type: "textarea", defaultValue: v("admission_conditions"), wide: true },
    { name: "syllabus", label: "Programme", type: "textarea", placeholder: "Modules, compétences visées, stage…", defaultValue: v("syllabus"), wide: true },
    { name: "description", label: "Présentation", type: "textarea", defaultValue: v("description"), wide: true },
  ];
}

type Option = { id: string; name: string };
type Person = { id: string; first_name: string; last_name: string };

/** Session d'une formation (dates, capacité, programme, formateur référent, salle, tarif propre). */
export function sessionFields(refs: { formations: Option[]; rooms: Option[]; teachers: Person[] }, values: Values = {}): QuickField[] {
  const v = (key: string) => val(values, key);
  return [
    ...(values.program_id
      ? []
      : [{ name: "program_id", label: "Formation", type: "select" as const, required: true, options: refs.formations.map((f) => ({ value: f.id, label: f.name })), wide: true }]),
    { name: "name", label: "Nom de la session", required: true, placeholder: "Bureautique — Session janvier", defaultValue: v("name"), wide: true },
    { name: "starts_on", label: "Début", type: "date", required: true, defaultValue: v("starts_on") },
    { name: "ends_on", label: "Fin", type: "date", required: true, defaultValue: v("ends_on") },
    { name: "capacity", label: "Capacité (places)", type: "number", min: 1, defaultValue: v("capacity") },
    { name: "room_id", label: "Salle principale", type: "select", options: refs.rooms.map((r) => ({ value: r.id, label: r.name })), defaultValue: v("room_id") },
    {
      name: "head_teacher_id",
      label: "Formateur référent",
      type: "select",
      options: refs.teachers.map((t) => ({ value: t.id, label: `${t.last_name} ${t.first_name}` })),
      defaultValue: v("head_teacher_id"),
    },
    { name: "tuition_amount", label: "Tarif propre à la session", type: "number", min: 0, step: "1", defaultValue: v("tuition_amount"), hint: "Vide : coût de la formation." },
    { name: "syllabus", label: "Programme de la session", type: "textarea", defaultValue: v("syllabus"), wide: true },
  ];
}
