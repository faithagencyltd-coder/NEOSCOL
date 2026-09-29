/**
 * Voice Check-in : messages vocaux prononcés par la tablette au moment du scan.
 * Pur (sans navigateur) : partagé par l'écran de réglages et la tablette.
 */
export const VOICE_EVENTS = [
  { key: "arrival", label: "Arrivée à l'heure (personnel)" },
  { key: "arrival_late", label: "Arrivée en retard (personnel)" },
  { key: "departure", label: "Départ (personnel)" },
  { key: "lesson", label: "Cours débloqué (enseignant)" },
  { key: "learner_entry", label: "Entrée à l'heure (élève, apprenant, étudiant)" },
  { key: "learner_late", label: "Entrée en retard (élève, apprenant, étudiant)" },
  { key: "learner_exit", label: "Sortie (élève, apprenant, étudiant)" },
  { key: "duplicate", label: "Badge déjà scanné" },
  { key: "rejected", label: "Badge refusé" },
  { key: "offline", label: "Scan gardé hors ligne" },
] as const;

export type VoiceEvent = (typeof VOICE_EVENTS)[number]["key"];
export type VoiceLanguage = "fr" | "en";

export const VOICE_VARIABLES = [
  { key: "prenom", label: "Prénom" },
  { key: "nom", label: "Nom complet" },
  { key: "retard", label: "Minutes de retard" },
  { key: "cours", label: "Matière / cours" },
  { key: "classe", label: "Classe ou session" },
  { key: "salle", label: "Salle" },
  { key: "heure", label: "Heure du scan" },
  { key: "etablissement", label: "Établissement" },
] as const;

export const DEFAULT_VOICE_MESSAGES: Record<VoiceLanguage, Record<VoiceEvent, string>> = {
  fr: {
    arrival: "Bonjour {prenom}, arrivée enregistrée à {heure}.",
    arrival_late: "Bonjour {prenom}, arrivée enregistrée. Retard de {retard} minutes.",
    departure: "Au revoir {prenom}, départ enregistré.",
    lesson: "Cours de {cours} débloqué. Bon cours {prenom}.",
    learner_entry: "Bienvenue {prenom}.",
    learner_late: "Bienvenue {prenom}. Retard de {retard} minutes.",
    learner_exit: "Au revoir {prenom}.",
    duplicate: "Badge déjà scanné.",
    rejected: "Badge refusé. Adressez-vous à l'accueil.",
    offline: "Scan enregistré. Il sera transmis au retour du réseau.",
  },
  en: {
    arrival: "Good morning {prenom}, arrival recorded at {heure}.",
    arrival_late: "Hello {prenom}, arrival recorded. {retard} minutes late.",
    departure: "Goodbye {prenom}, departure recorded.",
    lesson: "{cours} lesson unlocked. Have a good class {prenom}.",
    learner_entry: "Welcome {prenom}.",
    learner_late: "Welcome {prenom}. {retard} minutes late.",
    learner_exit: "Goodbye {prenom}.",
    duplicate: "Badge already scanned.",
    rejected: "Badge refused. Please go to the front desk.",
    offline: "Scan saved. It will be sent when the network is back.",
  },
};

export const SPEECH_LANG: Record<VoiceLanguage, string> = { fr: "fr-FR", en: "en-GB" };

export type VoiceConfig = {
  available: boolean;
  enabled: boolean;
  language: VoiceLanguage;
  rate: number;
  volume: number;
  announce_names: boolean;
  messages: Partial<Record<VoiceEvent, string>>;
  organization: string;
};

/** Résultat de scan (sous-ensemble utile), tablette du personnel ou scan unifié. */
export type VoiceScan = {
  result: "accepted" | "rejected";
  reason?: string;
  kind?: string;
  minutes_late?: number | null;
  status?: "late" | "on_time" | null;
  profile?: "staff" | "trainer" | "learner";
  at?: string;
  greeting?: string;
  staff?: { name: string; first_name?: string } | null;
  learner?: { name: string; first_name: string } | null;
  lesson?: { class: string; subject: string; room: string | null } | null;
  course?: { subject: string; session?: string; group?: string | null; room: string | null } | null;
};

/** Événement à annoncer pour un résultat de scan (ou un scan gardé hors ligne). */
export function voiceEvent(scan: VoiceScan | null, queued = false): VoiceEvent | null {
  if (queued) return "offline";
  if (!scan) return null;
  if (scan.result !== "accepted") return scan.reason === "duplicate" ? "duplicate" : "rejected";
  if (scan.profile === "learner") return scan.kind === "exit" ? "learner_exit" : scan.status === "late" ? "learner_late" : "learner_entry";
  if (scan.kind === "departure") return "departure";
  if (scan.kind === "lesson") return "lesson";
  return (scan.minutes_late ?? 0) > 0 ? "arrival_late" : "arrival";
}

/** Variables du message. Refus : jamais de nom annoncé (badge d'un autre établissement, badge désactivé). */
export function voiceVariables(scan: VoiceScan | null, organization: string, now = new Date()): Record<string, string> {
  const accepted = scan?.result === "accepted";
  const name = accepted ? (scan?.learner?.name ?? scan?.staff?.name ?? "") : "";
  const first = accepted
    ? (scan?.learner?.first_name ?? scan?.staff?.first_name ?? scan?.greeting?.replace(/^Bonjour\s+/i, "") ?? name.split(" ")[0] ?? "")
    : "";
  return {
    prenom: first,
    nom: name,
    retard: String(scan?.minutes_late ?? ""),
    cours: scan?.lesson?.subject ?? scan?.course?.subject ?? "",
    classe: scan?.lesson?.class ?? scan?.course?.group ?? scan?.course?.session ?? "",
    salle: scan?.lesson?.room ?? scan?.course?.room ?? "",
    heure: scan?.at ?? now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    etablissement: organization,
  };
}

/** Message final : variables remplacées ; sans annonce des noms, prénom et nom sont retirés proprement. */
export function renderVoice(template: string, variables: Record<string, string>, announceNames = true): string {
  const vars = announceNames ? variables : { ...variables, prenom: "", nom: "" };
  return template
    .replace(/\{\s*([a-z]+)\s*\}/g, (_, key: string) => vars[key] ?? "")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/,\s*([.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function messageFor(config: Pick<VoiceConfig, "language" | "messages">, event: VoiceEvent): string {
  return config.messages[event]?.trim() || DEFAULT_VOICE_MESSAGES[config.language][event];
}
