/**
 * Application mobile NeoScool (Android / iPhone, voir mobile/) : une coque
 * native qui ouvre les portails de l'établissement choisi. Elle s'identifie par
 * son agent utilisateur (« NeoScoolApp/<version> ») ; rien de plus n'est
 * accordé à l'application : droits et sessions restent ceux du compte connecté.
 */
export const NATIVE_APP_UA = /NeoScoolApp\/[\d.]+/;

export function isNativeApp(userAgent: string | null | undefined): boolean {
  return NATIVE_APP_UA.test(userAgent ?? "");
}

/** Origines des pages locales de l'application (Capacitor : Android, iOS). */
export const NATIVE_APP_ORIGINS = ["https://localhost", "capacitor://localhost", "http://localhost"];

/** Écran « Mes établissements » de l'application (pages locales, hors serveur). */
export function nativeHomeUrl(userAgent: string): string {
  return /android/i.test(userAgent) ? "https://localhost/index.html#etablissements" : "capacitor://localhost/index.html#etablissements";
}
