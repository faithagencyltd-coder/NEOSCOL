import type { SceneSpec } from "./scenes/types";
import type { ModuleKey } from "./theme";

const C = (x: number, y: number, s: number) => ({ x, y, s });

/** Scènes de chaque vidéo, dans l'ordre de la voix off (src/voiceover.json). Captures réelles uniquement. */
export const VIDEOS: Record<ModuleKey, Record<string, SceneSpec>> = {
  scolaire: {
    intro: { kind: "hero", title: "Une école. Un seul outil.", accentWords: ["outil"], icons: ["School", "GraduationCap", "Wallet", "Users", "FileText", "ClipboardList"] },
    probleme: {
      kind: "problem",
      title: "La gestion scolaire vous prend trop de temps",
      items: [
        { icon: "BookOpen", label: "Registres papier" },
        { icon: "Sheet", label: "Tableurs dispersés" },
        { icon: "Receipt", label: "Reçus perdus" },
        { icon: "PhoneCall", label: "Appels des parents" },
        { icon: "ClipboardList", label: "Cahiers d'appel" },
        { icon: "FileText", label: "Bulletins à la main" },
      ],
    },
    dashboard: {
      kind: "screen", eyebrow: "Pilotage", title: "Votre école en temps réel", accentWords: ["temps", "réel"],
      chips: ["Effectifs", "Encaissements", "Impayés", "Absences"],
      shots: [{ src: "s-dashboard", device: "browser", move: { from: C(0.5, 0.5, 1), to: C(0.6, 0.3, 1.45) } }],
    },
    inscription: {
      kind: "screen", eyebrow: "Inscriptions", title: "Inscription, dossier, facture, carte", accentWords: ["carte"],
      chips: ["Formulaires personnalisés", "Carte 3D + QR"],
      shots: [
        { src: "s-inscription", device: "browser", move: { from: C(0.5, 0.4, 1.05), to: C(0.55, 0.32, 1.35) } },
        { src: "s-carte-3d", device: "browser", move: { from: C(0.45, 0.5, 1.2), to: C(0.4, 0.5, 1.75) } },
      ],
    },
    pointage: {
      kind: "screen", eyebrow: "Présences", title: "Un badge, une voix, un appel", accentWords: ["voix"], voice: true,
      chips: ["Scan QR", "Tablette parlante", "Même hors ligne"],
      shots: [
        { src: "s-tablette-attente", device: "tablet", move: { from: C(0.5, 0.5, 1), to: C(0.3, 0.35, 1.25) } },
        { src: "s-tablette-scan", device: "tablet", move: { from: C(0.3, 0.35, 1.25), to: C(0.3, 0.3, 1.4) } },
        { src: "s-mes-cours", device: "browser", move: { from: C(0.5, 0.4, 1.1), to: C(0.45, 0.35, 1.4) } },
      ],
    },
    notes: {
      kind: "screen", eyebrow: "Pédagogie", title: "Notes, moyennes, bulletins", accentWords: ["bulletins"],
      chips: ["Import Excel", "Calcul automatique", "Rangs"],
      shots: [
        { src: "s-notes", device: "browser", move: { from: C(0.5, 0.45, 1.1), to: C(0.45, 0.55, 1.45) } },
        { src: "s-notes-import", device: "browser", move: { from: C(0.5, 0.5, 1.2), to: C(0.5, 0.5, 1.6) } },
        { src: "s-bulletins-apercu", device: "browser", move: { from: C(0.55, 0.5, 1.2), to: C(0.55, 0.6, 1.55) } },
      ],
    },
    finances: {
      kind: "screen", eyebrow: "Finances", title: "Zéro reçu perdu", accentWords: ["Zéro"],
      chips: ["Remises", "Reliquats", "SMS · E-mail · WhatsApp"],
      shots: [
        { src: "s-finances", device: "browser", move: { from: C(0.5, 0.45, 1.05), to: C(0.55, 0.35, 1.35) } },
        { src: "s-facture", device: "browser", move: { from: C(0.5, 0.3, 1.2), to: C(0.6, 0.2, 1.55) } },
        { src: "s-impayes", device: "browser", move: { from: C(0.5, 0.5, 1.1), to: C(0.5, 0.6, 1.4) } },
      ],
    },
    parents: {
      kind: "screen", eyebrow: "Portail famille", title: "Les parents, toujours informés", accentWords: ["informés"],
      chips: ["Notes", "Absences", "Paiements", "Documents"],
      push: { title: "Paiement enregistré", body: "Reçu REC-DEMO-26-000018 — 205 000 F CFA. Reliquat : 0." },
      shots: [
        { src: "s-portail", device: "phone", move: { from: C(0.5, 0.3, 1), to: C(0.5, 0.45, 1.1) } },
        { src: "s-portail-notes", device: "phone", move: { from: C(0.5, 0.3, 1), to: C(0.5, 0.5, 1.1) } },
        { src: "s-portail-finances", device: "phone", move: { from: C(0.5, 0.3, 1), to: C(0.5, 0.45, 1.1) } },
      ],
    },
    plus: {
      kind: "mosaic", eyebrow: "Et aussi", title: "Sécurisé, vérifiable, intelligent", accentWords: ["intelligent"],
      tiles: [
        { src: "s-verifier", device: "phone" },
        { src: "s-assistant", device: "browser", move: { from: C(0.5, 0.3, 1.4), to: C(0.5, 0.35, 1.6) } },
        { src: "s-audit", device: "browser" },
        { src: "s-passage", device: "browser" },
      ],
    },
    benefices: {
      kind: "benefits", title: "Chacun y gagne",
      items: [
        { icon: "LayoutDashboard", who: "Direction", text: "Une vision claire et des finances maîtrisées" },
        { icon: "Presentation", who: "Enseignants", text: "Moins de papier, plus de pédagogie" },
        { icon: "Users", who: "Parents", text: "La sérénité, informés en temps réel" },
        { icon: "Backpack", who: "Élèves", text: "Un parcours suivi de près" },
      ],
    },
    cta: { kind: "cta", slogan: "Plus qu'un logiciel, une vision pour l'éducation." },
  },
  formation: {
    intro: { kind: "hero", title: "Former. Suivre. Certifier.", accentWords: ["Certifier."], icons: ["Wrench", "Award", "Clock", "Wallet", "Users", "Presentation"] },
    probleme: {
      kind: "problem",
      title: "Un centre de formation mérite mieux",
      items: [
        { icon: "CalendarX", label: "Sessions qui se chevauchent" },
        { icon: "PenLine", label: "Émargement papier" },
        { icon: "Wallet", label: "Échéances oubliées" },
        { icon: "Award", label: "Certificats à la main" },
        { icon: "Clock", label: "Retards non suivis" },
        { icon: "Sheet", label: "Tableurs dispersés" },
      ],
    },
    formations: {
      kind: "screen", eyebrow: "Catalogue", title: "Formations, sessions, modules", accentWords: ["sessions"],
      chips: ["Capacité", "Salle", "Formateurs", "Groupes facultatifs"],
      shots: [
        { src: "f-formations", device: "browser", move: { from: C(0.5, 0.4, 1.05), to: C(0.45, 0.35, 1.4) } },
        { src: "f-formation", device: "browser", move: { from: C(0.5, 0.35, 1.15), to: C(0.55, 0.5, 1.45) } },
        { src: "f-session", device: "browser", move: { from: C(0.5, 0.4, 1.15), to: C(0.45, 0.55, 1.45) } },
      ],
    },
    inscription: {
      kind: "screen", eyebrow: "Inscription", title: "Inscrit, facturé, suivi", accentWords: ["suivi"],
      chips: ["Paiement échelonné", "1er versement", "Reste à payer"],
      shots: [
        { src: "f-inscription", device: "browser", move: { from: C(0.5, 0.4, 1.05), to: C(0.5, 0.3, 1.4) } },
        { src: "f-dossier", device: "browser", move: { from: C(0.5, 0.4, 1.15), to: C(0.6, 0.62, 1.55) } },
      ],
    },
    pointage: {
      kind: "screen", eyebrow: "Présences", title: "Entrée, sortie, retard", accentWords: ["retard"],
      chips: ["Badge apprenant", "Badge formateur", "Durée calculée"],
      shots: [
        { src: "f-tablette-attente", device: "tablet", move: { from: C(0.5, 0.5, 1), to: C(0.3, 0.35, 1.2) } },
        { src: "f-tablette-apprenant", device: "tablet", move: { from: C(0.3, 0.4, 1.2), to: C(0.28, 0.35, 1.4) } },
        { src: "f-tablette-formateur", device: "tablet", move: { from: C(0.3, 0.4, 1.2), to: C(0.28, 0.4, 1.4) } },
      ],
    },
    planning: {
      kind: "screen", eyebrow: "Emploi du temps", title: "Zéro conflit de salle", accentWords: ["Zéro"],
      shots: [{ src: "f-emploi-du-temps", device: "browser", move: { from: C(0.5, 0.45, 1.05), to: C(0.55, 0.55, 1.5) } }],
    },
    competences: {
      kind: "screen", eyebrow: "Évaluation", title: "Des compétences prouvées", accentWords: ["prouvées"],
      chips: ["Travaux pratiques", "Compétences", "Stages"],
      shots: [
        { src: "f-competences", device: "browser", move: { from: C(0.5, 0.4, 1.1), to: C(0.55, 0.4, 1.55) } },
        { src: "f-carte-3d", device: "browser", move: { from: C(0.45, 0.5, 1.2), to: C(0.4, 0.48, 1.7) } },
      ],
    },
    documents: {
      kind: "docs", eyebrow: "Documents", title: "Attestations et relevés en un clic", accentWords: ["clic"],
      chips: ["Numérotés", "QR code"],
      papers: ["doc-f-releve", "doc-f-attestation", "doc-f-competences"],
    },
    stats: {
      kind: "screen", eyebrow: "Pilotage", title: "Votre centre en un coup d'œil", accentWords: ["coup", "d'œil"],
      shots: [
        { src: "f-aujourdhui", device: "browser", move: { from: C(0.5, 0.35, 1.05), to: C(0.55, 0.3, 1.4) } },
        { src: "f-statistiques", device: "browser", move: { from: C(0.5, 0.4, 1.1), to: C(0.6, 0.35, 1.45) } },
      ],
    },
    benefices: {
      kind: "benefits", title: "Chacun y gagne",
      items: [
        { icon: "LayoutDashboard", who: "Direction", text: "Activité et trésorerie pilotées au jour le jour" },
        { icon: "Presentation", who: "Formateurs", text: "Plus de temps pour transmettre" },
        { icon: "UserCheck", who: "Apprenants", text: "Parcours, paiements et documents sur téléphone" },
      ],
    },
    cta: { kind: "cta", slogan: "Donnez à votre centre les outils de son ambition." },
  },
  universite: {
    intro: { kind: "hero", title: "Du premier crédit au diplôme.", accentWords: ["diplôme."], icons: ["GraduationCap", "Building2", "Scale", "Award", "Users", "FileText"] },
    probleme: {
      kind: "problem",
      title: "Un outil à la mesure de l'enseignement supérieur",
      items: [
        { icon: "Network", label: "Maquettes complexes" },
        { icon: "Calculator", label: "Crédits à la main" },
        { icon: "Gavel", label: "Délibérations sans fin" },
        { icon: "FileText", label: "Relevés à refaire" },
        { icon: "ShieldAlert", label: "Diplômes contrefaits" },
        { icon: "Users", label: "Files d'attente" },
      ],
    },
    structure: {
      kind: "screen", eyebrow: "Structure LMD", title: "Votre maquette, telle qu'elle est", accentWords: ["maquette,"],
      chips: ["Facultés", "Filières", "Parcours", "Crédits"],
      shots: [
        { src: "u-structure", device: "browser", move: { from: C(0.5, 0.4, 1.05), to: C(0.45, 0.5, 1.45) } },
        { src: "u-ue", device: "browser", move: { from: C(0.5, 0.4, 1.15), to: C(0.55, 0.45, 1.5) } },
      ],
    },
    inscription: {
      kind: "screen", eyebrow: "Scolarité", title: "Administrative, puis pédagogique", accentWords: ["pédagogique"],
      chips: ["Frais en tranches", "Inscription aux UE automatique"],
      shots: [
        { src: "u-inscription", device: "browser", move: { from: C(0.5, 0.4, 1.05), to: C(0.5, 0.3, 1.4) } },
        { src: "u-carte-3d", device: "browser", move: { from: C(0.45, 0.5, 1.2), to: C(0.4, 0.48, 1.7) } },
      ],
    },
    presences: {
      kind: "screen", eyebrow: "Présences", title: "Présence vérifiée", accentWords: ["vérifiée"],
      chips: ["Carte étudiant", "Badge enseignant", "Sorties anticipées"],
      shots: [
        { src: "u-tablette-etudiant", device: "tablet", move: { from: C(0.3, 0.45, 1.1), to: C(0.28, 0.35, 1.35) } },
        { src: "u-tablette-enseignant", device: "tablet", move: { from: C(0.3, 0.4, 1.2), to: C(0.28, 0.4, 1.4) } },
        { src: "u-presences", device: "browser", move: { from: C(0.5, 0.4, 1.1), to: C(0.55, 0.6, 1.45) } },
      ],
    },
    resultats: {
      kind: "screen", eyebrow: "Résultats", title: "Crédits calculés automatiquement", accentWords: ["automatiquement"],
      chips: ["Moyennes UE", "Compensation", "Rattrapage"],
      shots: [
        { src: "u-resultats", device: "browser", move: { from: C(0.5, 0.45, 1.1), to: C(0.55, 0.55, 1.5) } },
        { src: "u-rattrapage", device: "browser", move: { from: C(0.5, 0.5, 1.15), to: C(0.45, 0.62, 1.5) } },
      ],
    },
    jury: {
      kind: "screen", eyebrow: "Jury", title: "Des délibérations traçables", accentWords: ["traçables"],
      chips: ["Décisions versionnées", "Procès-verbal"],
      shots: [
        { src: "u-deliberation", device: "browser", move: { from: C(0.5, 0.35, 1.1), to: C(0.5, 0.5, 1.45) } },
        { src: "u-deliberations", device: "browser", move: { from: C(0.5, 0.3, 1.2), to: C(0.45, 0.25, 1.5) } },
      ],
    },
    portail: {
      kind: "screen", eyebrow: "Portail étudiant", title: "Résultats dès la publication", accentWords: ["publication"],
      chips: ["Crédits", "Parcours"],
      shots: [
        { src: "u-portail-resultats", device: "phone", move: { from: C(0.5, 0.3, 1), to: C(0.5, 0.45, 1.1) } },
        { src: "u-portail-parcours", device: "phone", move: { from: C(0.5, 0.3, 1), to: C(0.5, 0.45, 1.1) } },
      ],
    },
    diplomes: {
      kind: "docs", eyebrow: "Diplômes", title: "Des diplômes infalsifiables", accentWords: ["infalsifiables"],
      chips: ["Numérotés", "QR code", "Relevés LMD"],
      papers: ["doc-u-releve", "doc-u-pv", "doc-u-diplome"],
    },
    benefices: {
      kind: "benefits", title: "Chacun y gagne",
      items: [
        { icon: "Building2", who: "Scolarité", text: "Des semaines gagnées chaque session" },
        { icon: "Presentation", who: "Enseignants", text: "Saisir et publier, simplement" },
        { icon: "Scale", who: "Jurys", text: "Décider en confiance" },
        { icon: "GraduationCap", who: "Étudiants", text: "Savoir toujours où ils en sont" },
      ],
    },
    cta: { kind: "cta", slogan: "L'excellence académique mérite une gestion à sa hauteur." },
  },
};
