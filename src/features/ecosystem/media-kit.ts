import "server-only";

import QRCode from "qrcode";

/** Media Kit : visuels SVG générés à partir des vraies informations de la campagne (aucun contenu inventé). */
export const KIT_FORMATS = {
  square: { label: "Publication carrée (1080 × 1080)", width: 1080, height: 1080 },
  story: { label: "Story / statut (1080 × 1920)", width: 1080, height: 1920 },
  poster: { label: "Affiche A4 (1240 × 1754)", width: 1240, height: 1754 },
} as const;
export type KitFormat = keyof typeof KIT_FORMATS;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Coupe un texte en lignes d'au plus `max` caractères (mots entiers), `lines` lignes au plus. */
function wrap(text: string, max: number, lines: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if ((line + " " + word).trim().length > max) {
      if (line) out.push(line);
      line = word;
      if (out.length === lines) break;
    } else line = (line + " " + word).trim();
  }
  if (line && out.length < lines) out.push(line);
  if (out.length === lines && text.length > out.join(" ").length) out[lines - 1] = out[lines - 1]!.replace(/.{0,1}$/, "…");
  return out;
}

export async function campaignKitSvg(input: {
  format: KitFormat;
  title: string;
  objective: string;
  description: string | null;
  organization: string;
  dates: string | null;
  contact: string | null;
  url: string;
  color: string;
  image: string | null;
  logo: string | null;
}): Promise<string> {
  const { width: W, height: H } = KIT_FORMATS[input.format];
  const pad = Math.round(W * 0.07);
  const color = /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : "#0E4A9A";
  const qr = await QRCode.toString(input.url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0B1F3A", light: "#FFFFFF" } });
  const qrViewBox = qr.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 33 33";
  const qrInner = qr.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const qrSize = Math.round(W * (input.format === "story" ? 0.34 : 0.26));
  const imageH = input.image ? Math.round(H * (input.format === "square" ? 0.38 : 0.36)) : 0;
  const titleSize = Math.round(W * 0.068);
  const titleLines = wrap(input.title, input.format === "square" ? 24 : 22, 3);
  const descLines = input.description ? wrap(input.description, 46, input.format === "square" ? 2 : 5) : [];
  let y = imageH + pad + Math.round(W * 0.05);
  const parts: string[] = [];
  parts.push(`<text x="${pad}" y="${y}" font-size="${Math.round(W * 0.028)}" font-weight="700" fill="${color}" letter-spacing="2">${esc(input.objective.toUpperCase())}</text>`);
  y += Math.round(titleSize * 1.25);
  for (const l of titleLines) {
    parts.push(`<text x="${pad}" y="${y}" font-size="${titleSize}" font-weight="800" fill="#0B1F3A">${esc(l)}</text>`);
    y += Math.round(titleSize * 1.15);
  }
  y += Math.round(W * 0.01);
  for (const l of descLines) {
    parts.push(`<text x="${pad}" y="${y}" font-size="${Math.round(W * 0.03)}" fill="#334155">${esc(l)}</text>`);
    y += Math.round(W * 0.042);
  }
  if (input.dates) {
    y += Math.round(W * 0.02);
    parts.push(`<text x="${pad}" y="${y}" font-size="${Math.round(W * 0.03)}" font-weight="700" fill="#0B1F3A">${esc(input.dates)}</text>`);
  }
  const footerH = qrSize + pad * 2;
  const footerY = H - footerH;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, 'Segoe UI', Arial, sans-serif">
  <rect width="${W}" height="${H}" fill="#FFFFFF"/>
  ${input.image ? `<image href="${input.image}" x="0" y="0" width="${W}" height="${imageH}" preserveAspectRatio="xMidYMid slice"/>` : `<rect width="${W}" height="${Math.round(W * 0.03)}" fill="${color}"/>`}
  ${parts.join("\n  ")}
  <rect x="0" y="${footerY}" width="${W}" height="${footerH}" fill="${color}"/>
  ${input.logo ? `<image href="${input.logo}" x="${pad}" y="${footerY + pad}" width="${Math.round(W * 0.12)}" height="${Math.round(W * 0.12)}" preserveAspectRatio="xMidYMid meet"/>` : ""}
  <text x="${pad + (input.logo ? Math.round(W * 0.14) : 0)}" y="${footerY + pad + Math.round(W * 0.05)}" font-size="${Math.round(W * 0.038)}" font-weight="800" fill="#FFFFFF">${esc(input.organization.slice(0, 40))}</text>
  ${input.contact ? `<text x="${pad + (input.logo ? Math.round(W * 0.14) : 0)}" y="${footerY + pad + Math.round(W * 0.1)}" font-size="${Math.round(W * 0.028)}" fill="#FFFFFF">${esc(input.contact.slice(0, 48))}</text>` : ""}
  <text x="${pad}" y="${H - pad}" font-size="${Math.round(W * 0.024)}" fill="#FFFFFF" opacity="0.85">Scannez pour en savoir plus</text>
  <rect x="${W - pad - qrSize - 16}" y="${footerY + pad - 16}" width="${qrSize + 32}" height="${qrSize + 32}" rx="16" fill="#FFFFFF"/>
  <svg x="${W - pad - qrSize}" y="${footerY + pad}" width="${qrSize}" height="${qrSize}" viewBox="${qrViewBox}" shape-rendering="crispEdges">${qrInner}</svg>
</svg>`;
}
