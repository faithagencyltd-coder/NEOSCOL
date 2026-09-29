/** Variables des modèles de messages (liste fermée, vérifiée aussi en base). */
export const MESSAGE_VARIABLES = [
  { key: "destinataire", label: "Nom du destinataire" },
  { key: "eleve_prenom", label: "Prénom de l'élève" },
  { key: "eleve_nom", label: "Nom de l'élève" },
  { key: "matricule", label: "Matricule" },
  { key: "classe", label: "Classe" },
  { key: "etablissement", label: "Établissement" },
  { key: "solde", label: "Solde dû" },
  { key: "devise", label: "Devise" },
] as const;

const PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Remplace {{variable}} ; une variable absente devient vide (jamais la balise brute). */
export function renderText(template: string, variables: Record<string, unknown>): string {
  return template.replace(PATTERN, (_, key: string) => String(variables[key] ?? ""));
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Corps d'e-mail : texte échappé (y compris les variables), retours à la ligne conservés. */
export function renderEmailHtml(template: string, variables: Record<string, unknown>, organization: string): string {
  const body = escapeHtml(renderText(template, variables)).replace(/\r?\n/g, "<br>");
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;padding:24px">
<p style="margin:0 0 16px;font-weight:bold;color:#1d4ed8">${escapeHtml(organization)}</p>
<div style="font-size:15px;line-height:1.6">${body}</div>
<p style="margin:24px 0 0;font-size:12px;color:#6b7280">Message envoyé par ${escapeHtml(organization)} via NéoScol.</p>
</div></body></html>`;
}

/** Nombre de SMS (160 caractères, 153 par segment au-delà ; 70 / 67 avec des caractères hors GSM). */
export function smsSegments(text: string): number {
  const gsm = /^[\n\r !"#$%&'()*+,\-./0-9:;<=>?@A-Z_a-z£¥èéùìòÇØøÅåΔΦΓΛΩΠΨΣΘΞÆæßÉÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/.test(text);
  const [single, multi] = gsm ? [160, 153] : [70, 67];
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
}
