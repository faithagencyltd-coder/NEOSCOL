import type { IllustrationName } from "@/components/illustrations/scenes";

/**
 * Bibliothèque visuelle NEOSCOOL : photos réelles fournies (authenticité, humain,
 * confiance) + illustrations maison (explication, identité). Chaque visuel a une
 * fonction et des emplacements précis ; aucun n'est décoratif « pour remplir ».
 */
export type SitePhotoName = "eleves-campus" | "lyceenne-campus" | "lyceenne-portrait";

export const SITE_PHOTOS: Record<
  SitePhotoName,
  { widths: number[]; ratio: number; alt: { fr: string; en: string }; subject: string; framing: string; usedIn: string[]; transparent?: boolean }
> = {
  "eleves-campus": {
    widths: [640, 960, 1536],
    ratio: 1536 / 1024,
    alt: { fr: "Deux lycéens souriants en uniforme devant leur établissement", en: "Two smiling high-school students in uniform in front of their school" },
    subject: "Deux lycéens en uniforme (chemise blanche, cravate bleue), sacs à dos, campus moderne bleu et blanc au logo de toque.",
    framing: "Paysage, sujets centrés-gauche : recadrage mobile centré sur les visages (object-position 35% 30%).",
    usedIn: ["Accueil — visuel principal (hero)", "Page Écoles — en-tête"],
  },
  "lyceenne-campus": {
    widths: [640, 960, 1536],
    ratio: 1536 / 1024,
    alt: { fr: "Lycéenne confiante dans la cour de son établissement, entourée de ses camarades", en: "Confident high-school student in her schoolyard among classmates" },
    subject: "Lycéenne au premier plan, regard vers l'avenir, groupe d'élèves en arrière-plan flou.",
    framing: "Paysage, sujet au centre : en fond de bandeau avec dégradé bleu nuit à gauche (texte lisible).",
    usedIn: ["Appel final, en fond (toutes les pages du site)"],
  },
  "lyceenne-portrait": {
    widths: [400, 600, 900],
    ratio: 966 / 1399,
    alt: { fr: "Élève souriante, sac au dos, prête pour sa journée", en: "Smiling student with her backpack, ready for the day" },
    subject: "Portrait détouré (fond transparent) d'une lycéenne tenant les bretelles de son sac.",
    framing: "Portrait détouré : posé en bas du panneau, s'intègre sur fond sombre ou clair.",
    usedIn: ["Connexion et accès aux portails — panneau de marque", "Tarifs — en-tête"],
    transparent: true,
  },
};

export function photoSrc(name: SitePhotoName, width?: number): string {
  const p = SITE_PHOTOS[name];
  const w = width ?? p.widths[p.widths.length - 1]!;
  return `/site/photos/${name}-${w}.webp`;
}

/** Emplacements des illustrations (même famille visuelle, voir components/illustrations/kit.tsx). */
export const ILLUSTRATION_USES: Record<IllustrationName, { label: string; usedIn: string[] }> = {
  attendance: { label: "Présence par badge QR", usedIn: ["Accueil — fonctionnalité Smart Badge", "Pages Universités et Formation — présence"] },
  grades: { label: "Notes et bulletins", usedIn: ["Pages Écoles et Universités — notes et résultats"] },
  payments: { label: "Paiements Mobile Money", usedIn: ["Tarifs — paiement en ligne", "Page Formation — échéanciers", "Crédit SMS — aucun mouvement"] },
  communication: { label: "Communication famille", usedIn: ["Accueil — fonctionnalité Notifications", "Contact — en-tête", "Page Formation — familles informées"] },
  assistant: { label: "Assistant IA", usedIn: ["Accueil — fonctionnalité IA", "Assistant — conversation vide"] },
  security: { label: "Sécurité et audit", usedIn: ["Accueil — fonctionnalité Sécurité"] },
  audit: { label: "Journal d'audit", usedIn: ["Accueil — fonctionnalité Audit"] },
  documents: { label: "Documents officiels", usedIn: ["Accueil — fonctionnalité Documents", "Page Universités — documents officiels"] },
  stats: { label: "Statistiques", usedIn: ["Accueil — fonctionnalité Statistiques"] },
  automation: { label: "Automatisation", usedIn: ["Accueil — fonctionnalité Automatisation"] },
  offline: { label: "Mode hors ligne", usedIn: ["Accueil — fonctionnalité Hors ligne"] },
  parents: { label: "Portail parent", usedIn: ["Page Écoles — parents informés", "Portail — aucun dossier rattaché"] },
  teacher: { label: "Enseignant", usedIn: ["Page Écoles — enseignants", "Mes cours — aucun cours cette semaine"] },
  training: { label: "Formation professionnelle", usedIn: ["Page Formation — en-tête"] },
  university: { label: "Université", usedIn: ["Page Universités — en-tête"] },
  empty: { label: "État vide", usedIn: ["États vides de l'application (illustration par défaut, icône de la page en pastille)"] },
};
