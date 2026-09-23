# NéoScol — démonstration locale en une commande (Windows / PowerShell).
#   Prérequis : Node.js >= 20.9 et Docker Desktop démarré.
#   Usage     : npm run demo:windows            (première fois : 5 à 10 min)
#               npm run demo:windows -- -Reset  (remet les données de démonstration à zéro)
param([switch]$Reset)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Say($m) { Write-Host "`n> $m" -ForegroundColor Cyan }
function Fail($m) { Write-Host "`nERREUR : $m" -ForegroundColor Red; exit 1 }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js est introuvable : installez-le depuis https://nodejs.org (version 20 ou plus)." }
$v = (node -p "process.versions.node").Split(".")
if ([int]$v[0] -lt 20 -or ([int]$v[0] -eq 20 -and [int]$v[1] -lt 9)) { Fail "Node.js $(node -v) est trop ancien : installez la version 20.9 ou plus." }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail "Docker est introuvable : installez Docker Desktop (https://www.docker.com/products/docker-desktop)." }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail "Docker n'est pas démarré : lancez Docker Desktop puis relancez cette commande." }

Say "Installation des dépendances"
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Fail "npm install a échoué." }

Say "Démarrage de Supabase (base de données, authentification, API)"
npx --yes supabase@2 start
if ($LASTEXITCODE -ne 0) { Fail "Supabase n'a pas pu démarrer (voir le message ci-dessus)." }
if ($Reset) { Say "Remise à zéro des données de démonstration"; npx --yes supabase@2 db reset }

Say "Configuration de l'application (.env.local)"
$status = @{}
npx --yes supabase@2 status -o env | ForEach-Object {
  if ($_ -match '^([A-Z_]+)="?(.*?)"?$') { $status[$Matches[1]] = $Matches[2] }
}
if ((Test-Path .env.local) -and -not (Select-String -Path .env.local -Pattern "127.0.0.1:54321" -Quiet)) {
  Copy-Item .env.local (".env.local.sauvegarde-" + (Get-Date -Format "yyyyMMddHHmmss"))
  Write-Host "  (votre ancien .env.local a été sauvegardé)"
}
$secret = -join ((1..24) | ForEach-Object { "{0:x}" -f (Get-Random -Maximum 16) })
@"
# Généré par scripts/demo-local.ps1 — Supabase LOCAL de démonstration.
NEXT_PUBLIC_SUPABASE_URL=$($status["API_URL"])
NEXT_PUBLIC_SUPABASE_ANON_KEY=$($status["ANON_KEY"])
SUPABASE_SERVICE_ROLE_KEY=$($status["SERVICE_ROLE_KEY"])
NEXT_PUBLIC_SITE_URL=http://localhost:3000
CRON_SECRET=demo-local-$secret
NEOSCOL_DEMO_MODE=1
"@ | Set-Content -Encoding UTF8 .env.local

Say "NéoScol démarre : ouvrez http://localhost:3000"
Write-Host "  Choisissez un rôle sur la page de connexion (mode démonstration)."
Write-Host "  Mot de passe commun : NeoScol-Demo-2026!   ·   Code SMS parent : 123456"
Write-Host "  Arrêt : Ctrl+C (puis « npx supabase stop » pour arrêter la base)."
npm run dev
