/**
 * MODULE SCOLAIRE — un seul module, quatre niveaux configurables par
 * établissement (organizations.settings.school). Ce fichier est partagé
 * serveur / navigateur : aucune donnée, uniquement des libellés et des règles.
 * Les centres de formation et universités n'ont pas de configuration « school »
 * (config = null) : tout reste affiché comme avant pour eux.
 */
export const SCHOOL_LEVELS = ["maternelle", "primaire", "college", "lycee"] as const;
export type SchoolLevel = (typeof SCHOOL_LEVELS)[number];

export const SCHOOL_LEVEL_LABELS: Record<SchoolLevel, string> = {
  maternelle: "Maternelle",
  primaire: "Primaire",
  college: "Collège",
  lycee: "Lycée",
};

export const SCHOOL_LEVEL_HINTS: Record<SchoolLevel, string> = {
  maternelle: "Petite, moyenne et grande section",
  primaire: "CI / CP au CM2",
  college: "6e à 3e",
  lycee: "2nde à Terminale, général et/ou technique",
};

export const LYCEE_TRACKS = ["general", "technical"] as const;
export type LyceeTrack = (typeof LYCEE_TRACKS)[number];
export const LYCEE_TRACK_LABELS: Record<LyceeTrack, string> = { general: "Lycée général", technical: "Lycée technique" };

export type SchoolConfig = { levels: SchoolLevel[]; lyceeTracks: LyceeTrack[] };

export function isSchoolLevel(value: unknown): value is SchoolLevel {
  return typeof value === "string" && (SCHOOL_LEVELS as readonly string[]).includes(value);
}

/** Configuration du Module Scolaire lue dans les réglages de l'établissement (null : hors module). */
export function schoolConfigOf(settings: unknown): SchoolConfig | null {
  const school = settings && typeof settings === "object" ? (settings as Record<string, unknown>).school : null;
  if (!school || typeof school !== "object") return null;
  const raw = school as { levels?: unknown; lycee_tracks?: unknown };
  const levels = Array.isArray(raw.levels) ? SCHOOL_LEVELS.filter((l) => (raw.levels as unknown[]).includes(l)) : [];
  const lyceeTracks = Array.isArray(raw.lycee_tracks) ? LYCEE_TRACKS.filter((t) => (raw.lycee_tracks as unknown[]).includes(t)) : [];
  return { levels, lyceeTracks: levels.includes("lycee") ? lyceeTracks : [] };
}

export function hasLevel(config: SchoolConfig | null, level: SchoolLevel): boolean {
  return !config || config.levels.includes(level);
}

/** Niveau (6e, CM1…) proposé : établissement hors module, niveau non classé ou niveau activé. */
export function levelVisible(level: { school_cycle?: string | null }, config: SchoolConfig | null): boolean {
  return !config || !level.school_cycle || config.levels.includes(level.school_cycle as SchoolLevel);
}

/** Série / filière proposée : active, et rattachée à un niveau et un type de lycée activés. */
export function programVisible(program: { is_active?: boolean | null; school_cycle?: string | null; track_type?: string | null }, config: SchoolConfig | null): boolean {
  if (!config) return true;
  if (program.is_active === false) return false;
  if (program.track_type) return config.levels.includes("lycee") && config.lyceeTracks.includes(program.track_type as LyceeTrack);
  return !program.school_cycle || config.levels.includes(program.school_cycle as SchoolLevel);
}

/** Matière proposée dans un contexte (niveau et série d'une classe). Vide = tous les niveaux. */
export function subjectFits(
  subject: { school_cycles?: string[] | null; program_id?: string | null },
  context: { cycle?: string | null; programId?: string | null },
): boolean {
  const cycles = subject.school_cycles ?? [];
  if (context.cycle && cycles.length > 0 && !cycles.includes(context.cycle)) return false;
  if (subject.program_id && subject.program_id !== (context.programId ?? null)) return false;
  return true;
}

/**
 * Séries courantes proposées à l'ajout (modifiables, désactivables, supprimables de la liste
 * active) : aucune n'est imposée, l'établissement ne garde que celles qu'il utilise.
 */
export const LYCEE_SERIES_CATALOG: Record<LyceeTrack, { code: string; name: string }[]> = {
  general: [
    { code: "A1", name: "Série A1" },
    { code: "A2", name: "Série A2" },
    { code: "B", name: "Série B" },
    { code: "C", name: "Série C" },
    { code: "D", name: "Série D" },
  ],
  technical: [
    { code: "F1", name: "F1 — Construction mécanique" },
    { code: "F2", name: "F2 — Électronique" },
    { code: "F3", name: "F3 — Électrotechnique" },
    { code: "F4", name: "F4 — Génie civil" },
    { code: "EAA", name: "Série EAA" },
    { code: "G1", name: "G1 — Techniques administratives" },
    { code: "G2", name: "G2 — Techniques quantitatives de gestion" },
    { code: "G3", name: "G3 — Techniques commerciales" },
  ],
};
