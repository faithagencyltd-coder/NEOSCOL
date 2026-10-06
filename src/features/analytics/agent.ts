/** Appareil, système et navigateur déduits de l'agent utilisateur (aucune empreinte conservée). */
export type Device = "mobile" | "tablet" | "desktop";
export type Os = "android" | "ios" | "windows" | "macos" | "linux" | "other";
export type Browser = "chrome" | "safari" | "firefox" | "edge" | "samsung" | "opera" | "other";

export function deviceOf(ua: string): Device {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|Android/i.test(ua)) return "mobile";
  return "desktop";
}

export function osOf(ua: string): Os {
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  if (/Linux|CrOS/i.test(ua)) return "linux";
  return "other";
}

export function browserOf(ua: string): Browser {
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/OPR\/|Opera/i.test(ua)) return "opera";
  if (/Edg\//i.test(ua)) return "edge";
  if (/Firefox|FxiOS/i.test(ua)) return "firefox";
  if (/Chrome|CriOS|Chromium/i.test(ua)) return "chrome";
  if (/Safari/i.test(ua)) return "safari";
  return "other";
}

export const DEVICE_LABELS: Record<string, string> = { mobile: "Téléphone", tablet: "Tablette", desktop: "Ordinateur" };
export const OS_LABELS: Record<string, string> = { android: "Android", ios: "iPhone / iPad", windows: "Windows", macos: "Mac", linux: "Linux", other: "Autre" };
export const BROWSER_LABELS: Record<string, string> = { chrome: "Chrome", safari: "Safari", firefox: "Firefox", edge: "Edge", samsung: "Samsung Internet", opera: "Opera", other: "Autre" };
