/** Validation d'une demande envoyée depuis le site (partagée par l'action et les tests). */
export type LeadInput = {
  kind: "contact" | "demo";
  fullName: string;
  email: string;
  phone: string;
  organization: string;
  organizationType: string;
  country: string;
  message: string;
};

const ORG_TYPES = ["school", "university", "training", "group", "other"];

export function validateLead(formData: FormData, locale: "fr" | "en"): { ok: true; value: LeadInput } | { ok: false; message: string; fieldErrors: Record<string, string[]> } {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const value: LeadInput = {
    kind: get("kind") === "demo" ? "demo" : "contact",
    fullName: get("full_name").slice(0, 120),
    email: get("email").toLowerCase().slice(0, 200),
    phone: get("phone").slice(0, 25),
    organization: get("organization").slice(0, 160),
    organizationType: ORG_TYPES.includes(get("organization_type")) ? get("organization_type") : "",
    country: get("country").slice(0, 80),
    message: get("message").slice(0, 3000),
  };
  const fr = locale === "fr";
  const errors: Record<string, string[]> = {};
  if (value.fullName.length < 2) errors.full_name = [fr ? "Indiquez votre nom." : "Please enter your name."];
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(value.email)) errors.email = [fr ? "Adresse e-mail invalide." : "Invalid e-mail address."];
  if (value.phone && !/^\+?[0-9 ().-]{6,25}$/.test(value.phone)) errors.phone = [fr ? "Numéro invalide." : "Invalid phone number."];
  if (value.kind === "contact" && value.message.length < 5) errors.message = [fr ? "Écrivez votre message." : "Please write your message."];
  if (Object.keys(errors).length) return { ok: false, message: fr ? "Vérifiez les champs indiqués." : "Please check the highlighted fields.", fieldErrors: errors };
  return { ok: true, value };
}
