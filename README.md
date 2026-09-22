# NéoScol

> Plus qu'un logiciel, une vision pour l'éducation.

Plateforme SaaS multi-établissements de gestion scolaire et de formation :
écoles, collèges, lycées, universités, instituts et centres de formation.

- **Conception complète** : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Stack** : Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 · Supabase (PostgreSQL + RLS, Auth, Storage, Realtime)

## État d'avancement

| Phase | Statut |
|---|---|
| 0 — Analyse et conception | ✅ |
| 1 — Structure du projet | ✅ |
| 2 — Base de données (schéma complet, RLS, seed, tests) | ✅ |
| 3 — Authentification, rôles, permissions, multi-établissements | ✅ |
| 4 — Design system et mise en page | ✅ (socle) |
| 5 — Tableau de bord | ✅ (indicateurs réels par rôle) |
| 6 — Scolarité : élèves, dossier 360°, parents, classes, structure, inscriptions, formulaires | ✅ |
| 7 → 16 — Pédagogie, finance, documents, portails, communication, rapports, PWA, tests E2E | à venir |

## Démarrage

Prérequis : Node.js ≥ 20.9 et un projet Supabase (ou `supabase start` avec le CLI Supabase et Docker).

```bash
npm install
cp .env.example .env.local        # renseigner l'URL et les clés Supabase
supabase db push                  # applique supabase/migrations
psql "$DATABASE_URL" -f supabase/seed.sql   # optionnel : données de DÉMONSTRATION
npm run dev
```

Sans variables Supabase, l'application affiche une page `/configuration` explicative.

### Comptes de démonstration (seed)

⚠ Données **fictives**, établissements marqués `is_demo` (un bandeau l'indique dans l'interface).
Mot de passe commun : `NeoScol-Demo-2026!`

| Compte | Rôle |
|---|---|
| `admin@demo.neoscol.app` | Administrateur (GS Démo) |
| `direction@demo.neoscol.app` | Direction |
| `secretariat@demo.neoscol.app` | Secrétariat |
| `comptable@demo.neoscol.app` | Comptabilité |
| `enseignant@demo.neoscol.app` / `enseignante@…` | Enseignants |
| `parent@demo.neoscol.app` (tél. `+2250700000001`) | Parent de 2 élèves |
| `eleve@demo.neoscol.app` | Élève |
| `formation@demo.neoscol.app` | Administrateur d'un 2ᵉ établissement (tests d'isolation) |
| `superadmin@demo.neoscol.app` | Super administrateur plateforme |

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` / `build` / `start` | Application Next.js |
| `npm run typecheck` · `npm run lint` | Vérifications TypeScript et ESLint |
| `npm run db:reset` | Recrée une base PostgreSQL locale de test (émulation Supabase + migrations + seed) |
| `npm run db:test` | Tests de sécurité et d'invariants (isolation, portées par rôle, finance, audit…) |
| `npm run db:types` | Régénère `src/types/database.ts` depuis le schéma |
| `npm run check` | Tout ce qui précède + build |

Les tests base de données utilisent les variables `PG*` (par défaut `postgres:postgres@localhost`).

## Structure

```
docs/                  Conception et décisions d'architecture
supabase/migrations/   Schéma PostgreSQL (source de vérité) : tables, RLS, triggers, RPC
supabase/seed.sql      Données de démonstration
scripts/db/            Émulation Supabase pour les tests, génération des types
tests/db/              Tests de sécurité exécutés contre PostgreSQL
src/app/               Routes (auth), (app), routes techniques
src/components/        Design system (ui), mise en page (layout), composants partagés
src/features/          Modules métier : actions, requêtes, schémas, composants
src/lib/               Supabase, session, permissions, utilitaires
```
