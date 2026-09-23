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
| 7 — Pédagogie : emploi du temps, appel, registre des absences, notes, bulletins | ✅ |
| 8 — Finance : factures, échéanciers, paiements, reçus, dépenses, rappels d'impayés | ✅ |
| 9 — Documents officiels PDF (bulletins, reçus, certificats, cartes, badges, dossier complet) + QR de vérification | ✅ |
| 10 — Personnel, badges QR, tablette de pointage, cours déverrouillés par badge | ✅ |
| 10 — Portails parent et élève (mobile), restrictions d'impayé, comptes portail | ✅ |
| 11 — Notifications in-app (absences, factures, rappels, accès rétabli), annonces | ✅ |
| 15 — Journal d'audit (utilisateur, rôle, action, date, résultat), paramètres | ✅ |
| 16 — Tests E2E navigateur du critère final (administration, professeur, parent, élève) | ✅ |
| 12 → 14 — Rapports/exports, assistant, PWA installable | à venir |

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
| `enseignant@demo.neoscol.app` / `enseignante@…` | Enseignants (connexion aussi par matricule `EMP-DEMO-…`) |
| Parent : profil « Parent / Tuteur », tél. `+2250700000001`, nom `BAMBA`, prénom `Adjoua`, code SMS | Parent de 2 élèves (Kofi, en impayé ; Aya) |
| Élève : profil « Élève », matricule `DEMO-26-00001`, né le `12/03/2014`, mot de passe commun | Élève (Kofi) |
| `formation@demo.neoscol.app` | Administrateur d'un 2ᵉ établissement (tests d'isolation) |
| `superadmin@demo.neoscol.app` | Super administrateur plateforme |
| `pointage@demo.neoscol.app` | Tablette de pointage (scan des badges) |

### Connexions

| Profil | Méthode |
|---|---|
| Administration, enseignants | E-mail **ou matricule** + mot de passe |
| Parent / tuteur | Téléphone + nom + prénom → code à usage unique par SMS (fournisseur SMS à configurer dans Supabase Auth ; en local, `GOTRUE_SMS_TEST_OTP` fixe un code de test) |
| Élève / apprenant | Matricule + date de naissance + mot de passe |
| Tablette de pointage | Compte dédié (rôle « Tablette de pointage ») : écran « SCANNER LE BADGE » |

Les comptes portail sont créés par l'établissement (fiche parent, onglet « Portail » de l'élève) ;
aucune inscription publique.

### Tâches planifiées

`GET /api/cron/rappels` avec l'en-tête `Authorization: Bearer $CRON_SECRET` envoie les rappels
d'échéance et d'impayé (une fois par jour, via Vercel Cron, pg_cron ou tout ordonnanceur).

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
src/app/               Routes (auth), (app) administration, (portail) parent/élève, (kiosque), api/
src/components/        Design system (ui), mise en page (layout), composants partagés
src/features/          Modules métier : actions, requêtes, schémas, composants
src/lib/               Supabase, session, permissions, utilitaires
```
