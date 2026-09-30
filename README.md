# NeoScool

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
| `parent.formation@demo.neoscol.app` | Parent d'une apprenante du centre de formation (portail parent) |
| `parent.universite@demo.neoscol.app` | Parent d'un étudiant (portail parent universitaire, activé pour la démo) |
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
`GET /api/cron/notifications` (même en-tête, toutes les minutes) envoie les notifications push en attente
(clés VAPID générées dans la console : Intégrations → Notifications push).

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

## Abonnements NeoScool (SaaS)

Paiement de l'abonnement **par l'établissement à NeoScool** — totalement distinct des finances de
l'établissement (scolarité, reçus, dépenses), qui ne partagent ni table ni permission.

- **Formules officielles** (XOF) : Module Scolaire et Centre de formation 15 000/mois (126 000/an),
  Université 20 000/mois (168 000/an), **Module 4 — Multi-modules** 30 000/mois (252 000/an, remplace
  l'ancienne formule Enterprise). Annuel = -30 % ; prix barré et économie exacts, jamais recalculés.
- **Module 4** (migration `20261003002500_module4_multi_modules.sql`) : un établissement principal
  (`school_group`), 1 à 3 domaines (école, formation, université) au même prix, un **espace** rattaché par
  domaine (`parent_id`), un seul abonnement, bascule entre espaces (`/espaces` + barre en haut de l'application).
  Domaine retiré : espace en lecture seule, aucune donnée supprimée. Tout est contrôlé en base
  (`set_subscription_components`, `create_component_space`, `module4_overview`, `app.org_billing_access`).
- **Essai gratuit de 20 jours** à la création de chaque établissement (`/inscription` ou console plateforme).

## Intégrations de la plateforme (Super Admin → Intégrations)

`/plateforme/integrations` : Brevo (e-mail, SMS), Twilio (SMS de secours), WhatsApp Business Platform
(API Cloud officielle de Meta, modèles approuvés uniquement) et Cloudflare Turnstile. Configurées une fois,
utilisées par tous les établissements (migration `20261004002600_integrations.sql`).

- **Clés** saisies dans la console, chiffrées par le serveur (AES-256-GCM, `src/lib/messaging/crypto.ts`) avant
  d'arriver en base ; la colonne chiffrée n'est lisible par aucun rôle navigateur ; seul un indice « ••1234 »
  est réaffiché. Clé de chiffrement : `INTEGRATIONS_ENCRYPTION_KEY` (32 octets base64, recommandé) ou, à
  défaut, dérivée de la clé de service. Jamais de clé dans le journal d'audit.
- **Bouton « Tester »** : vérification des identifiants auprès du fournisseur, envoi réel facultatif.
- **Quotas mensuels** par établissement (défaut + dérogations) et **journal des envois** (destinataire masqué).
- **Envoi** : `sendEmail`, `sendSms` (Brevo puis Twilio), `sendWhatsApp`, `verifyTurnstileToken`
  (`src/lib/messaging/server.ts`) ; sans intégration active : aucun envoi, résultat explicite, rien ne casse.
- **E-mails d'authentification** : route `/api/hooks/auth-email` (Send Email Hook de Supabase, signature
  Standard Webhooks vérifiée avec `SEND_EMAIL_HOOK_SECRET`) ; activation dans `supabase/config.toml`.
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
- **Passerelles réglables par le Super Admin** (Console › Paiements en ligne) : PayDunya, CinetPay, FedaPay,
  Flutterwave, Paystack, Stripe, Wave et « Paiement par transfert » (tout autre moyen, validé dans Paiements).
  Plusieurs passerelles peuvent être proposées (le client choisit), mode test ou réel, clés chiffrées côté serveur,
  adresse de notification à copier chez le fournisseur. Aucune modification de code pour changer de fournisseur.
- **Agrégateur personnalisé** (Paiements en ligne › « Ajouter un agrégateur ») : pour un fournisseur inconnu, le Super Admin
  décrit l'API (adresses test/réel, authentification, création et vérification d'un paiement, statuts, notification),
  éventuellement pré-remplie par l'assistant IA à partir de la documentation collée. Clés chiffrées à part ; un **test
  réussi** (paiement d'essai créé puis vérifié, jamais payé) est obligatoire avant de le proposer, et après toute
  modification. HTTPS et adresses publiques uniquement (`PAYMENT_CUSTOM_ALLOW_LOCAL=1` pour les tests locaux).
  Suppression définitive s'il n'a jamais servi, sinon archivage (paiements conservés). Test : `tests/e2e/agregateur-personnalise.mjs`.
- **Variables historiques** (utilisées seulement tant qu'aucune passerelle n'est proposée) : `PAYMENT_PROVIDER`, `PAYDUNYA_MODE`,
  `PAYDUNYA_MASTER_KEY`, `PAYDUNYA_PRIVATE_KEY`, `PAYDUNYA_PUBLIC_KEY`, `PAYDUNYA_TOKEN`, `PAYMENT_WEBHOOK_SECRET`.
- **Tests** : `npm run db:test` (dont `tests/db/billing.test.mjs`), `npm run test:unit` (fournisseurs, secrets),
  `tests/e2e/abonnements.mjs` (parcours navigateur complet, avec `PAYMENT_PROVIDER=simulation`).

## Module 1 — Scolaire

Un seul module commercial, **Module Scolaire (15 000 F CFA / mois, 126 000 F CFA / an)**, avec quatre
niveaux configurables par établissement : **Maternelle, Primaire, Collège, Lycée** (lycée général et/ou
technique). Ce ne sont pas quatre abonnements : l'ancienne formule Maternelle & Primaire (8 000 F) est
désactivée ; les abonnements déjà payés la conservent au même prix.

- **Configuration** : Paramètres › Établissement › « Module scolaire » (permission `settings.manage`), aussi en
  tête de Structure › Niveaux et à l'inscription. Stockée dans `organizations.settings.school`
  (`levels`, `lycee_tracks`), validée en base (`set_school_config`, contrôle des écritures directes), tracée.
- **Adaptation** : niveaux proposés (6e, CM1…), séries / filières du lycée (onglet et entrée de menu
  « Séries et filières » seulement si le lycée est activé), matières par niveau et par série, filtre des classes
  par niveau, choix des matières d'une classe limité à son niveau et sa série.
- **Séries et filières** : configurables (créer, renommer, activer, désactiver) ; séries courantes proposées
  (générales A1, A2, B, C, D ; techniques F1–F4, EAA, G1–G3), jamais imposées.
- **Compatibilité** : colonnes ajoutées uniquement (`levels.school_cycle`, `programs.school_cycle` /
  `track_type`, `subjects.school_cycles` — vide = tous les niveaux), valeurs par défaut déduites du type et des
  niveaux existants ; désactiver un niveau masque ses éléments sans rien supprimer ; centres de formation et
  universités inchangés ; présences et pointage tablette non modifiés.
- **Tests** : `tests/db/module-scolaire.test.mjs` (12), `tests/e2e/module-scolaire.mjs` (51 contrôles).

## Portails parents (formation professionnelle et université)

- **Centre de formation** : Parents et tuteurs, accès portail depuis la fiche du parent, « Espace parent » mobile
  (présences, évaluations, parcours de formation, échéancier et paiements, documents). Démo : `parent.formation@…`.
- **Université** : « Portail parent » **désactivé par défaut** (étudiants souvent majeurs), activable dans
  Paramètres universitaires, avec le choix des informations visibles (résultats et crédits, notes, présences,
  paiements, documents, emploi du temps). Désactivé : la base ne renvoie aucune donnée d'étudiant à un compte
  parent (`app.my_portal_student_ids`) ; section masquée : onglet retiré et adresse directe refusée. Les
  universités ayant déjà des parents reliés gardent leur portail actif. Menus : Parents et tuteurs, Espace parent,
  lien du portail parent. Démo : `parent.universite@…`. Portails étudiant et enseignant inchangés.
- **Tests** : `tests/db/portail-parent-universite.test.mjs` (4), `tests/e2e/portails-parents.mjs` (19 contrôles).

## NeoScool Console (Super Admin installable)

La console `/plateforme` s'installe comme une application distincte, avec :
- sa propre icône et sa propre fenêtre ;
- le nom « NeoScool Console » ;
- des raccourcis : Établissements, Abonnements, Intégrations, Sécurité.

Pour l'installer, ouvrir la console dans Chrome ou Edge sur l'ordinateur, puis cliquer sur « Installer NeoScool Console » (en-tête de la console ou menu du navigateur). La mise à jour est automatique, car l'application est le site lui-même. Aucune donnée n'est stockée sur l'ordinateur : les pages ne sont jamais mises en cache.

Le manifeste propre est servi par `src/app/console.webmanifest/route.ts` (`id` et portée `/plateforme`).

Une alerte s'affiche tant que la double authentification n'est pas activée. Le centre de sécurité permet de la rendre obligatoire.

## Pays, devises et moteur académique (P7)

- **Pays et devises**. Ils sont gérés dans la console (`/plateforme/pays`) et enregistrés en base (`countries`, `currencies`).
  - Chaque pays définit : ISO, indicatif, devise principale et devises acceptées, langues, fuseau, format de téléphone et de date, barème, périodes, libellé de l'identifiant national.
  - Un nouvel établissement hérite de la devise, du fuseau et de la langue de son pays.
  - L'inscription lit la liste en base : ajouter un pays ne demande aucune modification du code.
- **Moteur académique**. Migration : `20261007003000_moteur_academique.sql`.
  - **Règles versionnées** dans cet ordre : modèle de la plateforme (`/plateforme/regles`), puis modèle du pays, puis règles de l'établissement (`/parametres/regles-academiques`).
  - **Cycle de vie** : brouillon, puis publication. Republier une ancienne version revient en arrière (action auditée).
  - **Moyenne annuelle** : pondération des périodes, ou formule sûre validée et évaluée en base (T1…T8, `+ - * / ( )`, `min`, `max`, `round`, `abs`). Tout autre élément est refusé.
  - **Décisions et mentions** par seuils.
  - **Essai en direct**, et **simulateur** sur une classe réelle (rien n'est enregistré).
  - **Résultats annuels** (`/resultats-annuels`) :
    - calcul, puis rang ;
    - décision du conseil, avec motif obligatoire si elle diffère de la proposition ;
    - validation, qui fige les résultats avec la version et une copie des règles (résultats reproductibles).
