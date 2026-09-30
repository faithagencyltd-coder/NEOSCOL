/** Site web : sections de l'accueil et lecture des systèmes institutionnels saisis (fonctions pures). */

export const HOME_SECTIONS = [
  { key: "connected", label: "Acteurs connectés" },
  { key: "video", label: "Vidéo « en action »" },
  { key: "flow", label: "Parcours du module scolaire" },
  { key: "actors", label: "Espaces des acteurs" },
  { key: "journey", label: "Saisie unique" },
  { key: "badge", label: "Smart Badge" },
  { key: "offline", label: "Hors ligne" },
  { key: "security", label: "Sécurité" },
  { key: "data", label: "Import et export" },
  { key: "multi", label: "Multi-établissements" },
  { key: "countries", label: "Pays" },
  { key: "pricing", label: "Tarifs" },
  { key: "testimonials", label: "Témoignages (affichés seulement s'il en existe)" },
] as const;

export type InstitutionalSystem = { name: string; description: string; verified: boolean };

/**
 * Une ligne par système : « Nom | description | vérifié ». Seuls les systèmes
 * marqués « vérifié » (oui, vérifié, true) sont publiés sur le site.
 */
export function parseSystems(input: string): { ok: true; value: InstitutionalSystem[] } | { ok: false; message: string } {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 10) return { ok: false, message: "10 systèmes institutionnels au plus." };
  const value: InstitutionalSystem[] = [];
  for (const line of lines) {
    const [name = "", description = "", flag = ""] = line.split("|").map((p) => p.trim());
    if (name.length < 2 || name.length > 80) return { ok: false, message: `Nom de système invalide : « ${line} ».` };
    value.push({ name, description: description.slice(0, 300), verified: /^(oui|vérifié|verifie|vrai|true|yes)$/i.test(flag) });
  }
  return { ok: true, value };
}

export const systemsToText = (systems: InstitutionalSystem[]) =>
  systems.map((s) => [s.name, s.description, s.verified ? "vérifié" : "non vérifié"].join(" | ")).join("\n");
