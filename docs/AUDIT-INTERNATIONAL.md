# Audit NEOSCOOL — master prompt global (plateforme internationale)

Date : 29/09/2026. Cet audit porte sur le projet réel ; aucun code n'a été écrit pour ce prompt avant validation (§ 93).

Taille du projet :

- 281 écrans ou composants React ;
- environ 63 000 lignes TypeScript ;
- 108 tables PostgreSQL ;
- 28 migrations ;
- 160 tests de base, 19 tests unitaires et 12 suites E2E.

## 1. Ce qui existe déjà et sera réutilisé

| # | Domaine | État réel | Réutilisation |
|---|---|---|---|
| 1 | Architecture | Next.js 16 et Supabase (PostgreSQL 17, RLS, GoTrue). Une seule base de code, sans fork par pays. | Conservée (§ 18) |
| 2 | Base de données | 108 tables, RLS sur chaque table. Fonctions `SECURITY DEFINER` pour les écritures sensibles. | Nouvelles tables sur le même modèle |
| 3 | Authentification | Connexion par e-mail ou matricule (personnel), par matricule, date de naissance et mot de passe (élève), par code SMS (parent). Double authentification TOTP appliquée en base, verrouillage progressif, anti-robot, sessions et appareils. | Conservée |
| 4 | Multi-tenant | `organizations` avec `parent_id` (groupe → établissements). `memberships` sert de compte global à plusieurs affiliations. L'établissement actif est un simple cookie, revérifié côté serveur, et la RLS reste la barrière. | Base de la hiérarchie Pays → Organisation → Établissement (§ 15) |
| 5 | Organisations et groupes | `school_group` (Module 4) : établissement principal, espaces par domaine, bascule entre espaces. | Étendue aux groupes multi-villes et multi-pays |
| 6 | Établissements | Colonnes `country`, `currency`, `locale`, `timezone`, `city`, `address`, `settings` ; identité visuelle dans `organization_branding`. | Ces colonnes deviennent des références à des pays et devises configurables |
| 7 | Utilisateurs | `profiles.locale` existe déjà (langue préférée) mais n'est pas encore utilisée par l'interface. | Devient `preferred_language` (§ 9) |
| 8–9 | Rôles et permissions | RBAC par établissement (`roles`, `role_permissions`, `membership_roles`). `app.permitted_org_ids` et `app.has_permission` sont contrôlées en base. | Conservés ; nouvelles permissions ajoutées au catalogue |
| 10 | Modules | Modules 1 à 4 (scolaire, formation, université, multi-modules). Vocabulaire dynamique déjà en place (élève, étudiant, apprenant) via `vocabularyFor(type)`. | La terminologie devient configurable (§ 13–14) |
| 11 | Abonnements | Formules, fonctionnalités par formule (`subscription_features`), prix figés sur chaque facture (historique conservé), essai de 20 jours, lecture seule sans suppression. | Base du catalogue dynamique (§ 26–27) |
| 12 | Paiements | Interface `PaymentProvider` (PayDunya, simulation en test seulement), webhook idempotent, vérification serveur, paiement manuel. | Adaptateurs par pays (§ 21, 60–62) |
| 13 | Comptabilité | Finances de l'établissement (factures, reçus, dépenses) strictement séparées des revenus NEOSCOOL. | Conservée (§ 45) |
| 14–15 | Communication et SMS | Intégrations Brevo, Twilio, WhatsApp officiel. Quotas et journal d'envoi. Annonces et messagerie internes. | Ajout d'une portée par pays et de la tarification des SMS (§ 23) |
| 16 | Portails | Portails élève, étudiant, apprenant, parent (multi-enfants), personnel, enseignant, formateur, kiosque de pointage, NEOSCOOL Console. | Conservés (§ 31) |
| 17 | Documents | Document Studio, PDF avec QR de vérification, numérotation, documents figés, révocation. | Conservé ; il restera à le rendre bilingue |
| 18 | Archives | Cycle de vie élève, historique, années académiques, données historiques importées. Aucune suppression. | Complété par l'archivage d'une année (§ 40) |
| 19 | Hors ligne | Application installable et page hors ligne ; aucune file de synchronisation. | **Manquant** (§ 37–38) |
| 20 | API | Routes `/api/documents`, `/api/rapports`, `/api/migration`, `/api/cron`, `/api/webhooks`, `/api/hooks`. | Même modèle de contrôle |
| 21 | Webhooks | Paiements (idempotents) et Send Email Hook (signé). | Conservés |
| 22 | Tests | Tests base, unitaires et parcours navigateur rejouables. | Étendus (§ 69–83) |

Sont également déjà présents :

- recherche globale sécurisée (palette de commandes et fonction de recherche en base) ;
- assistant intelligent limité par la RLS ;
- import Excel et CSV avec validation ;
- exports CSV et PDF ;
- badges QR, y compris le QR tournant ;
- journal d'audit inaltérable.

## 2. Ce qui manque (écarts avec le prompt)

1. **Pays configurables (§ 3–5, 68)** : la liste des pays est codée en dur dans le formulaire d'inscription (12 pays, sans la France) et il n'existe aucune entité « pays ». Il manque une table `countries` gérée depuis Super Admin : ISO, indicatif, devise, langues, fuseau, formats, fiscalité, fournisseurs, numérotation.
2. **Devises (§ 20)** : `XOF` est la valeur par défaut dans le code (84 fichiers utilisent `fr-FR` ou `XOF`). Il manque une table `currencies` et une devise par établissement réellement utilisée partout. L'historique conserve déjà la devise sur les factures.
3. **Bilinguisme FR / EN (§ 6–12, 69, 82)** : aucune bibliothèque i18n. Environ **6 500 textes** sont écrits en dur en français dans 281 composants, sans compter les PDF, e-mails, SMS et messages d'erreur SQL. C'est le chantier le plus volumineux.
4. **Terminologie configurable (§ 13–14)** : le vocabulaire est aujourd'hui calculé par type d'établissement. Le rendre modifiable par le Super Admin ou l'établissement, en FR et en EN.
5. **Catalogue dynamique Modules et Fonctionnalités (§ 26–27, 65)** : les formules existent, mais les modules et fonctionnalités ne sont ni éditables, ni tarifés par pays et devise, ni versionnés.
6. **Feature flags multi-niveaux (§ 47–48)** : ils existent seulement au niveau de l'établissement (`settings.features`). Il manque les niveaux global, pays, organisation, formule et utilisateur, avec une résolution contrôlée en base.
7. **Publication, versions et rollback des configurations (§ 49–51)** : absents.
8. **Tarification par pays, formule, devise et période (§ 24, 76)** : les prix sont fixés par formule, pour une seule devise.
9. **Fournisseurs et tarifs SMS par pays (§ 23)** : les intégrations sont globales. Il manque la portée par pays et le tarif fournisseur ou NEOSCOOL.
10. **Hors ligne avec file de synchronisation (§ 37–38, 79)** : absent. Premier cas utile : l'appel des présences et le pointage sans réseau.
11. **Archivage d'une année et réinscription N → N+1 (§ 40–41, 81)** : les éléments existent, mais il manque l'assistant de clôture et d'archivage de l'année.
12. **Structures académiques et règles par pays (§ 66–67)** : les structures sont configurables par établissement, mais il n'existe pas de modèles par pays et par type gérés par le Super Admin. Cela rejoint le moteur académique multi-pays (P7).
13. **Statistiques Super Admin multi-pays (§ 55)** : elles sont partielles (abonnements, revenus). Il manque les vues par pays et l'utilisation par module.
14. **Voice check-in (§ 36)** : absent. L'architecture serait à préparer derrière un feature flag.

## 3. Architecture proposée (une seule version du logiciel)

- **Pays** : table `countries`, avec `code` ISO en clé, `name` bilingue en JSON, `dial_code`, `default_currency`, `currencies[]`, `languages[]`, `default_language`, `timezone`, `phone_pattern`, `date_format`, `settings` (fiscalité, numérotation, administratif) et `is_active`. `organizations.country` reste en place et devient une clé étrangère : aucune donnée à recréer (§ 89).
- **Devises** : table `currencies` (code, symbole, décimales). Un formatage unique `formatMoney(amount, currency, locale)` lit la devise de l'établissement.
- **i18n** : dictionnaires `src/locales/{fr,en}/*.json` et fonction `t()` côté serveur et client.
  - Langue retenue : celle de l'utilisateur (`profiles.locale`), sinon celle de l'établissement, sinon celle du pays.
  - Un sélecteur FR / EN est ajouté ; le choix est mémorisé en base.
  - Les messages SQL (erreurs, notifications) seront à terme renvoyés sous forme de codes, traduits dans l'interface.
- **Catalogue produit** : tables `product_modules`, `product_features` et `product_prices`. Un prix se définit par pays, formule, devise et période, avec des promotions. Les formules actuelles sont migrées sans changement de prix pour les abonnés.
- **Feature flags** : la fonction `app.feature_enabled(org, feature)` résout dans l'ordre global → pays → organisation → établissement → formule → utilisateur, en base. La désactivation ne supprime rien (§ 48).
- **Configurations versionnées** : table `config_versions` (entité, version, auteur, avant et après, statut brouillon / publié). Publication et rollback sont audités.
- **Fournisseurs** : les intégrations de P3 reçoivent une portée « pays » et un tarif ; les adaptateurs existants sont conservés.
- **Hors ligne** : file IndexedDB avec clé d'idempotence par opération. La synchronisation passe par des RPC idempotentes et les conflits sont affichés.

## 4. Ordre de réalisation proposé (avec la suite P7)

| Étape | Contenu | Tests prévus par le prompt |
|---|---|---|
| **I1** | Pays et devises en base, écran « Pays » du Super Admin, formulaires reliés (fin des listes codées en dur), fuseau, indicatif, formats et devise par établissement | § 68, 70, 83 |
| **I2** | Fondation i18n et sélecteur FR / EN. Traduction complète : authentification, pages publiques, menus, NEOSCOOL Console (Super Admin) et portails | § 69, 82 (partiel) |
| **I3** | Traduction du reste de l'application, module par module : scolaire, formation, université, finances, documents PDF, e-mails et SMS | § 82 (complet) |
| **I4** | Catalogue dynamique modules, fonctionnalités et prix par pays et devise ; feature flags multi-niveaux ; versions, publication et rollback | § 75, 76 |
| **I5** | Communication par pays (fournisseurs, tarifs SMS), rappels d'impayés avec paiement du coût SMS | § 78 |
| **I6** | Hors ligne pour l'appel et le pointage (file de synchronisation idempotente) | § 79 |
| **I7** | Archivage d'une année, réinscription N → N+1, export et import avec validation | § 80, 81 |
| **I8** | Moteur académique multi-pays (P7) : modèles par pays et type, règles versionnées, simulateur, Country Connect (import et export nationaux configurables, aucune API nationale inventée) | § 66, 67 |
| **I9** | Statistiques Super Admin multi-pays, assistant IA étendu, préparation du voice check-in | § 55 |

Chaque étape suit la même démarche :

- migration sans perte (compatible avec les données existantes) ;
- contrôles en base ;
- interface ;
- tests (base et E2E) ;
- non-régression ;
- commit.

**Volume réaliste** : I1, I2 et I4 sont les fondations et peuvent être livrées rapidement. I3 (6 500 textes) se fera sur plusieurs livraisons, module par module, sans rien casser : les textes non encore traduits restent en français.

## 5. Points à valider

1. Ordre I1 → I9 ci-dessus (fondations internationales d'abord, P7 ensuite).
2. Anglais : traduction réalisée par moi (qualité professionnelle), relisible ensuite dans des fichiers JSON.
3. France et zone euro : ajout du pays France (EUR) et des pays demandés dans les données de départ, tous modifiables depuis le Super Admin.
