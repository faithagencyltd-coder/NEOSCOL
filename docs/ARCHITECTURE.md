# NéoScol — Document de conception

> « Plus qu'un logiciel, une vision pour l'éducation. »

Ce document est la référence technique de NéoScol. Il est écrit **avant** le
développement des modules métier et doit être tenu à jour à chaque décision
structurante. Les décisions sont numérotées (`D-xx`) pour pouvoir y faire
référence dans le code et les revues.

Sommaire

1. [Analyse du produit](#1-analyse-du-produit)
2. [Architecture générale](#2-architecture-générale)
3. [Architecture frontend](#3-architecture-frontend)
4. [Architecture backend](#4-architecture-backend)
5. [Architecture multi-tenant](#5-architecture-multi-tenant)
6. [Base de données](#6-base-de-données)
7. [Authentification](#7-authentification)
8. [Rôles et permissions](#8-rôles-et-permissions)
9. [Modules](#9-modules)
10. [Structure des dossiers](#10-structure-des-dossiers)
11. [Flux utilisateurs](#11-flux-utilisateurs)
12. [Sécurité](#12-sécurité)
13. [Stockage des fichiers](#13-stockage-des-fichiers)
14. [Notifications](#14-notifications)
15. [Génération de documents](#15-génération-de-documents)
16. [QR Code et vérification](#16-qr-code-et-vérification)
17. [PWA et mobile](#17-pwa-et-mobile)
18. [Recherche et centre de commande](#18-recherche-et-centre-de-commande)
19. [Statistiques et rapports](#19-statistiques-et-rapports)
20. [Audit, sauvegarde et traçabilité](#20-audit-sauvegarde-et-traçabilité)
21. [Assistant intelligent](#21-assistant-intelligent)
22. [Qualité, tests et vérifications](#22-qualité-tests-et-vérifications)
23. [Ordre de développement](#23-ordre-de-développement)
24. [Hypothèses et questions ouvertes](#24-hypothèses-et-questions-ouvertes)

---

## 1. Analyse du produit

### 1.1 Vision

NéoScol est un **SaaS multi-établissements** qui centralise la gestion
administrative, pédagogique, financière et documentaire d'un établissement
d'enseignement. Le même produit doit servir des structures très différentes ;
la conception repose donc sur un **noyau commun configurable** plutôt que sur
des variantes codées en dur.

### 1.2 Typologie des établissements et conséquences

| Type | Particularités | Conséquences sur le modèle |
|---|---|---|
| Primaire | Classes uniques, un maître par classe, parents très présents | `classes` + professeur principal, portail parent prioritaire, notes souvent sur 10 |
| Collège / lycée | Matières + coefficients, trimestres, bulletins, classement | `class_subjects` avec coefficient, périodes typées, classement activable |
| Université / institut | Filières, semestres, modules/UE, crédits, sessions d'examen | `programs` (filières), `subjects.kind = module`, périodes `semester`/`session`, crédits |
| Formation professionnelle / technique | Sessions datées, formateurs, modules, certificats, apprenants adultes | `classes.kind = training_session` avec dates, certificats de formation, portail parent optionnel |
| École privée | Finances centrales (scolarité, échéanciers, relances) | Module finance complet, reliquats, reçus |
| Groupe / réseau | Plusieurs établissements, consolidation | `organizations.parent_id`, utilisateurs multi-établissements, rapports consolidés |

**Décision D-01** — Un seul vocabulaire de données, des libellés configurables :
une « classe » en base est une *cohorte* (`classes`) qui peut être une classe de
CM2, un groupe de L1 Informatique ou une session de formation « Électricité
bâtiment — janvier 2027 ». Le libellé affiché dépend du type d'établissement.

### 1.3 Acteurs

Super administrateur (plateforme), administrateur d'établissement, direction,
secrétariat, comptabilité, enseignant/formateur, responsable formation,
parent/tuteur, élève/apprenant. Un même compte peut cumuler plusieurs rôles et
appartenir à plusieurs établissements (ex. enseignant vacataire, parent d'élèves
dans deux écoles d'un même groupe).

### 1.4 Exigences non fonctionnelles clés

- **Isolation stricte des données** entre établissements (exigence n°1).
- **Moindre privilège** : chaque rôle ne voit que ce dont il a besoin, y compris
  à l'intérieur d'un établissement (parent ↔ ses enfants, enseignant ↔ ses classes).
- **Traçabilité** : toute action sensible est journalisée, le journal est
  inaltérable.
- **Documents authentiques** : tout document officiel est vérifiable par QR Code.
- **Usage mobile réel** : parents et enseignants utiliseront majoritairement un
  téléphone, souvent avec une connexion instable.
- **Évolutivité** : nouveaux modules, nouveaux canaux de notification,
  assistant IA, sans refonte.

---

## 2. Architecture générale

```
┌──────────────────────────── Navigateur / PWA ─────────────────────────────┐
│  Next.js (React Server Components + Client Components)                     │
│  Tailwind CSS · design system NéoScol · palette de commandes · SW (PWA)    │
└───────────────▲───────────────────────────────────────────────▲────────────┘
                │ HTML/RSC, Server Actions                        │ Realtime (WS)
┌───────────────┴──────────────── Serveur Next.js ───────────────┴───────────┐
│  proxy.ts (rafraîchissement session, redirections)                         │
│  Server Components  → lectures (client Supabase avec JWT utilisateur)      │
│  Server Actions     → écritures (validation Zod + permission + audit)      │
│  Route Handlers     → PDF, vérification publique, webhooks, cron           │
│  Client admin (service role) : uniquement invitations / tâches système     │
└───────────────▲────────────────────────────────────────────────────────────┘
                │ PostgREST / RPC (JWT utilisateur)
┌───────────────┴──────────────────── Supabase ──────────────────────────────┐
│  Auth (email+mot de passe, téléphone+OTP)                                  │
│  PostgreSQL 15+ : schéma public (tables + RLS), schéma app (fonctions      │
│  de sécurité), triggers d'audit, compteurs, vues financières, RPC          │
│  Storage (buckets privés, chemins préfixés par établissement)              │
│  Realtime (notifications in-app)                                           │
│  Edge Functions / cron (envoi email, SMS, WhatsApp, push)                  │
└────────────────────────────────────────────────────────────────────────────┘
```

**Décision D-02 — Stack.** Next.js 16 (App Router), React 19, TypeScript strict,
Tailwind CSS 4, Supabase (PostgreSQL, Auth, Storage, Realtime). Raisons :
un seul langage de bout en bout, RLS PostgreSQL comme dernière ligne de défense,
hébergement managé, montée en charge simple (Vercel/Node + Supabase).

**Décision D-03 — La base de données est la frontière de sécurité.** Toute
requête applicative passe par le client Supabase **authentifié avec le JWT de
l'utilisateur** : la RLS s'applique donc toujours. La clé `service_role` n'est
utilisée que dans un module serveur isolé (`src/lib/supabase/admin.ts`, marqué
`server-only`) pour des opérations qui ne peuvent pas être faites autrement
(invitation d'utilisateurs, tâches planifiées), **après** un contrôle de
permission explicite.

---

## 3. Architecture frontend

- **App Router** avec groupes de routes :
  - `(auth)` : connexion, mot de passe oublié, réinitialisation — mise en page
    centrée, sans navigation.
  - `(app)` : espace de gestion (direction, secrétariat, comptabilité,
    enseignants) — sidebar + header + palette de commandes.
  - `portail/parent`, `portail/eleve` : portails mobiles d'abord (navigation
    basse sur mobile).
  - `verifier/[code]` : page publique de vérification de document.
- **Server Components par défaut** : les pages lisent les données côté serveur
  (pas d'API REST maison à maintenir, pas de fuite de requêtes vers le client).
- **Client Components** uniquement pour l'interactivité (formulaires, filtres,
  palette de commandes, graphiques).
- **Mutations** par Server Actions typées retournant un `ActionResult`
  (`{ ok: true, data } | { ok: false, error, fieldErrors }`), consommées avec
  `useActionState`.
- **URL = état** pour la recherche, les filtres, le tri et la pagination
  (`?q=&classe=&page=`) : partageable, rechargeable, compatible SSR.
- **Design system** dans `src/components/ui` (boutons, champs, tableaux,
  modales, badges, états vides/chargement/erreur…) construit sur des
  primitives accessibles (Radix) et des variantes typées (`cva`).
- **Routes en français** (`/eleves`, `/inscriptions`, `/finances`) : le produit
  cible des utilisateurs francophones, les URL sont visibles et partagées.
- **Internationalisation** (D-04) : interface en français pour la v1, dates et
  montants formatés via `Intl` avec la locale et la devise de l'établissement.
  Les libellés restent regroupés par module pour permettre l'ajout d'une
  seconde langue (next-intl) sans réécriture.

---

## 4. Architecture backend

Couches (du plus proche de l'UI au plus proche des données) :

| Couche | Emplacement | Rôle |
|---|---|---|
| Pages / layouts | `src/app/**` | Composition, lecture des `searchParams`, appel aux requêtes |
| Server Actions | `src/features/<module>/actions.ts` | Point d'entrée des écritures : authentification → permission → validation Zod → appel data → audit applicatif → revalidation |
| Requêtes | `src/features/<module>/queries.ts` | Lectures typées via Supabase (RLS active) |
| Schémas | `src/features/<module>/schemas.ts` | Validation Zod partagée client/serveur |
| Services transverses | `src/lib/**` | Session, tenant, permissions, audit, stockage, PDF, QR, notifications |
| Base | `supabase/migrations/**` | Tables, contraintes, RLS, triggers, RPC, vues |

**Décision D-05 — Logique critique en base quand elle garantit un invariant.**
Numérotation (matricules, reçus, factures), totaux de facture, reliquats,
verrouillage des périodes de notes, audit et isolation sont implémentés en SQL
(triggers, contraintes, fonctions). Le reste de la logique métier vit dans les
Server Actions en TypeScript.

**RPC** (fonctions PostgreSQL exposées) pour : recherche globale, statistiques
du tableau de bord, vérification publique de documents, bascule de
l'établissement actif, provisionnement d'un établissement.

---

## 5. Architecture multi-tenant

**Décision D-06 — Base partagée, schéma partagé, `organization_id` partout.**
Chaque table métier porte `organization_id uuid not null` avec clé étrangère vers
`organizations` et un index. C'est le modèle le plus simple à opérer (une seule
migration pour tous les clients) et, combiné à la RLS, il offre une isolation
forte.

Garanties d'isolation (défense en profondeur) :

1. **RLS activée sur toutes les tables** du schéma `public`, aucune politique
   « ouverte ». Une table sans politique est inaccessible.
2. Les politiques comparent `organization_id` à la liste des établissements où
   l'utilisateur a une **adhésion active** (`memberships.status = 'active'`) et
   la **permission** requise.
3. **Cohérence inter-tables** : les clés étrangères composites
   `(organization_id, id)` empêchent de rattacher un élève de l'établissement A à
   une classe de l'établissement B, même avec des droits d'écriture.
4. Le code applicatif filtre en plus explicitement par l'établissement actif
   (lisibilité + performance), mais **n'est jamais la seule barrière**.
5. Tests automatisés d'isolation (voir §22) exécutés contre une vraie base
   PostgreSQL.

**Établissement actif.** Un utilisateur peut appartenir à plusieurs
établissements. L'établissement actif est mémorisé dans un cookie
`neoscol_org` ; le serveur vérifie à chaque requête que l'utilisateur en est
bien membre actif (sinon repli sur la première adhésion valide). Le cookie
n'accorde aucun droit : il ne sert qu'à choisir le contexte d'affichage.

**Réseaux / groupes scolaires.** `organizations.parent_id` permet de rattacher
des établissements à un groupe. Les données restent cloisonnées par
établissement ; la consolidation se fait par des rapports qui agrègent les
établissements sur lesquels l'utilisateur possède la permission `reports.read`.

**Super administrateur (D-07).** Le super administrateur gère la plateforme
(établissements, statut, administrateurs d'établissement) mais **n'a pas d'accès
implicite aux données personnelles** des élèves. Pour un support, il doit être
ajouté comme membre de l'établissement — action tracée dans l'audit. Ce choix
limite la surface d'exposition des données (conformité type RGPD / lois
africaines de protection des données personnelles).

---

## 6. Base de données

Le schéma complet est défini dans `supabase/migrations/`. Principes :

- Clés primaires `uuid` (`gen_random_uuid()`), sauf journal d'audit (`bigint`
  identité, ordre d'insertion).
- `created_at`, `updated_at` (trigger), `created_by` sur les tables métier.
- **Pas de suppression physique** des dossiers : `archived_at` (élèves,
  personnel, classes) ; les opérations financières sont **annulées** avec motif,
  jamais supprimées.
- Montants en `numeric(14,2)` ; devise portée par l'établissement.
- Énumérations PostgreSQL pour les statuts stables, `text` + `check` pour les
  valeurs susceptibles d'évoluer.
- `jsonb` uniquement pour les données réellement variables : champs de
  formulaires personnalisés, paramètres, mise en page des modèles de documents,
  instantanés de documents émis.
- Index sur toutes les clés étrangères, index trigram pour la recherche.

### 6.1 Domaines et tables

| Domaine | Tables |
|---|---|
| Plateforme | `organizations`, `organization_branding`, `platform_admins`, `profiles`, `organization_counters` |
| Accès | `permissions`, `roles`, `role_permissions`, `memberships`, `membership_roles` |
| Structure académique | `academic_years`, `academic_periods`, `levels`, `programs`, `subjects`, `rooms`, `classes`, `class_subjects` |
| Personnes | `staff_members`, `students`, `guardians`, `student_guardians`, `student_medical_records`, `student_previous_schools`, `conduct_records` |
| Inscriptions | `form_definitions`, `enrollments` |
| Pédagogie | `assessments`, `grades`, `report_cards`, `attendance_sessions`, `attendance_records`, `timetable_slots` |
| Finance | `fee_types`, `fee_rates`, `invoices`, `invoice_lines`, `installments`, `payments` + vues `invoice_balances`, `student_balances` |
| Documents | `document_templates`, `issued_documents`, `file_objects` |
| Communication | `announcements`, `message_threads`, `thread_participants`, `messages`, `notifications`, `notification_deliveries`, `notification_preferences` |
| Audit | `audit_logs` |

### 6.2 Relations principales

```
organizations 1─n memberships n─1 profiles(auth.users)
memberships  n─n roles (membership_roles) ; roles n─n permissions
academic_years 1─n academic_periods ; academic_years 1─n classes
classes n─1 levels / programs ; classes 1─n class_subjects n─1 subjects
class_subjects n─1 staff_members (enseignant)
students n─n guardians (student_guardians)
students 1─n enrollments n─1 classes / academic_years
class_subjects 1─n assessments 1─n grades n─1 students
classes 1─n attendance_sessions 1─n attendance_records n─1 students
students 1─n invoices 1─n invoice_lines ; invoices 1─n installments / payments
document_templates 1─n issued_documents n─1 students
```

### 6.3 Invariants garantis en base

| Invariant | Mécanisme |
|---|---|
| Matricule unique, jamais modifié | `unique(matricule)`, génération par trigger via compteur atomique, trigger bloquant toute modification |
| Numéros de reçu / facture / inscription sans doublon | `organization_counters` + `insert … on conflict do update … returning` (verrou de ligne) |
| Une seule année scolaire courante | index unique partiel |
| Pas de double inscription active dans la même classe | index unique partiel sur `(student_id, class_id)` hors statuts rejetée/annulée |
| Note ≤ barème, période non verrouillée | trigger sur `grades` |
| Total facture = somme des lignes | trigger de recalcul |
| Paiement ≤ reliquat | trigger sur `payments` |
| Pas de conflit d'emploi du temps (classe, enseignant, salle) | contraintes d'exclusion GiST sur plages horaires |
| Journal d'audit inaltérable | aucun droit `update/delete`, écriture uniquement par fonctions `security definer` |
| Cohérence d'établissement entre tables liées | clés étrangères composites `(organization_id, id)` |

---

## 7. Authentification

- **Supabase Auth** ; sessions en cookies HTTP-only gérées par `@supabase/ssr`,
  rafraîchies par `src/proxy.ts`.
- **Méthodes** :
  - personnel : email + mot de passe ;
  - parents / élèves : **téléphone + code OTP (SMS)** ou email + mot de passe.
    L'OTP nécessite un fournisseur SMS configuré dans Supabase (Twilio,
    MessageBird, Vonage… ou hook SMS personnalisé pour un agrégateur local).
- **Pas d'inscription publique** (D-08) : les comptes sont créés par
  l'établissement (invitation). Un parent ou un élève reçoit une invitation
  lorsque son dossier est validé. `shouldCreateUser: false` sur l'OTP.
- **Récupération / changement de mot de passe** : lien email → route
  `/auth/confirm` (échange du jeton) → `/reinitialiser-mot-de-passe`.
- **Protection des routes** : `proxy.ts` redirige les visiteurs non connectés ;
  chaque layout protégé revérifie la session côté serveur (`getUser()`, jamais
  `getSession()` seul) et chaque Server Action revérifie les permissions.
- **Comptes désactivés** : `profiles.is_active = false` (niveau plateforme) ou
  `memberships.status = 'suspended'` (niveau établissement). Les fonctions RLS
  ignorent les adhésions suspendues ; l'utilisateur est déconnecté et informé.
- **Journalisation** : connexion réussie, échec de connexion (email haché),
  déconnexion, réinitialisation de mot de passe, bascule d'établissement →
  `audit_logs`.

---

## 8. Rôles et permissions

**Décision D-09 — RBAC granulaire + portée relationnelle.**

1. **Permissions** : catalogue fixe (`permissions.code`), défini par le code,
   ex. `students.read`, `finance.payments.create`, `grades.enter`.
2. **Rôles** : propres à chaque établissement, créés à partir de **modèles**
   (rôles système) lors du provisionnement, puis modifiables par
   l'administrateur (ajout/retrait de permissions, création de rôles).
3. **Adhésions** : un utilisateur a une adhésion par établissement et un ou
   plusieurs rôles.
4. **Portée relationnelle** en plus des permissions :
   - enseignant → uniquement les classes/matières où il est affecté
     (`class_subjects.teacher_id`, `classes.head_teacher_id`) ;
   - parent → uniquement les élèves liés via `student_guardians`
     (avec `portal_access = true`) ;
   - élève → uniquement son propre dossier (`students.user_id`).

Modèles de rôles fournis :

| Rôle | Périmètre par défaut |
|---|---|
| Administrateur établissement | Toutes les permissions de l'établissement |
| Direction | Supervision complète, validation des inscriptions, publication des bulletins, audit ; pas la gestion des rôles |
| Secrétaire | Élèves, parents, inscriptions (sans validation), documents administratifs, présences en lecture |
| Comptable | Finance complète, lecture élèves/parents, reçus, rapports financiers ; aucun accès aux notes |
| Enseignant / Formateur | Saisie notes et présences **de ses classes**, emploi du temps, messages |
| Responsable formation | Formations, sessions, modules, inscriptions, certificats de formation |
| Parent | Portail parent (portée : ses enfants) |
| Élève | Portail élève (portée : lui-même) |

Implémentation des contrôles : `src/lib/auth/permissions.ts` (serveur) pour
l'UI et les actions ; `app.permitted_org_ids(code)` et consorts pour la RLS.
La liste complète est dans `supabase/migrations/*_rbac.sql` et
`src/config/permissions.ts` (tenue synchronisée par un test).

**Performance RLS** : les politiques utilisent des fonctions renvoyant des
tableaux (`organization_id = any ((select app.permitted_org_ids('x')))`),
évaluées **une fois par requête** (InitPlan) et non une fois par ligne.

---

## 9. Modules

| Module | Contenu | Permissions principales |
|---|---|---|
| Tableau de bord | Indicateurs par rôle, graphiques, alertes, activité récente | selon données visibles (RLS) |
| Élèves | CRUD, archivage, recherche, photo, dossier 360°, matricule | `students.*` |
| Parents / tuteurs | Fiches, liens élève, accès portail | `guardians.*` |
| Personnel | Fiches, enseignants, comptes | `staff.*`, `users.manage` |
| Structure | Années, périodes, niveaux, filières, formations, matières, classes, salles | `academic.manage` |
| Inscriptions | Formulaire personnalisable, statuts, réinscription, pièces | `enrollments.*` |
| Formulaires | Constructeur de champs | `forms.manage` |
| Notes & bulletins | Évaluations, coefficients, moyennes, rangs, appréciations, bulletins | `grades.*`, `report_cards.*` |
| Présences | Appel, retards, justificatifs, statistiques | `attendance.*` |
| Emploi du temps | Créneaux, contrôle des conflits | `timetable.*` |
| Finance | Tarifs, factures, échéanciers, paiements, reçus, remises, impayés | `finance.*` |
| Document Studio | Modèles, génération PDF, émission, révocation | `documents.*` |
| Communication | Annonces, messagerie, notifications | `communication.*` |
| Rapports | Effectifs, finances, absences, résultats, exports CSV/PDF | `reports.*` |
| Paramètres | Établissement, identité visuelle, rôles, utilisateurs, fonctionnalités | `settings.manage`, `roles.manage` |
| Audit | Journal consultable et filtrable | `audit.read` |
| Portails | Parent, élève, enseignant | portée relationnelle |

**Fonctionnalités activables** (`organizations.settings.features`) :
informations médicales, classement, sanctions/récompenses, portail parent,
portail élève, messagerie. Une fonctionnalité désactivée disparaît de l'UI et
ses actions serveur la refusent.

---

## 10. Structure des dossiers

```
neoscol/
├── docs/                       # Conception, base de données, permissions, feuille de route
├── supabase/
│   ├── config.toml             # Configuration Supabase CLI (local)
│   ├── migrations/             # Migrations SQL ordonnées (source de vérité du schéma)
│   ├── seed.sql                # Données de DÉMONSTRATION (établissement marqué is_demo)
│   └── tests/                  # Tests SQL : isolation, portées, invariants
├── scripts/db/                 # Harnais de test PostgreSQL local, génération des types
├── public/                     # Icônes, manifest PWA
└── src/
    ├── app/
    │   ├── (auth)/             # connexion, mot-de-passe-oublie, reinitialiser-mot-de-passe
    │   ├── (app)/              # espace de gestion (layout avec sidebar)
    │   ├── portail/            # portails parent et élève
    │   ├── verifier/[code]/    # vérification publique
    │   └── auth/               # routes techniques (confirm, callback, signout)
    ├── components/
    │   ├── ui/                 # design system (primitives)
    │   ├── layout/             # sidebar, header, navigation mobile, palette
    │   └── shared/             # composants métier transverses (états, tableaux de données)
    ├── features/<module>/      # actions.ts, queries.ts, schemas.ts, components/
    ├── lib/
    │   ├── supabase/           # clients serveur, navigateur, proxy, admin
    │   ├── auth/               # session, permissions, gardes
    │   ├── audit/              # journalisation applicative
    │   └── utils/              # formatage, classes CSS, dates, montants
    ├── config/                 # navigation, permissions, site
    ├── types/                  # types générés de la base + types partagés
    └── proxy.ts
```

Règles : un fichier = une responsabilité ; composants > 250 lignes découpés ;
aucun accès Supabase depuis un composant client sauf Realtime et
authentification ; imports `server-only` sur les modules serveur.

---

## 11. Flux utilisateurs

### 11.1 Super administrateur
1. Crée un établissement (nom, code, type, devise, fuseau).
2. Provisionnement automatique : rôles à partir des modèles, compteurs,
   modèles de documents par défaut, formulaire d'inscription par défaut.
3. Invite l'administrateur de l'établissement.
4. Suit les établissements (statut, activité) ; peut suspendre un établissement.

### 11.2 Administrateur d'établissement
1. Première connexion → assistant de configuration : identité visuelle, année
   scolaire, périodes, niveaux, filières/formations, matières, classes, tarifs.
2. Invite le personnel et attribue les rôles.
3. Personnalise formulaires et modèles de documents.
4. Suit tableau de bord, audit, paramètres.

### 11.3 Secrétaire
1. Crée une inscription (nouvel élève ou réinscription) → formulaire
   personnalisé → pièces justificatives → statut « en attente ».
2. La direction valide → matricule attribué (si nouvel élève), élève affecté à
   la classe, facture des frais générée, invitation parent envoyée.
3. Délivre certificats/attestations (Document Studio) avec QR Code.

### 11.4 Comptable
1. Consulte les impayés (filtres classe/échéance).
2. Enregistre un paiement → reliquat recalculé → reçu numéroté PDF → notification
   au parent.
3. Annule un paiement erroné (motif obligatoire, audit).
4. Rapports : encaissements par période, par mode, par classe ; exports.

### 11.5 Enseignant / formateur
1. Voit ses classes et matières du jour (emploi du temps).
2. Fait l'appel (présent/absent/retard) sur mobile → notifications parents.
3. Crée une évaluation, saisit les notes en grille → publie → notifications.
4. Rédige les appréciations pour les bulletins.

### 11.6 Parent
1. Reçoit un SMS d'invitation → connexion téléphone + OTP.
2. Sélectionne un enfant → notes publiées, absences, bulletins, paiements et
   reliquat, documents, annonces.
3. Reçoit les notifications (absence, note, paiement, échéance).

### 11.7 Élève / apprenant
1. Connexion → profil, matricule, classe, emploi du temps, notes publiées,
   bulletins, absences, documents, annonces.

### 11.8 Direction
1. Tableau de bord global, validation des inscriptions, publication des
   bulletins, verrouillage des périodes, annonces, rapports.

---

## 12. Sécurité

| Menace | Mesure |
|---|---|
| Accès inter-établissements | RLS + FK composites + tests d'isolation |
| Élévation de privilège | Permissions vérifiées en base (RLS) et dans chaque action ; `roles.manage` requis pour modifier un rôle ; un utilisateur ne peut pas modifier ses propres rôles |
| Manipulation côté client | Validation Zod serveur ; aucune donnée de confiance venant du client (org, auteur, montants calculés) |
| Clé service role | Module `server-only`, jamais exposée, usage minimal et audité |
| Fichiers | Buckets privés, chemins préfixés par établissement, URL signées courtes, contrôle MIME/taille/signature binaire |
| Vérification publique | RPC ne renvoyant que les champs autorisés, codes aléatoires 128 bits, identité masquée |
| Sessions | Cookies HTTP-only, `SameSite=Lax`, `Secure` ; `getUser()` côté serveur |
| CSRF | Server Actions (contrôle d'origine intégré à Next.js) |
| En-têtes | CSP, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` |
| Force brute | Limitation Supabase Auth + journalisation des échecs |
| Données sensibles | Informations médicales dans une table séparée avec permission dédiée ; module désactivable |
| Injection SQL | Requêtes paramétrées (PostgREST) ; `search_path` figé dans les fonctions `security definer` |

---

## 13. Stockage des fichiers

**Décision D-10** — Supabase Storage, **buckets privés uniquement** :

| Bucket | Contenu | Chemin |
|---|---|---|
| `org-assets` | logo, cachet, signature | `{org_id}/branding/{fichier}` |
| `student-files` | photos, pièces d'inscription, justificatifs | `{org_id}/students/{student_id}/{uuid}.{ext}` |
| `generated-documents` | PDF émis (reçus, attestations, bulletins) | `{org_id}/documents/{document_id}.pdf` |

- Politiques Storage : le premier segment du chemin doit être un établissement
  où l'utilisateur possède la permission du domaine concerné.
- Chaque fichier est référencé dans `file_objects` (propriétaire, catégorie,
  type MIME, taille, auteur) → les droits de lecture suivent ceux de l'entité.
- Téléchargement via route serveur qui vérifie l'accès puis délivre une URL
  signée de 60 s (indispensable pour les parents/élèves).
- Upload : liste blanche MIME, taille maximale (5 Mo photos, 10 Mo documents),
  vérification de la signature binaire côté serveur, nom de fichier régénéré.

---

## 14. Notifications

**Décision D-11 — Boîte d'envoi (outbox) en base.**

1. Un événement métier (paiement, note publiée, absence, bulletin, document,
   annonce, échéance, inscription validée) crée une ligne `notifications` par
   destinataire (trigger SQL ou Server Action).
2. Selon `notification_preferences`, des lignes `notification_deliveries`
   (canal `email`, `sms`, `whatsapp`, `push`) sont créées en statut `pending`.
3. Un worker (cron Supabase / route protégée) envoie via des **adaptateurs**
   (`EmailProvider`, `SmsProvider`, `WhatsAppProvider`, `PushProvider`) avec
   nouvelles tentatives et journalisation des erreurs.
4. In-app : Supabase Realtime sur `notifications` (RLS : chacun ne reçoit que
   les siennes) → badge dans le header, centre de notifications.

Ajouter un canal = écrire un adaptateur, sans toucher aux modules métier.

---

## 15. Génération de documents

**Décision D-12 — Modèles déclaratifs + rendu PDF serveur.**

- `document_templates.layout` (JSON) décrit : format, orientation, blocs
  (en-tête, titre, paragraphes avec variables `{{eleve.nom}}`, tableau, zone
  signature/cachet, QR Code), couleurs.
- Rendu PDF côté serveur avec `@react-pdf/renderer` (pur JavaScript,
  compatible hébergement serverless), à partir des **données réelles** et de
  l'identité visuelle de l'établissement (`organization_branding`).
- Chaque émission crée un `issued_documents` : numéro, code de vérification,
  **instantané** des données (le document reste reproductible à l'identique même
  si le dossier évolue), empreinte SHA-256 du PDF, statut `valid/revoked`.
- Documents prévus : certificat de scolarité, attestation, certificat de
  formation, bulletin, reçu, carte scolaire, fiche d'inscription, fiche
  d'engagement, contrat, convocation, relevé de notes, document personnalisé.
- Impression : PDF A4 (ou format carte CR80 pour la carte scolaire).

---

## 16. QR Code et vérification

- Le QR Code encode uniquement l'URL `https://<domaine>/verifier/<code>` ;
  `<code>` est aléatoire (≈128 bits, base32), sans signification.
- La page publique appelle la RPC `verify_document(code)` (`security definer`,
  exécutable par `anon`) qui renvoie **uniquement** : statut
  (valide / révoqué / introuvable), type de document, numéro, date d'émission,
  établissement, titulaire **masqué** (ex. « K. YAO »), date d'expiration.
- Aucune autre donnée personnelle n'est exposée ; les tentatives sont limitées
  en débit.
- Carte scolaire : QR vers la même page (statut de l'élève pour l'année).

---

## 17. PWA et mobile

- `app/manifest.ts` (nom, icônes, couleurs, `display: standalone`), service
  worker : cache des ressources statiques et page hors-ligne ; les données
  personnelles ne sont **pas** mises en cache hors-ligne (appareils partagés).
- Conception **mobile d'abord** pour les portails et l'appel en classe :
  navigation basse, cibles tactiles ≥ 44 px, formulaires en une colonne.
- **Tableaux** : sur mobile, chaque ligne devient une carte (colonnes
  prioritaires visibles, détail au toucher) ; les grilles de saisie de notes
  passent en saisie élève par élève.
- Notifications push web (VAPID) via l'adaptateur `PushProvider`.

---

## 18. Recherche et centre de commande

- RPC `global_search(org, q)` en `security invoker` : **la RLS s'applique**,
  un utilisateur ne trouve que ce qu'il a le droit de voir.
- Index trigram (`pg_trgm`) sur une colonne de recherche normalisée
  (sans accents) : élèves (nom, matricule), parents (nom, téléphone),
  personnel, classes, formations, inscriptions (référence), factures et
  paiements (numéro), documents (numéro).
- Palette de commandes (`Ctrl/⌘ + K`) : navigation vers les modules
  autorisés, actions rapides, résultats de recherche groupés par type.

---

## 19. Statistiques et rapports

- Statistiques calculées **à partir des données réelles** par des RPC en
  `security invoker` (RLS respectée) : `dashboard_overview(org)`.
- Tableau de bord par rôle : effectifs, inscriptions en attente,
  réinscriptions, classes, enseignants, encaissements du mois, impayés,
  absences du jour/semaine, moyennes par classe, activité récente, alertes
  (échéances dépassées, périodes non verrouillées, inscriptions en attente).
- Rapports : effectifs, inscriptions, finances, impayés, absences, résultats,
  formations, par classe, par établissement (consolidé pour un réseau).
- Exports CSV (et PDF pour les rapports imprimables).
- Si le volume l'exige : vues matérialisées rafraîchies périodiquement.

---

## 20. Audit, sauvegarde et traçabilité

- `audit_logs` : utilisateur, date, action, type et identifiant de l'objet,
  établissement, différences avant/après (`jsonb`), métadonnées (IP, agent).
- Alimenté par un **trigger générique** sur les tables sensibles (élèves,
  parents, inscriptions, notes, factures, paiements, rôles, adhésions,
  documents, paramètres, périodes) + événements applicatifs (connexion,
  génération de document, export).
- Aucun `update`/`delete` possible, même pour un administrateur d'établissement.
- Sauvegardes : sauvegardes quotidiennes et PITR Supabase (plan payant),
  export logique hebdomadaire chiffré hors plateforme ; procédure de
  restauration testée (documentée dans `docs/OPERATIONS.md` à la phase 15).

---

## 21. Assistant intelligent

Architecture prévue (phase 13) :

- Route serveur `/api/assistant` ; le modèle de langage (fournisseur
  configurable, ex. API Claude) reçoit des **outils** (recherche d'élève,
  statistiques, impayés…) qui appellent les **mêmes fonctions de requête** que
  l'application, avec le **client Supabase de l'utilisateur** : l'assistant
  hérite exactement des droits (RLS) de l'utilisateur et ne peut rien voir de
  plus.
- Jamais de clé `service_role` ni de SQL libre généré par le modèle.
- Journalisation des questions et des outils appelés dans l'audit.
- Désactivable par établissement.

---

## 22. Qualité, tests et vérifications

- TypeScript `strict` + `noUncheckedIndexedAccess`, ESLint, build Next.js.
- **Tests base de données** (`npm run db:test`) : applique toutes les migrations
  et le seed sur un PostgreSQL local avec un émulateur minimal du schéma `auth`
  de Supabase, puis vérifie : isolation entre établissements, portée parent,
  portée enseignant, comptable sans accès aux notes, unicité et immuabilité du
  matricule, numérotation, reliquats, verrouillage des périodes, conflits
  d'emploi du temps, inaltérabilité de l'audit, vérification publique.
- Tests unitaires (Vitest) pour la logique pure (calculs de moyennes,
  formatage, validation).
- Tests de bout en bout (Playwright) en phase 16 : parcours par rôle,
  captures desktop / tablette / mobile.
- Types TypeScript de la base générés depuis le schéma (`npm run db:types`).

---

## 23. Ordre de développement

| Phase | Contenu | Critère de sortie |
|---|---|---|
| 0 | Analyse et conception (ce document) | Document validé |
| 1 | Structure Next.js, outillage, conventions | Build, lint, typecheck verts |
| 2 | Schéma PostgreSQL, RLS, seed de démonstration | Tests SQL verts |
| 3 | Authentification, rôles, permissions, établissement actif | Connexion / OTP / reset, routes protégées |
| 4 | Design system et mise en page | Composants, responsive |
| 5 | Tableau de bord | Indicateurs réels par rôle |
| 6 | Scolarité : élèves, parents, classes, inscriptions, matricules, formulaires | CRUD complet + dossier 360° |
| 7 | Pédagogie : notes, présences, bulletins, emploi du temps | Saisie enseignant, calculs, conflits |
| 8 | Finance : tarifs, factures, paiements, reçus, reliquats | Reçu PDF réel |
| 9 | Document Studio, PDF, QR, carte scolaire | Vérification publique |
| 10 | Portails parent, élève, enseignant | Parcours mobiles |
| 11 | Communication : annonces, messages, notifications | Realtime + outbox |
| 12 | Rapports et exports | Exports CSV/PDF |
| 13 | Assistant intelligent | Outils respectant la RLS |
| 14 | PWA | Installable, hors-ligne minimal |
| 15 | Audit de sécurité et optimisation | Revue RLS, index, en-têtes |
| 16 | Tests fonctionnels et techniques | E2E par rôle |

Chaque phase suit : analyse → implémentation → vérification → tests →
correction → amélioration → documentation.

---

## 24. Hypothèses et questions ouvertes

Hypothèses retenues (modifiables par paramètre, pas par code) :

- Devise par défaut **XOF (FCFA)**, fuseau **Africa/Abidjan**, langue **fr** ;
  chaque établissement peut changer ces valeurs.
- Barème de notes par défaut sur 20, moyenne de passage 10.
- Format de matricule par défaut : `{CODE}-{AA}-{NNNNN}` (ex. `LSM-26-00042`),
  unique sur toute la plateforme grâce au code d'établissement unique.

Points qui nécessiteront une décision produit (sans bloquer les phases 1 à 5) :

1. **Fournisseur SMS/WhatsApp** pour l'OTP et les notifications (dépend des
   pays ciblés et des tarifs).
2. **Paiement en ligne** (Mobile Money, carte) : hors périmètre v1 — les
   paiements sont enregistrés par la comptabilité ; l'architecture (modes de
   paiement, référence de transaction) permet d'ajouter un agrégateur.
3. **Facturation SaaS** des établissements (abonnements, plans) : non incluse
   en v1.
