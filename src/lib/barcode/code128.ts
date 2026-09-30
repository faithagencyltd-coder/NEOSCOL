/**
 * Code-barres Code 128 (jeu B : caractères ASCII imprimables), sans dépendance.
 * Renvoie la suite des largeurs (barre, espace, barre…) en modules, prête à
 * dessiner en SVG ou en PDF. Somme de contrôle modulo 103 incluse.
 */
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
] as const;

export const CODE128_PATTERNS: readonly string[] = PATTERNS;
const START_B = 104;
const STOP = 106;

/** Largeurs des barres et espaces (en modules), en commençant par une barre. */
export function code128Widths(value: string): number[] {
  const text = value.replace(/[^\x20-\x7e]/g, "");
  const codes = [START_B, ...Array.from(text, (c) => c.charCodeAt(0) - 32)];
  const checksum = codes.reduce((sum, code, index) => sum + code * (index === 0 ? 1 : index), 0) % 103;
  return [...codes, checksum, STOP].flatMap((code) => Array.from(PATTERNS[code] ?? "", Number));
}

/** Barres noires positionnées (x, largeur) en modules, et largeur totale. */
export function code128Bars(value: string): { bars: { x: number; w: number }[]; width: number } {
  const widths = code128Widths(value);
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return { bars, width: x };
}
