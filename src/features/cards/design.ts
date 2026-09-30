/**
 * Cartes élève / apprenant / étudiant : modèles de design (choisis par chaque
 * établissement), vocabulaire propre à chaque module et données affichées.
 * Partagé serveur / navigateur : aucune donnée, uniquement des règles.
 */
import type { Vocabulary } from "@/lib/vocabulary";

export const CARD_TEMPLATES = {
  prestige: { label: "Prestige (bleu nuit et or)", primary: "#0b1f3a", accent: "#d4a82a" },
  ocean: { label: "Océan (bleu NeoScool)", primary: "#0b2e6f", accent: "#0a9cf5" },
  emeraude: { label: "Émeraude", primary: "#064e3b", accent: "#f59e0b" },
  bordeaux: { label: "Bordeaux", primary: "#5b1020", accent: "#d4a82a" },
  graphite: { label: "Graphite", primary: "#1f2937", accent: "#38bdf8" },
} as const;
export type CardTemplate = keyof typeof CARD_TEMPLATES;

export type CardDesign = {
  template: CardTemplate;
  primary: string;
  accent: string;
  slogan: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  administration: string | null;
  notice: string;
  lost_text: string | null;
  show_photo: boolean;
  show_barcode: boolean;
  show_validity: boolean;
  show_enrolled_on: boolean;
};

/** Valeurs par défaut de l'établissement (coordonnées déjà saisies dans Paramètres › Établissement). */
export type CardOrganizationDefaults = { address?: string | null; city?: string | null; phone?: string | null; email?: string | null; website?: string | null; signatory?: string | null };

const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

export function isCardTemplate(value: unknown): value is CardTemplate {
  return typeof value === "string" && value in CARD_TEMPLATES;
}

/** Design effectif : réglages enregistrés (settings.card_design) complétés par les valeurs par défaut. */
export function resolveCardDesign(settings: unknown, org: CardOrganizationDefaults = {}): CardDesign {
  const raw = (settings && typeof settings === "object" ? (settings as Record<string, unknown>).card_design : null) as Record<string, unknown> | null;
  const d = raw && typeof raw === "object" ? raw : {};
  const template = isCardTemplate(d.template) ? d.template : "prestige";
  const phone = str(d.phone) ?? str(org.phone);
  return {
    template,
    primary: isHex(d.primary) ? d.primary : CARD_TEMPLATES[template].primary,
    accent: isHex(d.accent) ? d.accent : CARD_TEMPLATES[template].accent,
    slogan: str(d.slogan),
    address: str(d.address) ?? ([str(org.address), str(org.city)].filter(Boolean).join(", ") || null),
    phone,
    email: str(d.email) ?? str(org.email),
    website: str(d.website) ?? str(org.website),
    administration: str(d.administration) ?? str(org.signatory),
    notice: str(d.notice) ?? "À porter de façon visible dans l'enceinte de l'établissement. En cas de perte, prévenez immédiatement l'administration.",
    lost_text: str(d.lost_text) ?? (phone ? `Carte trouvée ? Appelez le ${phone}.` : null),
    show_photo: bool(d.show_photo, true),
    show_barcode: bool(d.show_barcode, true),
    show_validity: bool(d.show_validity, true),
    show_enrolled_on: bool(d.show_enrolled_on, true),
  };
}

/** Titre de la carte et intitulés, propres au module de l'établissement. */
export function cardLabels(v: Vocabulary) {
  switch (v.family) {
    case "higher":
      return { title: "CARTE ÉTUDIANT", holder: "Étudiant", year: "ANNÉE ACADÉMIQUE", program: "FILIÈRE", group: "NIVEAU" };
    case "training":
      return { title: "CARTE APPRENANT", holder: "Apprenant", year: "ANNÉE DE FORMATION", program: "FORMATION", group: "SESSION" };
    default:
      return { title: "CARTE SCOLAIRE", holder: "Élève", year: "ANNÉE SCOLAIRE", program: "CLASSE", group: "NIVEAU" };
  }
}

export type CardData = {
  title: string;
  yearLabel: string | null;
  organization: { name: string; kind: string; logo: string | null; demo: boolean };
  holder: { lastName: string; firstName: string; matricule: string; photo: string | null };
  fields: { label: string; value: string }[];
  enrolledOn: string | null;
  validity: string | null;
  qr: string | null;
  badgeNumber: string | null;
  barcode: string;
};

/** Carte d'exemple pour l'aperçu des réglages (aucune donnée réelle). */
export function sampleCard(v: Vocabulary, organization: CardData["organization"]): CardData {
  const l = cardLabels(v);
  const fields =
    v.family === "higher"
      ? [{ label: l.program, value: "Informatique" }, { label: l.group, value: "Licence 1" }]
      : v.family === "training"
        ? [{ label: l.program, value: "Design et architecture d'intérieur" }, { label: l.group, value: "DESIGN-2026-A" }]
        : [{ label: l.program, value: "6e A" }, { label: l.group, value: "Sixième" }];
  return {
    title: l.title,
    yearLabel: `${l.year} 2026-2027`,
    organization,
    holder: { lastName: "ADJEVI", firstName: "Gloria", matricule: "DEMO-26-00002", photo: null },
    fields,
    enrolledOn: "29/09/2026",
    validity: "Fin 2026-2027",
    qr: null,
    badgeNumber: "EXEMPLE",
    barcode: "DEMO-26-00002",
  };
}
