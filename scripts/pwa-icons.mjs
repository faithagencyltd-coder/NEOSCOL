// Génère les icônes PWA (PNG) à partir de src/app/icon.svg : node scripts/pwa-icons.mjs
import { readFileSync } from "node:fs";

import sharp from "sharp";

const svg = readFileSync(new URL("../src/app/icon.svg", import.meta.url));
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname;

for (const size of [192, 512]) {
  await sharp(svg, { density: 1024 }).resize(size, size).png().toFile(out(`icon-${size}.png`));
}
// Icône « maskable » : marge de sécurité de 20 % sur fond bleu nuit.
const inner = await sharp(svg, { density: 1024 }).resize(360, 360).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#0b2559" } })
  .composite([{ input: inner, gravity: "center" }])
  .png()
  .toFile(out("maskable-512.png"));
await sharp(svg, { density: 1024 }).resize(180, 180).flatten({ background: "#ffffff" }).png().toFile(out("apple-touch-icon.png"));
console.log("Icônes PWA générées dans public/icons/");
