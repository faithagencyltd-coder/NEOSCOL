#!/usr/bin/env bash
# NéoScol — démonstration locale en une commande (macOS / Linux).
#   Prérequis : Node.js ≥ 20.9 et Docker Desktop démarré.
#   Usage     : npm run demo          (première fois : 5 à 10 min, téléchargement des images)
#               npm run demo -- --reset   (remet les données de démonstration à zéro)
set -euo pipefail
cd "$(dirname "$0")/.."

SUPABASE="npx --yes supabase@2"
say() { printf "\n\033[1;34m▶ %s\033[0m\n" "$1"; }
fail() { printf "\n\033[1;31m✖ %s\033[0m\n" "$1"; exit 1; }

command -v node >/dev/null || fail "Node.js est introuvable : installez-le depuis https://nodejs.org (version 20 ou plus)."
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a===20&&b>=9)?0:1)' \
  || fail "Node.js $(node -v) est trop ancien : installez la version 20.9 ou plus."
command -v docker >/dev/null || fail "Docker est introuvable : installez Docker Desktop (https://www.docker.com/products/docker-desktop)."
docker info >/dev/null 2>&1 || fail "Docker n'est pas démarré : lancez Docker Desktop puis relancez cette commande."

say "Installation des dépendances"
npm install --no-audit --no-fund

say "Démarrage de Supabase (base de données, authentification, API)"
$SUPABASE start
if [[ "${1:-}" == "--reset" ]]; then
  say "Remise à zéro des données de démonstration"
  $SUPABASE db reset
fi

say "Configuration de l'application (.env.local)"
eval "$($SUPABASE status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
if [[ -f .env.local ]] && ! grep -q "127.0.0.1:54321" .env.local; then
  cp .env.local ".env.local.sauvegarde-$(date +%Y%m%d%H%M%S)"
  echo "  (votre ancien .env.local a été sauvegardé)"
fi
cat > .env.local <<ENV
# Généré par scripts/demo-local.sh — Supabase LOCAL de démonstration.
NEXT_PUBLIC_SUPABASE_URL=${API_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
NEXT_PUBLIC_SITE_URL=http://localhost:3000
CRON_SECRET=demo-local-$(node -e 'console.log(require("crypto").randomBytes(12).toString("hex"))')
NEOSCOL_DEMO_MODE=1
ENV

say "NéoScol démarre : ouvrez http://localhost:3000"
echo "  Choisissez un rôle sur la page de connexion (mode démonstration)."
echo "  Mot de passe commun : NeoScol-Demo-2026!   ·   Code SMS parent : 123456"
echo "  Arrêt : Ctrl+C (puis « npx supabase stop » pour arrêter la base)."
npm run dev
