/**
 * Formatage pour les PDF : les polices standard (WinAnsi) ne connaissent pas
 * les espaces insécables fines produites par Intl ; on les remplace.
 */
const SPECIAL_SPACES = /[    ]/g;

export function pdfText(value: string | null | undefined): string {
  return (value ?? "").replace(SPECIAL_SPACES, " ");
}

export function pdfMoney(amount: number | string | null | undefined, currency = "XOF"): string {
  const value = Number(amount ?? 0);
  const cfa = currency === "XOF" || currency === "XAF";
  const formatted = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: cfa ? 0 : 2, minimumFractionDigits: cfa ? 0 : 2 }).format(value);
  return pdfText(`${formatted} ${cfa ? "FCFA" : currency}`);
}

export function pdfNumber(value: number | string | null | undefined, digits = 2): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits).replace(".", ",") : "—";
}

export function pdfDate(value: string | null | undefined, timeZone = "Africa/Abidjan", long = false): string {
  if (!value) return "—";
  // Une date « AAAA-MM-JJ » est une date civile : pas de conversion de fuseau.
  const civil = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = civil ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return pdfText(
    new Intl.DateTimeFormat("fr-FR", {
      timeZone: civil ? "UTC" : timeZone,
      ...(long ? { day: "numeric", month: "long", year: "numeric" } : { day: "2-digit", month: "2-digit", year: "numeric" }),
    }).format(date),
  );
}

export function pdfDateTime(value: string | null | undefined, timeZone = "Africa/Abidjan"): string {
  if (!value) return "—";
  return pdfText(
    new Intl.DateTimeFormat("fr-FR", { timeZone, dateStyle: "short", timeStyle: "short" }).format(new Date(value)),
  );
}

export function rankLabel(rank: number | null | undefined, size?: number | null): string {
  if (!rank) return "—";
  return `${rank}${rank === 1 ? "er" : "e"}${size ? ` / ${size}` : ""}`;
}

/** Nom de fichier sûr pour l'en-tête Content-Disposition. */
export function safeFileName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}
