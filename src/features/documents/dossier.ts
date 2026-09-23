/** Pièces du dossier complet d'un élève, dans l'ordre par défaut. */
export const DOSSIER_SECTIONS = [
  { key: "fiche", label: "Fiche(s) d'inscription" },
  { key: "engagement", label: "Engagement du parent / tuteur" },
  { key: "factures", label: "Factures" },
  { key: "recus", label: "Reçus de paiement" },
  { key: "certificats", label: "Certificats, attestations et cartes" },
  { key: "bulletins", label: "Bulletins publiés" },
  { key: "pieces", label: "Pièces jointes (justificatifs déposés)" },
] as const;

export type DossierSectionKey = (typeof DOSSIER_SECTIONS)[number]["key"];

export function isDossierSection(value: string): value is DossierSectionKey {
  return DOSSIER_SECTIONS.some((s) => s.key === value);
}

/** Ordre demandé (liste « a,b,c »), sinon ordre enregistré, sinon ordre par défaut. */
export function dossierOrder(requested: string | null, saved: unknown): DossierSectionKey[] {
  const parse = (value: unknown) =>
    (Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [])
      .map((v) => String(v).trim())
      .filter(isDossierSection);
  const fromRequest = parse(requested);
  if (fromRequest.length) return [...new Set(fromRequest)];
  const fromSettings = parse(saved);
  if (fromSettings.length) return [...new Set(fromSettings)];
  return DOSSIER_SECTIONS.map((s) => s.key);
}
