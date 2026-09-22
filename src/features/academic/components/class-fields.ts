import type { QuickField } from "@/components/shared/quick-form-dialog";
import { CLASS_KIND, options } from "@/lib/labels";

type Option = { id: string; name: string };
type Teacher = { id: string; first_name: string; last_name: string };

/** Champs du formulaire de classe (création et modification). */
export function classFields(
  refs: { levels: Option[]; programs: Option[]; rooms: Option[]; teachers: Teacher[] },
  values: Partial<Record<string, string | number | null>> = {},
): QuickField[] {
  const v = (key: string) => (values[key] === null || values[key] === undefined ? undefined : String(values[key]));
  return [
    { name: "name", label: "Nom", required: true, placeholder: "6e A", defaultValue: v("name") },
    { name: "code", label: "Code", placeholder: "6A", defaultValue: v("code") },
    { name: "kind", label: "Type", type: "select", required: true, options: options(CLASS_KIND), defaultValue: v("kind") ?? "class" },
    { name: "capacity", label: "Capacité", type: "number", min: 1, defaultValue: v("capacity") },
    { name: "level_id", label: "Niveau", type: "select", options: refs.levels.map((l) => ({ value: l.id, label: l.name })), defaultValue: v("level_id") },
    { name: "program_id", label: "Filière / formation", type: "select", options: refs.programs.map((p) => ({ value: p.id, label: p.name })), defaultValue: v("program_id") },
    { name: "room_id", label: "Salle", type: "select", options: refs.rooms.map((r) => ({ value: r.id, label: r.name })), defaultValue: v("room_id") },
    {
      name: "head_teacher_id",
      label: "Professeur principal / formateur référent",
      type: "select",
      options: refs.teachers.map((t) => ({ value: t.id, label: `${t.last_name} ${t.first_name}` })),
      defaultValue: v("head_teacher_id"),
      wide: true,
    },
    { name: "starts_on", label: "Début (sessions)", type: "date", defaultValue: v("starts_on") },
    { name: "ends_on", label: "Fin (sessions)", type: "date", defaultValue: v("ends_on") },
  ];
}
