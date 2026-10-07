/**
 * Réseaux Mobile Money acceptés par FeexPay (codes « reseau » de l'API, tirés
 * des bibliothèques officielles FeexPay). Aucun secret : utilisable côté navigateur.
 */
export type FeexPayNetwork = { code: string; label: string; otp?: boolean };
export type FeexPayCountry = { code: string; name: string; dial: string; networks: FeexPayNetwork[] };

export const FEEXPAY_COUNTRIES: FeexPayCountry[] = [
  {
    code: "BJ",
    name: "Bénin",
    dial: "229",
    networks: [
      { code: "MTN", label: "MTN MoMo" },
      { code: "MOOV", label: "Moov Money" },
      { code: "CELTIIS BJ", label: "Celtiis Cash" },
    ],
  },
  {
    code: "CI",
    name: "Côte d'Ivoire",
    dial: "225",
    networks: [
      { code: "MTN CI", label: "MTN MoMo" },
      { code: "MOOV CI", label: "Moov Money" },
      { code: "ORANGE CI", label: "Orange Money", otp: true },
      { code: "WAVE CI", label: "Wave" },
    ],
  },
  {
    code: "TG",
    name: "Togo",
    dial: "228",
    networks: [
      { code: "TOGOCOM TG", label: "Mixx by Yas (Togocom)" },
      { code: "MOOV TG", label: "Moov Money (Flooz)" },
    ],
  },
  {
    code: "SN",
    name: "Sénégal",
    dial: "221",
    networks: [
      { code: "ORANGE SN", label: "Orange Money", otp: true },
      { code: "FREE SN", label: "Free Money" },
    ],
  },
  {
    code: "BF",
    name: "Burkina Faso",
    dial: "226",
    networks: [
      { code: "MOOV BF", label: "Moov Money" },
      { code: "ORANGE BF", label: "Orange Money", otp: true },
    ],
  },
  { code: "CG", name: "Congo-Brazzaville", dial: "242", networks: [{ code: "MTN CG", label: "MTN MoMo" }] },
];

export function feexpayNetwork(countryCode: string, networkCode: string) {
  const country = FEEXPAY_COUNTRIES.find((c) => c.code === countryCode);
  const network = country?.networks.find((n) => n.code === networkCode);
  return country && network ? { country, network } : null;
}

/** Numéro au format attendu par FeexPay : indicatif + numéro, chiffres seuls (ex. 2290162056295). */
export function feexpayPhone(dial: string, raw: string): string | null {
  let digits = raw.replace(/\D/g, "").replace(/^00/, "");
  if (!digits.startsWith(dial)) digits = dial + digits;
  const local = digits.slice(dial.length);
  return /^\d{8,10}$/.test(local) ? digits : null;
}
