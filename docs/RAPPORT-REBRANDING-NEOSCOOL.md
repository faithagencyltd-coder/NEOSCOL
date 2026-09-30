# Rapport — rebranding NéoScol → NEOSCOOL

Nouvelle marque : **NEOSCOOL** · Slogan officiel : « Plus qu'un logiciel, une vision pour l'éducation. »

Méthode : audit, rapport, plan, validation, puis modification fichier par fichier sur une liste
de fichiers audités. Aucun remplacement global aveugle. Aucun identifiant technique renommé.
Aucune migration existante modifiée. Aucune donnée supprimée.

## Branding remplacé

- Interface : titres de fenêtre (`%s · NEOSCOOL`), logo texte, en-têtes, pages publiques
  (tarifs, inscription, démo, vérification, hors ligne, configuration), connexion, console
  Super Admin (« NEOSCOOL Console »), abonnement, messages d'erreur, assistant.
- Slogan officiel sous le logo (barre latérale, pages publiques, console, vérification).
- Page de connexion : `NEO` + `SCOOL` en dégradé, à la place de `Néo` + `Scol`.
- Facture d'abonnement PDF : en-tête `NEO` + `SCOOL`.

## Fichiers modifiés

- `src/` et `public/` : 64 fichiers audités un par un. Seuls les textes visibles, les commentaires
  et les métadonnées ont changé.
- `supabase/migrations/20261014003700_rebranding_neoscool.sql` : nouvelle migration.
- `supabase/seed.sql` : 5 lignes (en-tête, 2 noms d'établissements de démo, pied de page, annonce).
- `supabase/config.toml`, `scripts/db/supabase-stub.sql`, `.env.example` : commentaires uniquement.
- `.devcontainer/devcontainer.json` : nom affiché.
- Documentation et démonstration : `README.md`, `docs/*.md`, `scripts/demo-local.{sh,ps1}`.
- Paquet portable : `scripts/portable/*` (LISEZ-MOI, guide, lanceur, `.cmd`, `construire.sh`).
  Les zips s'appellent `NEOSCOOL-*.zip` et s'extraient dans `C:\NEOSCOOL`.
- Tests : textes attendus mis à jour (unitaires, base de données, E2E).

## Fichiers volontairement non modifiés

- Les 25 migrations historiques qui contiennent « NéoScol » (39 occurrences). La règle impose
  de ne modifier aucune migration existante. La nouvelle migration remplace, en base, les textes
  qu'elles produisent.
- `.env.local` : fichier local, non versionné.

## Identifiants techniques conservés

| Identifiant | Rôle |
|---|---|
| `NEOSCOL-BADGE:`, `NEOSCOL-DYN:` | Préfixes des QR codes (badges imprimés en circulation) |
| `NEOSCOL_*` | Variables d'environnement |
| `neoscol/integrations/v1`, `neoscol-integrations` | Dérivation HKDF des clés chiffrées (la changer rendrait les clés stockées illisibles) |
| `neoscol-v1` | Cache du service worker |
| `neoscol-offline`, `neoscol:outbox`, `neoscol:kiosque:*`, `neoscol-sidebar` | Stockage local du navigateur |
| `neoscol-login:`, `neoscol-ip:`, `neoscol-signup:` | Clés de limitation anti-abus |
| `neoscol_org`, `neoscol_enfant` | Cookies de session |
| `project_id = "neoscol"`, nom du paquet npm, base `neoscol` du paquet portable, dépôt `NEOSCOL` | Infrastructure |
| `@demo.neoscol.app`, `no-reply@neoscol.app`, `*.neoscol.invalid` | Adresses (domaine inchangé, par consigne) |
| `NeoScol-Demo-2026!` | Mot de passe de démonstration (conservé, décision validée) |

## Base de données

Nouvelle migration `20261014003700_rebranding_neoscool.sql` :

- libellés des permissions `billing.read` et `billing.manage` ;
- descriptions des formules d'abonnement et des moyens de paiement ;
- commentaires de `students.origin`, `students.legacy_matricule` et de la table `subscription_plans` ;
- 6 fonctions redéfinies à l'identique, seuls les messages visibles changent :
  `app.billing_apply_payment`, `app.country_connect_columns_error`, `app.require_platform_admin`,
  `public.billing_cancel`, `public.country_connect_import`, `public.save_message_template`.

`my_badge` et `resolve_badge_code_at` ne sont pas touchées : elles ne contiennent que les préfixes
des QR codes. Aucune table, colonne ni fonction n'est renommée, et aucune politique RLS ne change.

Ne sont pas modifiés : documents déjà émis, journaux d'audit, configuration déjà enregistrée des
intégrations (un nom d'expéditeur « NéoScol » saisi par le Super Admin reste tel quel), e-mails.

## Abonnements, modules, badges, QR, pointage

- Abonnements et tarifs : montants, formules, essai de 20 jours et Module 4 inchangés. Seuls les
  textes changent (« Abonnement NEOSCOOL… », « Facture NEOSCOOL »).
- Modules : aucun changement fonctionnel.
- Badges : la mention visible sur la carte 3D devient NEOSCOOL. Le contenu des QR est inchangé :
  les badges déjà imprimés restent valides.
- Pointage : kiosque et messages vocaux inchangés.

## Documents, e-mails, PWA, SEO

- Documents : l'auteur, le créateur et le producteur des PDF deviennent NEOSCOOL. Les documents
  déjà émis ne sont pas modifiés.
- E-mails : sujets et en-têtes des e-mails d'authentification, e-mail d'activation, pied des envois
  (« via NEOSCOOL »), e-mail de test des intégrations, nom d'expéditeur par défaut.
- SMS : l'expéditeur par défaut devient `NEOSCOOL` (8 caractères, format accepté).
- MFA : l'émetteur TOTP devient NEOSCOOL pour les nouveaux enrôlements. Les applications
  d'authentification déjà configurées continuent de fonctionner (l'émetteur n'est qu'un libellé).
- PWA : `name`, `short_name` et `description` avec le slogan, pour l'application et pour la console.
- SEO : titre par défaut, modèle de titre et description avec le slogan.

## Assets

Aucun asset supprimé. L'emblème SVG existant est conservé (décision validée).
**LOGO NEOSCOOL À FOURNIR** pour un logo graphique dédié. Aucun faux logo n'a été créé.

## Anciennes occurrences restantes

1. Migrations historiques (39 occurrences dans 25 fichiers) : non modifiables par consigne,
   remplacées en base par la nouvelle migration.
2. `scripts/portable/AUTORISER-WIFI.cmd` : suppression de l'ancienne règle de pare-feu
   « NeoScol (reseau local) », pour qu'elle ne reste pas en double sur les postes déjà configurés.
3. Mot de passe de démonstration `NeoScol-Demo-2026!`.
4. Identifiants techniques du tableau ci-dessus.

## Vérification de la base (après remise à zéro)

Aucune occurrence « NéoScol » dans les fonctions, commentaires, valeurs par défaut, contraintes,
vues, permissions, formules, établissements ou annonces. Deux lignes du journal d'audit, écrites
par les migrations historiques (avant / après d'une formule), sont conservées : c'est un historique.

## Constat hors périmètre (non corrigé ici)

`scan_badge_core` compare `v_time >= ts.starts_at - v_open_before` sur des heures : la soustraction
repasse par minuit. Un cours qui commence entre 00:00 et 00:30 n'est donc pas trouvé à l'entrée
(« Aucun cours prévu »). Le défaut existait avant le rebranding et ne concerne que les cours de
début de nuit. Correctif proposé, dans une migration dédiée :
`v_time >= ts.starts_at - least(v_open_before, ts.starts_at - time '00:00')`.

## Éléments nécessitant encore une intervention humaine

- Logo graphique NEOSCOOL (LOGO NEOSCOOL À FOURNIR).
- Photo réelle de la page de connexion, sans texte incrusté, à placer dans
  `public/assets/neoscool/login/neoscool-login-hero.jpg`.
- En production : renommer le nom d'expéditeur des intégrations Brevo et Twilio dans la console
  s'il a été saisi « NéoScol ».
- Domaine et adresses e-mail de marque : inchangés par consigne. Une migration de domaine serait
  un chantier séparé.
