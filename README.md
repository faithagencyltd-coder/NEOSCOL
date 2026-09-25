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
| 17 — Migration des données historiques : anciens élèves, années anciennes, parcours, notes, paiements, diplômes (import Excel/CSV en 9 étapes, doublons, rapport) | ✅ |
| 12 → 14 — Rapports/exports, assistant, PWA installable | à venir |

## Démarrage

**Essayer en une commande** (Node.js ≥ 20.9 + Docker Desktop) : `npm run demo`
(Windows : `npm run demo:windows`) puis http://localhost:3000 — guide pas à pas :
[docs/DEMARRER-EN-LOCAL.md](docs/DEMARRER-EN-LOCAL.md).

Le script démarre Supabase en local (`supabase/config.toml` : migrations, données de
démonstration, code SMS de test), écrit `.env.local` et lance l'application.

Avec un projet Supabase hébergé :

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
| `formation@demo.neoscol.app` | Administrateur du centre de formation (apprenants, sessions) |
| `universite@demo.neoscol.app` | Administratrice de l'université (étudiants, promotions, crédits ECTS) |
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

#### Lien des portails (un lien par établissement)

Chaque établissement dispose d'un lien unique et partageable, **`/acces/CODE`** (ex. `/acces/DEMO`),
qui ouvre les portails **Parent**, **Enseignant / Formateur** et **Élève / Étudiant** (plus
l'administration). Chacun s'y connecte avec ses propres identifiants ; `?portail=parent|enseignant|eleve|personnel`
ouvre directement un portail.

- Administration : **Portails › Lien des portails** (`/parametres/portails`, permission `settings.manage`) :
  copie, WhatsApp, SMS, e-mail, QR code et affiche A4 à imprimer (PDF).
- Contrôle côté serveur : l'identifiant est recherché dans l'établissement du lien uniquement ; après
  authentification, le compte doit en être membre avec un rôle correspondant au portail, sinon la session
  est fermée et le refus journalisé (`auth.portal_denied`). L'établissement du lien devient l'établissement actif.
- La page publique n'expose que l'identité de l'établissement (nom, type, ville, couleurs, logo) via
  `organization_portal` ; établissements suspendus ou archivés : lien inactif.
- L'adresse partagée vient de `NEXT_PUBLIC_SITE_URL` (domaine réel) ou, à défaut, de l'hôte de la requête.

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

## Migration des données historiques

Menu **Établissement › Données historiques** (permission `students.import`) :

- **Importer** un fichier Excel (.xlsx) ou CSV : anciens élèves et parcours, notes historiques, paiements historiques.
  Assistant en 9 étapes : fichier, analyse automatique des colonnes, correspondance, aperçu, doublons
  (matricule, nom, prénom, date de naissance → utiliser l'existant, fusionner, créer, ignorer), données manquantes,
  validation, importation par tranches, rapport (données rejetées téléchargeables en CSV).
- **Anciennes années scolaires** (2015-2016…) créées clôturées, automatiquement ou par période.
- **Ajouter manuellement un ancien élève** (même détection des doublons).
- Liste des élèves : onglets Actifs, Anciens, Diplômés, Transférés, Archivés ; dossier : onglet « Parcours antérieur ».
- Historique des migrations (date, administrateur, fichier, lignes, importées, doublons, rejets) et journal d'audit.
- Toutes les données sont rattachées à l'établissement et protégées par RLS (tests : `tests/db/migration.test.mjs`).
- Fichiers d'exemple : [`docs/exemples/`](docs/exemples) ; modèles CSV téléchargeables depuis l'écran.

## Abonnements NéoScol (SaaS)

Paiement de l'abonnement **par l'établissement à NéoScol** — totalement distinct des finances de
l'établissement (scolarité, reçus, dépenses), qui ne partagent ni table ni permission.

- **Formules officielles** (XOF) : Maternelle & Primaire 8 000/mois (67 200/an), Collège & Lycée et
  Centre de formation 15 000/mois (126 000/an), Université 20 000/mois (168 000/an), Enterprise
  28 000/mois (235 200/an). Annuel = -30 % ; prix barré et économie exacts, jamais recalculés.
- **Essai gratuit de 14 jours** à la création de chaque établissement (`/inscription` ou console plateforme).
- **Pages** : `/tarifs` (alias `/pricing`), `/inscription`, `/abonnement` (Mon abonnement), `/abonnement/souscrire`
  (paiement en 5 étapes), factures PDF `/api/abonnement/factures/[id]`, console `/plateforme`
  (Établissements, Abonnements, Paiements, Formules).
- **Statuts** `TRIALING, ACTIVE, PAST_DUE, GRACE_PERIOD, RESTRICTED, CANCELLED, EXPIRED`, fixés uniquement par
  la base (migration `20260928001900_subscriptions_billing.sql`). Impayé : accès complet pendant le délai de
  grâce, puis **lecture seule** (appliquée par `app.permitted_org_ids`, donc par toutes les politiques RLS) ;
  aucune donnée n'est jamais supprimée ; réactivation immédiate au paiement confirmé. Délais configurables.
- **Paiement** : interface `PaymentProvider` (`src/lib/payments`) — PayDunya (API Checkout Invoice, mode test /
  live) et paiement simulé pour le développement local. Montant calculé en base, référence `NEO-AAAA-000001`,
  facture `NSC-AAAA-000001`. Le retour navigateur et le webhook ne sont que des signaux : le paiement est
  **revérifié auprès du fournisseur** par le serveur, puis appliqué de façon **idempotente** (montant, devise,
  référence et mode contrôlés). Webhook : `POST /api/webhooks/payments/[provider]`.
- **Tâche quotidienne** : `GET /api/cron/abonnements` (Bearer `CRON_SECRET`) — rappels d'essai J-7/J-3/J-1/J,
  factures de renouvellement, impayés, paiements abandonnés.
- **Variables** (serveur uniquement, voir `.env.example`) : `PAYMENT_PROVIDER`, `PAYDUNYA_MODE`,
  `PAYDUNYA_MASTER_KEY`, `PAYDUNYA_PRIVATE_KEY`, `PAYDUNYA_PUBLIC_KEY`, `PAYDUNYA_TOKEN`, `PAYMENT_WEBHOOK_SECRET`.
- **Tests** : `npm run db:test` (dont `tests/db/billing.test.mjs`), `npm run test:unit` (fournisseurs, secrets),
  `tests/e2e/abonnements.mjs` (parcours navigateur complet, avec `PAYMENT_PROVIDER=simulation`).
