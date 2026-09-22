import { z } from "zod";

export const emailSchema = z.email({ error: "Adresse e-mail invalide." }).trim().toLowerCase();

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "Mot de passe requis." }),
});

/** Numéro au format international E.164 (ex. +2250700000001). */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s.-]/g, ""))
  .transform((value) => (value.startsWith("00") ? `+${value.slice(2)}` : value))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, { error: "Numéro invalide : utilisez le format international (+225…)." }));

export const otpSchema = z.object({
  phone: phoneSchema,
  token: z.string().trim().regex(/^\d{6}$/, { error: "Le code comporte 6 chiffres." }),
});

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(10, { error: "10 caractères minimum." })
      .regex(/[A-Za-z]/, { error: "Au moins une lettre." })
      .regex(/\d/, { error: "Au moins un chiffre." }),
    confirmation: z.string(),
  })
  .refine((value) => value.password === value.confirmation, {
    error: "Les mots de passe ne correspondent pas.",
    path: ["confirmation"],
  });
