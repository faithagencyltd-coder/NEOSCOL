// Rendu du film officiel du module scolaire (toutes les versions) dans out/.
//   node scripts/render-film.mjs [composition…]
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

mkdirSync("out", { recursive: true });
const only = process.argv.slice(2);
const ids = ["film-scolaire-16x9", "film-60s-16x9", "film-60s-9x16", "film-30s-16x9", "film-30s-9x16", "logo-6s-16x9", "logo-6s-9x16", "logo-2s-16x9"];
for (const id of ids) {
  if (only.length && !only.includes(id)) continue;
  console.log(`\n=== ${id} ===`);
  execFileSync("npx", ["remotion", "render", "src/index.ts", id, `out/NeoScool-${id}.mp4`, "--codec=h264", "--crf=18", "--audio-bitrate=192k"], { stdio: "inherit" });
}
