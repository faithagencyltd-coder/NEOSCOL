// Prépare les migrations pour l'éditeur SQL de Supabase (base de production vide, sans
// Supabase CLI) : plusieurs fichiers « NeoScool-base-partie-N.sql » à coller dans
// l'ordre dans Supabase › SQL Editor. Chaque partie :
//   - refuse de s'exécuter si la partie précédente n'a pas été appliquée, ou si elle l'a déjà été ;
//   - enregistre ses migrations dans supabase_migrations.schema_migrations (même table
//     que « supabase db push », qui n'appliquera ensuite que les nouvelles migrations).
// Ne contient jamais les données de démonstration (seed.sql).
//   node scripts/db/parties-sql-editor.mjs <dossier de sortie> [taille max en Ko, défaut 350]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = process.argv[2];
if (!out) throw new Error("Usage : node scripts/db/parties-sql-editor.mjs <dossier de sortie> [Ko]");
const maxBytes = Number(process.argv[3] ?? 350) * 1024;
const dir = join(root, "supabase", "migrations");
const files = readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();

// Regroupe les migrations (jamais coupées) en parties d'environ maxBytes.
const parts = [];
let current = [];
let size = 0;
for (const file of files) {
  const bytes = Buffer.byteLength(readFileSync(join(dir, file), "utf8"));
  if (current.length && size + bytes > maxBytes) {
    parts.push(current);
    current = [];
    size = 0;
  }
  current.push(file);
  size += bytes;
}
if (current.length) parts.push(current);

const q = (s) => `'${s.replace(/'/g, "''")}'`;
const version = (f) => f.split("_")[0];
const name = (f) => f.replace(/^\d+_/, "").replace(/\.sql$/, "");

mkdirSync(out, { recursive: true });
parts.forEach((list, i) => {
  const n = i + 1;
  const first = version(list[0]);
  const previous = i > 0 ? version(parts[i - 1].at(-1)) : null;
  const header = [
    `-- NeoScool : structure de la base, partie ${n} sur ${parts.length}`,
    `-- Migrations ${list[0]} … ${list.at(-1)} (${list.length}).`,
    "-- À coller en entier dans Supabase › SQL Editor › New query, puis « Run ».",
    "-- Exécutez les parties dans l'ordre (1, 2, 3…). Aucune donnée de démonstration.",
    "",
    "create schema if not exists supabase_migrations;",
    "create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text);",
    "do $neoscool$ begin",
    previous
      ? `  if not exists (select 1 from supabase_migrations.schema_migrations where version = ${q(previous)}) then raise exception 'Exécutez d''abord la partie ${n - 1}.'; end if;`
      : "",
    `  if exists (select 1 from supabase_migrations.schema_migrations where version = ${q(first)}) then raise exception 'La partie ${n} est déjà appliquée : passez à la suivante.'; end if;`,
    "end $neoscool$;",
    "",
  ].filter((l) => l !== "").join("\n");
  const body = list.map((f) => `\n-- ===== ${f} =====\n${readFileSync(join(dir, f), "utf8").trim()}\n`).join("");
  const footer = `\n-- Migrations de la partie ${n} enregistrées (reconnues par « supabase db push »).\ninsert into supabase_migrations.schema_migrations (version, name) values\n${list.map((f) => `  (${q(version(f))}, ${q(name(f))})`).join(",\n")};\n`;
  const file = join(out, `NeoScool-base-partie-${n}.sql`);
  writeFileSync(file, `${header}\n${body}${footer}`);
  console.log(`${file} : ${list.length} migrations, ${Math.round(Buffer.byteLength(header + body + footer) / 1024)} Ko`);
});
