// Icônes et écrans de démarrage Android / iPhone à partir du logo NeoScool.
// Chaque image existante du projet natif est régénérée à ses dimensions d'origine.
//   node scripts/icones.mjs   (utilise « sharp » installé pour l'application web)
import { readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require("sharp");
} catch {
  sharp = require(join(root, "..", "node_modules", "sharp"));
}
const LOGO = join(root, "..", "public", "assets", "neoscool", "logo", "neoscool-mark.png");
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Logo centré sur un fond, occupant `ratio` du plus petit côté. */
async function compose(target, { background, ratio, round = false, flatten = false }) {
  const { width, height } = await sharp(target).metadata();
  const size = Math.round(Math.min(width, height) * ratio);
  const logo = await sharp(LOGO).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  let image = sharp({ create: { width, height, channels: 4, background } }).composite([{ input: logo, gravity: "center" }]);
  if (round) {
    const r = Math.min(width, height) / 2;
    const mask = Buffer.from(`<svg width="${width}" height="${height}"><circle cx="${width / 2}" cy="${height / 2}" r="${r}" fill="#fff"/></svg>`);
    image = sharp(await image.png().toBuffer()).composite([{ input: mask, blend: "dest-in" }]);
  }
  if (flatten) image = sharp(await image.png().toBuffer()).flatten({ background: WHITE });
  await image.png().toFile(`${target}.tmp`);
  const { renameSync } = await import("node:fs");
  renameSync(`${target}.tmp`, target);
}

const res = join(root, "android", "app", "src", "main", "res");
const ios = join(root, "ios", "App", "App", "Assets.xcassets");
let count = 0;
for (const file of walk(res).filter((f) => f.endsWith(".png"))) {
  const name = file.split("/").pop();
  if (name === "ic_launcher.png") await compose(file, { background: WHITE, ratio: 0.78 });
  else if (name === "ic_launcher_round.png") await compose(file, { background: WHITE, ratio: 0.7, round: true });
  else if (name === "ic_launcher_foreground.png") await compose(file, { background: { r: 0, g: 0, b: 0, alpha: 0 }, ratio: 0.56 });
  else if (name === "splash.png") await compose(file, { background: WHITE, ratio: 0.28 });
  else continue;
  count += 1;
}
for (const file of walk(ios).filter((f) => f.endsWith(".png"))) {
  if (file.includes("AppIcon")) await compose(file, { background: WHITE, ratio: 0.78, flatten: true });
  else if (file.includes("Splash")) await compose(file, { background: WHITE, ratio: 0.22 });
  else continue;
  count += 1;
}
console.log(`${count} images régénérées à partir du logo NeoScool.`);
