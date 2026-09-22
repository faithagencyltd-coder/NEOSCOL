/** Formatage localisé (locale et devise de l'établissement). */
export function formatMoney(amount: number, currency = "XOF", locale = "fr-FR"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "XOF" || currency === "XAF" ? 0 : 2,
  }).format(amount);
}

export function formatNumber(value: number, locale = "fr-FR"): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatDate(value: string | Date, locale = "fr-FR", options?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, options ?? { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function formatDateTime(value: string | Date, locale = "fr-FR", timeZone?: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
