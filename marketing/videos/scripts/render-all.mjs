// Rendu des 6 vidéos (3 modules × 16:9 et 9:16) dans out/.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

mkdirSync("out", { recursive: true });
const only = process.argv.slice(2);
for (const video of ["scolaire", "formation", "universite"]) {
  for (const format of ["16x9", "9x16"]) {
    const id = `${video}-${format}`;
    if (only.length && !only.includes(id)) continue;
    console.log(`\n=== ${id} ===`);
    execFileSync("npx", ["remotion", "render", "src/index.ts", id, `out/NeoScool-${video}-${format}.mp4`, "--codec=h264", "--crf=18", "--audio-bitrate=192k"], { stdio: "inherit" });
  }
}
