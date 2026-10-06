// Génère src/features/analytics/world-map.ts : tracés SVG simplifiés des pays
// (Natural Earth 1:110m via world-atlas), indexés par code ISO alpha-2.
// À relancer seulement si l'on veut changer la projection ou la précision.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

import { geoNaturalEarth1, geoPath } from "d3-geo";
import countries from "i18n-iso-countries";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve("world-atlas/countries-110m.json"), "utf8"));
const all = feature(topo, topo.objects.countries);
const geo = { ...all, features: all.features.filter((f) => f.properties?.name !== "Antarctica") };
const W = 960;
const H = 470;
const projection = geoNaturalEarth1().fitSize([W, H], geo);
const path = geoPath(projection);
const round = (d) => d.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * 10) / 10));
const out = {};
for (const f of geo.features) {
  const code = f.id ? countries.numericToAlpha2(String(f.id).padStart(3, "0")) : null;
  const d = path(f);
  if (!d) continue;
  const key = code ?? `X-${f.properties?.name ?? "?"}`;
  out[key] = (out[key] ? out[key] : "") + round(d);
}
const body = Object.entries(out).map(([k, d]) => `  ${JSON.stringify(k)}: ${JSON.stringify(d)},`).join("\n");
writeFileSync(
  "src/features/analytics/world-map.ts",
  `// Fichier généré par scripts/gen-world-map.mjs (Natural Earth 1:110m, domaine public) — ne pas modifier à la main.\nexport const WORLD_VIEWBOX = "0 0 ${W} ${H}";\nexport const WORLD_PATHS: Record<string, string> = {\n${body}\n};\n`,
);
console.log(`${Object.keys(out).length} pays`);
