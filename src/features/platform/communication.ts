/** Communication de la plateforme : libellés et mise en forme (sans accès serveur). */

export const MODULES = [
  { value: "school", label: "Module scolaire" },
  { value: "training", label: "Formation professionnelle" },
  { value: "higher", label: "Université" },
  { value: "multi", label: "Multi-modules (Module 4)" },
] as const;

export const CAMPAIGN_STATUSES = [
  { value: "TRIALING", label: "En essai gratuit" },
  { value: "ACTIVE", label: "Abonnement actif" },
  { value: "PAST_DUE", label: "À régler" },
  { value: "GRACE_PERIOD", label: "Délai de grâce" },
  { value: "RESTRICTED", label: "Restreint" },
  { value: "CANCELLED", label: "Annulé" },
  { value: "EXPIRED", label: "Expiré" },
] as const;

export const ANNOUNCEMENT_TONES = [
  { value: "info", label: "Information" },
  { value: "success", label: "Bonne nouvelle" },
  { value: "warning", label: "Important" },
  { value: "danger", label: "Urgent" },
] as const;

export const moduleLabel = (value: string) => MODULES.find((m) => m.value === value)?.label ?? value;

/** Valeurs cochées « prefix_valeur » parmi une liste autorisée. */
export function checkedValues(formData: FormData, prefix: string, allowed: readonly { value: string }[]): string[] {
  return allowed.map((a) => a.value).filter((v) => formData.get(`${prefix}_${v}`) === "on");
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** E-mail d'un envoi groupé : texte échappé, paragraphes et retours à la ligne conservés. */
export function campaignEmailHtml(subject: string, body: string, recipientName?: string | null, organizationName?: string | null): string {
  const paragraphs = body
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.6">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const greeting = recipientName?.trim() ? `<p style="margin:0 0 14px">Bonjour ${escapeHtml(recipientName.trim())},</p>` : "";
  const footer = organizationName ? `Message envoyé par NeoScool à la direction de ${escapeHtml(organizationName)}.` : "Message envoyé par NeoScool.";
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f1b3d">
<div style="max-width:600px;margin:0 auto;padding:24px">
<div style="background:#0b2559;color:#fff;border-radius:14px 14px 0 0;padding:18px 24px;font-size:18px;font-weight:bold">NeoScool</div>
<div style="background:#fff;border-radius:0 0 14px 14px;padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(subject)}</h1>${greeting}${paragraphs}
</div>
<p style="font-size:12px;color:#5b6785;margin:16px 4px">${footer}</p>
</div></body></html>`;
}

/** Variables des messages automatiques, avec un exemple pour l'aperçu. */
export const TEMPLATE_VARIABLES: Record<string, { label: string; example: string }> = {
  etablissement: { label: "Nom de l'établissement", example: "Collège Les Palmiers" },
  formule: { label: "Formule", example: "Module Scolaire" },
  jours: { label: "Jours restants", example: "3" },
  date_fin: { label: "Date de fin", example: "15/10/2026" },
  date_restriction: { label: "Date de passage en lecture seule", example: "25/10/2026" },
  date_expiration: { label: "Date d'expiration", example: "14/12/2026" },
  montant: { label: "Montant", example: "15 000 F CFA" },
  facture: { label: "Numéro de facture", example: "NSC-2026-000123" },
};

/** Même règle que la base : {variable} remplacée, variable inconnue laissée telle quelle. */
export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{([a-z_]+)\}/g, (match, key: string) => (key in vars ? vars[key]! : match));
}

export const exampleVars = (names: string[]) => Object.fromEntries(names.filter((n) => TEMPLATE_VARIABLES[n]).map((n) => [n, TEMPLATE_VARIABLES[n]!.example]));
