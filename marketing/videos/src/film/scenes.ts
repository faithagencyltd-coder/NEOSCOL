import type { Move } from "../components/Devices";

/**
 * Film officiel « Le fil NeoScool » (module scolaire) : une journée d'école.
 * Chaque écran est une capture réelle (établissement de démonstration). Aucune
 * personne n'est inventée : les plans filmés prévus au dossier (section R–V)
 * s'intercaleront au montage ; ici, chaque moment est annoncé par l'heure,
 * le lieu et l'acteur.
 */
export type FilmDevice = "browser" | "tablet" | "phone";
export type FilmShot = { src: string; device: FilmDevice; move?: Move };
export type FilmFx =
  | { kind: "voice" }
  | { kind: "push"; title: string; body: string; at: number }
  | { kind: "checks"; count: number }
  | { kind: "offline" }
  | { kind: "stamp"; text: string }
  | { kind: "layers" }
  | { kind: "print" };

export type FilmSpec =
  | { kind: "logo"; line?: string }
  | { kind: "moment"; time?: string; place: string; title: string; accentWords?: string[]; chips?: string[]; shots: FilmShot[]; fx?: FilmFx[] }
  | { kind: "mosaic"; title: string; tiles: string[] }
  | { kind: "evening"; time: string; line: string }
  | { kind: "cta" };

const C = (x: number, y: number, s: number) => ({ x, y, s });

export const FILM: Record<string, FilmSpec> = {
  s01: { kind: "logo" },
  s02: {
    kind: "moment", time: "06:45", place: "L'établissement", title: "Une organisation entière", accentWords: ["entière"],
    chips: ["Années et périodes", "Niveaux", "Classes", "Salles"],
    shots: [
      { src: "s-structure", device: "browser", move: { from: C(0.5, 0.35, 1.05), to: C(0.6, 0.3, 1.3) } },
      { src: "s-classes", device: "browser", move: { from: C(0.5, 0.4, 1.1), to: C(0.55, 0.35, 1.35) } },
    ],
  },
  s03: {
    kind: "moment", time: "07:00", place: "Bureau de la direction", title: "Tout, en un regard", accentWords: ["regard"],
    chips: ["Effectifs", "Encaissements", "Absences", "Alertes"],
    shots: [{ src: "s-dashboard", device: "browser", move: { from: C(0.5, 0.5, 1), to: C(0.62, 0.32, 1.45) } }],
  },
  s04: {
    kind: "moment", time: "07:30", place: "Secrétariat", title: "Une inscription, tout est prêt", accentWords: ["prêt"],
    chips: ["Dossier", "Classe", "Facture", "Carte scolaire QR"],
    shots: [
      { src: "s-inscription", device: "browser", move: { from: C(0.5, 0.4, 1.05), to: C(0.55, 0.32, 1.3) } },
      { src: "s-dossier", device: "browser", move: { from: C(0.5, 0.35, 1.1), to: C(0.45, 0.3, 1.4) } },
      { src: "s-carte-3d", device: "browser", move: { from: C(0.45, 0.5, 1.2), to: C(0.4, 0.5, 1.7) } },
    ],
  },
  s05: {
    kind: "moment", time: "07:55", place: "Entrée de l'établissement", title: "Un badge, et le cours s'ouvre", accentWords: ["s'ouvre"],
    chips: ["Scan du badge", "Message vocal", "Appel débloqué"],
    fx: [{ kind: "voice" }],
    shots: [
      { src: "s-tablette-attente", device: "tablet", move: { from: C(0.5, 0.5, 1), to: C(0.35, 0.4, 1.2) } },
      { src: "s-tablette-cours", device: "tablet", move: { from: C(0.3, 0.35, 1.15), to: C(0.3, 0.4, 1.35) } },
    ],
  },
  s06: {
    kind: "moment", time: "08:00", place: "Salle des professeurs", title: "Son emploi du temps, partout", accentWords: ["partout"],
    shots: [
      { src: "s-mes-cours-mobile", device: "phone", move: { from: C(0.5, 0.3, 1), to: C(0.5, 0.45, 1.08) } },
      { src: "s-emploi-du-temps-mobile", device: "phone", move: { from: C(0.5, 0.3, 1), to: C(0.5, 0.4, 1.08) } },
    ],
  },
  s07: {
    kind: "moment", time: "08:10", place: "En classe · 6e A", title: "L'appel en quelques secondes", accentWords: ["secondes"],
    chips: ["Présent", "Retard", "Absent", "Validation"],
    fx: [{ kind: "checks", count: 6 }, { kind: "push", title: "Absence signalée", body: "Mathématiques · 6e A — l'établissement vous informe.", at: 0.72 }],
    shots: [{ src: "s-appel", device: "tablet", move: { from: C(0.5, 0.4, 1.05), to: C(0.6, 0.45, 1.3) } }],
  },
  s08: {
    kind: "moment", time: "19:00", place: "Le soir", title: "Les notes, même depuis Excel", accentWords: ["Excel"],
    chips: ["Saisie en grille", "Import Excel / CSV", "Contrôle ligne par ligne"],
    fx: [{ kind: "checks", count: 5 }],
    shots: [
      { src: "s-notes", device: "browser", move: { from: C(0.5, 0.45, 1.1), to: C(0.45, 0.55, 1.4) } },
      { src: "s-notes-import", device: "browser", move: { from: C(0.5, 0.5, 1.15), to: C(0.5, 0.5, 1.5) } },
    ],
  },
  s09: {
    kind: "moment", time: "10:00", place: "Direction", title: "Les bulletins se construisent seuls", accentWords: ["seuls"],
    chips: ["Moyennes", "Rangs", "Appréciations", "Publication"],
    shots: [
      { src: "s-bulletins", device: "browser", move: { from: C(0.5, 0.4, 1.05), to: C(0.55, 0.35, 1.3) } },
      { src: "s-bulletins-apercu", device: "browser", move: { from: C(0.55, 0.45, 1.2), to: C(0.55, 0.6, 1.55) } },
    ],
  },
  s10: {
    kind: "moment", time: "11:00", place: "Guichet de la comptabilité", title: "Plus aucun reçu perdu", accentWords: ["reçu"],
    chips: ["Paiement", "Reçu PDF + QR", "Reliquat à jour"],
    fx: [{ kind: "print" }],
    shots: [
      { src: "s-finances", device: "browser", move: { from: C(0.5, 0.45, 1.05), to: C(0.55, 0.35, 1.35) } },
      { src: "s-facture", device: "browser", move: { from: C(0.5, 0.3, 1.2), to: C(0.6, 0.22, 1.55) } },
    ],
  },
  s11: {
    kind: "moment", time: "12:00", place: "Communication", title: "Chaque famille informée", accentWords: ["informée"],
    chips: ["Annonces", "SMS", "E-mail", "WhatsApp"],
    shots: [
      { src: "s-annonces", device: "browser", move: { from: C(0.5, 0.35, 1.05), to: C(0.5, 0.3, 1.3) } },
      { src: "s-envois", device: "browser", move: { from: C(0.5, 0.4, 1.1), to: C(0.55, 0.35, 1.35) } },
    ],
  },
  s12: {
    kind: "moment", time: "12:30", place: "Au bureau · un parent", title: "Au bon moment, sur son téléphone", accentWords: ["téléphone"],
    chips: ["Absences", "Notes", "Bulletins", "Paiements"],
    fx: [{ kind: "push", title: "Paiement enregistré", body: "Reçu REC-DEMO-26-000018 — 205 000 F CFA.", at: 0.15 }],
    shots: [
      { src: "s-portail", device: "phone", move: { from: C(0.5, 0.3, 1), to: C(0.5, 0.45, 1.08) } },
      { src: "s-portail-presences", device: "phone", move: { from: C(0.5, 0.3, 1), to: C(0.5, 0.45, 1.08) } },
    ],
  },
  s13: {
    kind: "moment", time: "16:30", place: "Dans le bus · une élève", title: "Son parcours, au même endroit", accentWords: ["parcours"],
    shots: [
      { src: "s-portail-eleve", device: "phone", move: { from: C(0.5, 0.3, 1), to: C(0.5, 0.42, 1.08) } },
      { src: "s-portail-eleve-notes", device: "phone", move: { from: C(0.5, 0.3, 1), to: C(0.5, 0.4, 1.06) } },
    ],
  },
  s14: {
    kind: "moment", place: "Partout", title: "Un scan prouve l'authenticité", accentWords: ["authenticité"],
    chips: ["Numéro unique", "QR code", "Page de vérification"],
    fx: [{ kind: "stamp", text: "Document authentique" }],
    shots: [{ src: "s-verifier", device: "phone", move: { from: C(0.5, 0.3, 1), to: C(0.5, 0.4, 1.06) } }],
  },
  s15: {
    kind: "moment", time: "15:00", place: "Réunion de direction", title: "Piloter avec des indicateurs fiables", accentWords: ["fiables"],
    chips: ["Rapports", "Exports", "Assistant"],
    shots: [
      { src: "s-rapports", device: "browser", move: { from: C(0.5, 0.4, 1.05), to: C(0.55, 0.35, 1.3) } },
      { src: "s-assistant", device: "browser", move: { from: C(0.5, 0.3, 1.3), to: C(0.5, 0.38, 1.6) } },
    ],
  },
  s16: {
    kind: "moment", time: "Fin d'année", place: "Passage d'année", title: "Rien ne se perd", accentWords: ["perd"],
    chips: ["Historique", "Passage d'année", "Journal d'audit"],
    fx: [{ kind: "layers" }],
    shots: [
      { src: "s-passage", device: "browser", move: { from: C(0.5, 0.4, 1.05), to: C(0.5, 0.35, 1.3) } },
      { src: "s-audit", device: "browser", move: { from: C(0.5, 0.35, 1.1), to: C(0.55, 0.3, 1.35) } },
    ],
  },
  s17: {
    kind: "moment", place: "Coupure du réseau", title: "L'appel continue", accentWords: ["continue"],
    fx: [{ kind: "offline" }],
    shots: [{ src: "s-appel", device: "tablet", move: { from: C(0.5, 0.45, 1.1), to: C(0.45, 0.5, 1.25) } }],
  },
  s18: { kind: "mosaic", title: "Tous connectés", tiles: ["s-dashboard", "s-appel", "s-notes", "s-bulletins-apercu", "s-facture", "s-annonces", "s-audit", "s-rapports"] },
  s19: { kind: "evening", time: "18:00", line: "Avec NeoScool, tout reste connecté." },
  s20: { kind: "cta" },
};
