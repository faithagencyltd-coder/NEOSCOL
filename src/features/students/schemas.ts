import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional();
const today = () => new Date().toISOString().slice(0, 10);

export const STUDENT_FIELDS = [
  "first_name", "last_name", "other_names", "sex", "birth_date", "birth_place",
  "nationality", "national_id", "address", "city", "phone", "email", "notes",
] as const;

export const studentSchema = z.object({
  first_name: z.string({ error: "Prénom requis." }).trim().min(1, { error: "Prénom requis." }).max(80),
  last_name: z.string({ error: "Nom requis." }).trim().min(1, { error: "Nom requis." }).max(80),
  other_names: optionalText(120),
  sex: z.enum(["M", "F"], { error: "Sexe invalide." }).optional(),
  birth_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Date invalide." })
    .refine((d) => d <= today() && d >= "1900-01-01", { error: "Date de naissance invalide." })
    .optional(),
  birth_place: optionalText(120),
  nationality: optionalText(60),
  national_id: optionalText(60),
  address: optionalText(200),
  city: optionalText(80),
  phone: z.string().trim().regex(/^\+?[0-9 .-]{6,20}$/, { error: "Numéro invalide." }).optional(),
  email: z.email({ error: "E-mail invalide." }).trim().toLowerCase().optional(),
  notes: optionalText(2000),
});

export type StudentInput = z.infer<typeof studentSchema>;

export const GUARDIAN_FIELDS = ["relationship", "first_name", "last_name", "phone", "email", "profession"] as const;

export const guardianSchema = z.object({
  relationship: z.enum(["father", "mother", "tutor", "grandparent", "sibling", "other"]).default("tutor"),
  first_name: z.string({ error: "Prénom requis." }).trim().min(1, { error: "Prénom requis." }).max(80),
  last_name: z.string({ error: "Nom requis." }).trim().min(1, { error: "Nom requis." }).max(80),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s.-]/g, ""))
    .pipe(z.string().regex(/^\+?[0-9]{8,15}$/, { error: "Numéro invalide (format international conseillé : +225…)." }))
    .optional(),
  email: z.email({ error: "E-mail invalide." }).trim().toLowerCase().optional(),
  profession: optionalText(80),
});

export type GuardianInput = z.infer<typeof guardianSchema>;

export const medicalSchema = z.object({
  blood_group: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).optional(),
  allergies: optionalText(1000),
  conditions: optionalText(1000),
  medications: optionalText(1000),
  emergency_contact_name: optionalText(120),
  emergency_contact_phone: optionalText(30),
  doctor_name: optionalText(120),
  doctor_phone: optionalText(30),
  notes: optionalText(2000),
});

export const MEDICAL_FIELDS = [
  "blood_group", "allergies", "conditions", "medications", "emergency_contact_name",
  "emergency_contact_phone", "doctor_name", "doctor_phone", "notes",
] as const;
