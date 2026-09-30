/** Image de marque et textes du site (fonctions pures, testées). */

export const HEX = /^#[0-9a-f]{6}$/;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (c: number[]) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Rapport de contraste WCAG entre deux couleurs (1 à 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi! + 0.05) / (lo! + 0.05)) * 100) / 100;
}

/** Mélange avec du noir (amount > 0) ou du blanc (amount < 0). */
export function mix(hex: string, amount: number): string {
  const target = amount > 0 ? 0 : 255;
  const t = Math.abs(amount);
  return toHex(rgb(hex).map((v) => v + (target - v) * t));
}

/** Couleur principale acceptée : texte blanc lisible dessus (contraste ≥ 4,5 : 1). */
export function validatePrimaryColor(value: string): { ok: true; color: string } | { ok: false; message: string } {
  const color = value.trim().toLowerCase();
  if (!HEX.test(color)) return { ok: false, message: "Couleur invalide (format #RRGGBB)." };
  const ratio = contrastRatio(color, "#ffffff");
  if (ratio < 4.5) return { ok: false, message: `Couleur trop claire : le texte blanc des boutons serait illisible (contraste ${ratio} : 1, minimum 4,5 : 1).` };
  return { ok: true, color };
}

/** Variables CSS appliquées au thème clair (le thème sombre garde ses couleurs). */
export function brandCss(primary: string | null, logoUrl: string | null): string {
  const rules: string[] = [];
  if (primary && HEX.test(primary)) {
    rules.push(`--primary:${primary}`, `--primary-hover:${mix(primary, 0.18)}`, `--primary-soft:${mix(primary, -0.9)}`, `--ring:${primary}`);
  }
  const vars = rules.join(";");
  const root = rules.length
    ? `@media not (prefers-color-scheme: dark){:root:not([data-theme="dark"]){${vars}}}:root[data-theme="light"]{${vars}}`
    : "";
  const logo = logoUrl && /^https?:\/\/[^\s"'()]+$/.test(logoUrl) ? `:root{--brand-logo:url("${logoUrl}")}` : "";
  return root + logo;
}

/** Lien WhatsApp (numéro international sans « + »). */
export const whatsappLink = (digits: string) => `https://wa.me/${digits.replace(/\D/g, "")}`;

/** Texte saisi → blocs : « ## Titre » devient un intertitre, une ligne vide sépare les paragraphes. */
export function textBlocks(text: string): { kind: "h2" | "p"; text: string }[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .flatMap((chunk) => {
      const lines = chunk.split("\n");
      const out: { kind: "h2" | "p"; text: string }[] = [];
      let para: string[] = [];
      for (const line of lines) {
        if (/^#{1,3}\s+/.test(line)) {
          if (para.length) out.push({ kind: "p", text: para.join("\n") });
          para = [];
          out.push({ kind: "h2", text: line.replace(/^#{1,3}\s+/, "").trim() });
        } else if (line.trim()) para.push(line);
      }
      if (para.length) out.push({ kind: "p", text: para.join("\n") });
      return out;
    });
}
