#!/usr/bin/env bash
# Assemble le paquet portable NéoScol (sans Docker).
#
#   PG_DIR=…/native  AUTH_BIN=…/auth.exe  AUTH_MIGRATIONS=…/migrations  POSTGREST_BIN=…/postgrest.exe \
#   SHARP_DIR=…/@img/sharp-win32-x64 (facultatif)  scripts/portable/construire.sh windows /chemin/sortie
#
# PG_DIR           : binaires PostgreSQL embarqués (bin/, lib/, share/), ex. paquet npm @embedded-postgres/windows-x64
# AUTH_BIN         : GoTrue (supabase/auth) compilé pour la cible, AUTH_MIGRATIONS son dossier migrations/
# POSTGREST_BIN    : PostgREST pour la cible
# MSVC_DIR         : (Windows) dossier contenant (ex. roue PyPI msvc-runtime, data/Scripts) vcruntime140.dll, vcruntime140_1.dll, msvcp140.dll
# Les clés JWT sont générées ici : propres à ce paquet, valables uniquement en local.
set -euo pipefail
TARGET="${1:?cible : windows ou linux}"
OUT="${2:?dossier de sortie}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
: "${PG_DIR:?}" "${AUTH_BIN:?}" "${AUTH_MIGRATIONS:?}" "${POSTGREST_BIN:?}"

SECRET="neoscol-portable-$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')"
KEYS="$(SECRET="$SECRET" node -e '
const { createHmac } = require("node:crypto");
const s = process.env.SECRET;
const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sign = (p) => { const h = b({ alg: "HS256", typ: "JWT" }), q = b(p); return `${h}.${q}.${createHmac("sha256", s).update(`${h}.${q}`).digest("base64url")}`; };
const exp = Math.floor(Date.UTC(2036, 0, 1) / 1000);
console.log(JSON.stringify({ jwtSecret: s, anonKey: sign({ role: "anon", iss: "supabase", exp }), serviceKey: sign({ role: "service_role", iss: "supabase", exp }), cronSecret: require("crypto").randomBytes(16).toString("hex") }));')"
ANON="$(node -e 'console.log(JSON.parse(process.argv[1]).anonKey)' "$KEYS")"

echo "▶ Compilation de l'application (serveur autonome)"
BUILD="$(mktemp -d)"
git -C "$ROOT" archive HEAD | tar -x -C "$BUILD"
cp -r "$ROOT/node_modules" "$BUILD/"
( cd "$BUILD" && NEOSCOL_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321 NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON" NEXT_PUBLIC_SITE_URL=http://localhost:3000 \
    npx next build >/dev/null )

echo "▶ Assemblage dans $OUT"
rm -rf "$OUT" && mkdir -p "$OUT"/{app,runtime/auth,runtime/postgrest,runtime/postgres,base}
cp -r "$BUILD/.next/standalone/." "$OUT/app/"
cp -r "$BUILD/.next/static" "$OUT/app/.next/static"
cp -r "$BUILD/public" "$OUT/app/public"
rm -rf "$BUILD"
if [[ "$TARGET" == "windows" ]]; then
  # Module d'images : binaires Windows à la place de ceux de Linux.
  rm -rf "$OUT"/app/node_modules/@img/sharp-linux* "$OUT"/app/node_modules/@img/sharp-libvips-linux*
  [[ -n "${SHARP_DIR:-}" ]] && cp -r "$SHARP_DIR" "$OUT/app/node_modules/@img/"
fi
cp -r "$PG_DIR"/{bin,lib,share} "$OUT/runtime/postgres/"
# Inutile au serveur : bibliothèques graphiques (pgAdmin), traductions, fichiers de développement,
# langages procéduraux Perl/Python/Tcl (non installés).
rm -rf "$OUT"/runtime/postgres/bin/wx*.dll "$OUT"/runtime/postgres/bin/testplug.dll "$OUT/runtime/postgres/share/locale" \
  "$OUT"/runtime/postgres/lib/*.lib "$OUT"/runtime/postgres/lib/*.a "$OUT"/runtime/postgres/lib/plperl* "$OUT"/runtime/postgres/lib/plpython* \
  "$OUT"/runtime/postgres/lib/pltcl* "$OUT"/runtime/postgres/lib/*plperl* "$OUT"/runtime/postgres/lib/*plpython*
EXT=""; [[ "$TARGET" == "windows" ]] && EXT=".exe"
cp "$AUTH_BIN" "$OUT/runtime/auth/auth$EXT" && cp -r "$AUTH_MIGRATIONS" "$OUT/runtime/auth/migrations"
cp "$POSTGREST_BIN" "$OUT/runtime/postgrest/postgrest$EXT"
if [[ "$TARGET" == "windows" ]]; then
  # Runtime Microsoft Visual C++ (déploiement local à l'application) pour PostgreSQL et PostgREST,
  # et libpq (+ dépendances) à côté de PostgREST, qui ne les fournit pas.
  if [[ -n "${MSVC_DIR:-}" ]]; then
    for d in vcruntime140.dll vcruntime140_1.dll msvcp140.dll; do
      cp "$MSVC_DIR/$d" "$OUT/runtime/postgres/bin/" && cp "$MSVC_DIR/$d" "$OUT/runtime/postgrest/"
    done
  fi
  for d in libpq.dll libssl-3-x64.dll libcrypto-3-x64.dll libintl-9.dll libiconv-2.dll libwinpthread-1.dll; do
    [[ -f "$OUT/runtime/postgres/bin/$d" ]] && cp "$OUT/runtime/postgres/bin/$d" "$OUT/runtime/postgrest/"
  done
fi
# L'extracteur zip de Windows ne recrée pas les liens symboliques : on les remplace par des copies.
while IFS= read -r link; do
  target="$(readlink -f "$link")"
  rm "$link" && cp -r "$target" "$link"
done < <(find "$OUT" -type l)
cp "$ROOT/scripts/db/supabase-stub.sql" "$ROOT/supabase/seed.sql" "$OUT/base/"
cp -r "$ROOT/supabase/migrations" "$OUT/base/migrations"
cp "$ROOT"/scripts/portable/{demarrer.mjs,DEMARRER.cmd,REINITIALISER.cmd,LISEZ-MOI.txt} "$OUT/"
node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify(JSON.parse(process.argv[2]), null, 2))' "$OUT/config.json" "$KEYS"
printf '{ "name": "neoscol-portable", "private": true, "type": "module" }\n' > "$OUT/package.json"
( cd "$OUT" && npm install --no-audit --no-fund --no-package-lock --omit=dev pg@8 >/dev/null )
echo "✔ Paquet prêt : $OUT"
