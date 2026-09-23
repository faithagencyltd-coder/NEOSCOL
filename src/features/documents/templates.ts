import type { TextDocumentKind } from "./types";

/**
 * Document Studio : textes par défaut des documents rédigés et variables
 * disponibles. Chaque établissement peut remplacer titre, corps et formule
 * finale (document_templates.layout) ; les variables {{…}} sont remplacées à
 * l'émission, et les valeurs figées dans l'instantané du document.
 */
export type TemplateDefaults = {
  label: string;
  description: string;
  title: string;
  body: string;
  closing: string;
  /** Libellé du champ libre {{contenu}} demandé à l'émission (null : pas de champ). */
  content: { label: string; required: boolean; placeholder: string } | null;
};

export const TEMPLATE_DEFAULTS: Record<TextDocumentKind, TemplateDefaults> = {
  school_certificate: {
    label: "Certificat de scolarité",
    description: "Atteste l'inscription de l'élève pour l'année en cours.",
    title: "CERTIFICAT DE SCOLARITÉ",
    body: "Je soussigné(e), {{signataire.nom}}, {{signataire.fonction}} de {{etablissement.nom}}, certifie que l'élève {{eleve.prenom}} {{eleve.nom}}, matricule {{eleve.matricule}}, né(e) le {{eleve.date_naissance}} à {{eleve.lieu_naissance}}, est régulièrement inscrit(e) en classe de {{classe.nom}} pour l'année scolaire {{annee.nom}}.",
    closing: "En foi de quoi, le présent document lui est délivré pour servir et valoir ce que de droit.",
    content: { label: "Motif de la demande (facultatif)", required: false, placeholder: "Dossier de bourse" },
  },
  attestation: {
    label: "Attestation",
    description: "Attestation libre : l'objet est saisi à chaque délivrance.",
    title: "ATTESTATION",
    body: "Je soussigné(e), {{signataire.nom}}, {{signataire.fonction}} de {{etablissement.nom}}, atteste que l'élève {{eleve.prenom}} {{eleve.nom}}, matricule {{eleve.matricule}}, inscrit(e) en classe de {{classe.nom}} : {{contenu}}",
    closing: "En foi de quoi, le présent document lui est délivré pour servir et valoir ce que de droit.",
    content: { label: "Objet de l'attestation", required: true, placeholder: "a suivi assidûment les cours du premier trimestre." },
  },
  training_certificate: {
    label: "Certificat de formation",
    description: "Pour les centres de formation : atteste le suivi d'une formation.",
    title: "CERTIFICAT DE FORMATION",
    body: "Je soussigné(e), {{signataire.nom}}, {{signataire.fonction}} de {{etablissement.nom}}, certifie que {{eleve.prenom}} {{eleve.nom}}, matricule {{eleve.matricule}}, né(e) le {{eleve.date_naissance}}, a suivi la formation « {{formation.nom}} » (session {{classe.nom}}, {{annee.nom}}). {{contenu}}",
    closing: "Le présent certificat lui est délivré pour servir et valoir ce que de droit.",
    content: { label: "Précisions (durée, résultat…) — facultatif", required: false, placeholder: "Durée : 120 heures. Résultat : admis(e)." },
  },
  convocation: {
    label: "Convocation",
    description: "Convocation de l'élève ou de sa famille (conseil, examen, entretien).",
    title: "CONVOCATION",
    body: "{{etablissement.nom}} convoque {{eleve.prenom}} {{eleve.nom}}, matricule {{eleve.matricule}}, élève en classe de {{classe.nom}}, accompagné(e) de son parent ou tuteur : {{contenu}}",
    closing: "La présence est obligatoire. En cas d'empêchement, merci de prévenir l'administration.",
    content: { label: "Objet, date, heure et lieu", required: true, placeholder: "entretien avec la direction le lundi 12 octobre à 9 h, bureau du proviseur." },
  },
  contract: {
    label: "Contrat de scolarité / formation",
    description: "Engagements réciproques de l'établissement et de la famille.",
    title: "CONTRAT DE SCOLARITÉ",
    body: "Entre {{etablissement.nom}}, représenté par {{signataire.nom}}, {{signataire.fonction}}, et la famille de {{eleve.prenom}} {{eleve.nom}}, matricule {{eleve.matricule}}, inscrit(e) en classe de {{classe.nom}} pour l'année {{annee.nom}}, il est convenu ce qui suit : l'établissement assure l'enseignement et l'encadrement de l'élève ; la famille s'engage à respecter le règlement intérieur et à régler les frais de scolarité selon l'échéancier convenu. {{contenu}}",
    closing: "Fait en deux exemplaires originaux, lu et approuvé.",
    content: { label: "Clauses particulières (facultatif)", required: false, placeholder: "Remise de 10 % accordée sur la scolarité." },
  },
  custom: {
    label: "Document personnalisé",
    description: "Modèle libre créé par l'établissement.",
    title: "DOCUMENT",
    body: "{{contenu}}",
    closing: "",
    content: { label: "Contenu variable (facultatif)", required: false, placeholder: "" },
  },
};

export const TEMPLATE_VARIABLES: { key: string; label: string; sample: string }[] = [
  { key: "eleve.nom", label: "Nom de l'élève", sample: "KOUASSI" },
  { key: "eleve.prenom", label: "Prénom", sample: "Aya" },
  { key: "eleve.matricule", label: "Matricule", sample: "DEMO-26-00001" },
  { key: "eleve.date_naissance", label: "Date de naissance", sample: "12 mars 2014" },
  { key: "eleve.lieu_naissance", label: "Lieu de naissance", sample: "Abidjan" },
  { key: "classe.nom", label: "Classe / session", sample: "6e A" },
  { key: "formation.nom", label: "Filière / formation", sample: "Enseignement général" },
  { key: "annee.nom", label: "Année scolaire", sample: "2026-2027" },
  { key: "etablissement.nom", label: "Établissement", sample: "Collège NéoScol" },
  { key: "signataire.nom", label: "Signataire", sample: "M. Koné" },
  { key: "signataire.fonction", label: "Fonction du signataire", sample: "Directeur" },
  { key: "date", label: "Date du jour", sample: "23 septembre 2026" },
  { key: "contenu", label: "Champ saisi à l'émission", sample: "…" },
];

/** Remplace les variables {{cle}} ; les variables inconnues restent visibles. */
export function fillText(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_.]+)\s*\}\}/g, (match, key: string) => values[key] ?? match).replace(/[ \t]+$/gm, "").trim();
}

export function sampleValues(overrides: Record<string, string> = {}): Record<string, string> {
  return { ...Object.fromEntries(TEMPLATE_VARIABLES.map((v) => [v.key, v.sample])), ...overrides };
}
