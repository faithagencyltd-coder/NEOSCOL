# NEOSCOOL Tutor Match (soutien scolaire)

Service **facultatif** de mise en relation entre familles et tuteurs / répétiteurs. **Fermé par défaut.**

- Familles : **Mon espace › Soutien scolaire** (`/espace/tutorat`), lien aussi dans le portail parent (menu « Plus ») quand le service est ouvert pour l'établissement.
- Tuteurs : **Mon espace › Soutien scolaire › Je suis tuteur** (`/espace/tuteur`).
- Console : **Tutor Match** (`/plateforme/tutorat`) et **Contrôle des modules › NeoScool Tutor Match** pour l'ouverture.

## Ouverture (Super Admin)

Le module « NeoScool Tutor Match » s'ajoute aux modules publics du **Contrôle des modules** : ouverture sur toute la plateforme, par pays, par type d'établissement ou par établissement, avec une date de fin pour un pilote. Chaque établissement peut le désactiver pour ses familles (Paramètres › Fonctionnalités) : le lien disparaît du portail et aucune suggestion n'est envoyée à ses familles.

**Fermeture** : plus de recherche ni de nouvelles demandes ; les demandes, échanges et séances passés restent consultables.

## Parcours

1. Le tuteur crée sa fiche (matières, niveaux, ville et zones, à domicile / en ligne / lieu d'accueil, langues, tarif, disponibilités, expérience, qualifications). Son téléphone et son e-mail ne sont jamais affichés publiquement.
2. L'équipe NeoScool valide la fiche, puis la **vérifie** (pièce d'identité, diplômes…) en précisant ce qui a été contrôlé. Tant que ce n'est pas fait, les qualifications sont affichées « déclarées (non vérifiées) ». Par défaut, seuls les profils vérifiés apparaissent aux familles.
3. La famille recherche (matière, niveau, ville ou quartier, mode, langue, tarif maximum), compare les fiches et envoie une demande. Elle n'écrit que ce qu'elle veut (prénom de l'enfant facultatif) : **aucune note, aucun bulletin, aucune fiche élève n'est transmis.**
4. Le tuteur accepte, refuse ou propose une autre disponibilité. **À l'acceptation**, la famille voit les coordonnées du tuteur.
5. La famille confirme les modalités. **À la confirmation**, le tuteur voit les coordonnées de la famille. Les séances peuvent alors être notées (date, durée, mode) et marquées effectuées ou annulées.
6. Échanges par messages liés à la demande ; historique conservé.
7. Paiement du tutorat : **hors NeoScool** (aucun paiement simulé, aucune commission prélevée).

## Protection et confiance

- Signalement d'un profil (rejoint les signalements de la console) ; blocage d'un tuteur par la famille (demandes annulées, tuteur masqué, échanges bloqués) ; suspension par l'équipe.
- Par défaut, un enseignant ne peut pas recevoir de demande payante d'une famille de **son propre établissement**.
- Limite de demandes en cours par famille.
- Actions importantes journalisées. La console voit le suivi des demandes mais **pas le contenu des échanges**.

## Suggestions de soutien (désactivées par défaut)

Règle explicable et réglable : une matière dont la **moyenne est inférieure au seuil** (10/20 par défaut) sur les **N derniers bulletins publiés** (2 par défaut). Jamais sur une seule note. Le parent reçoit une proposition bienveillante et facultative (« Certains résultats de votre enfant indiquent qu'un accompagnement supplémentaire pourrait être utile en … »), qui ne cite que la matière. Il peut la masquer ou refuser toute suggestion. Pas de nouvelle suggestion pour la même matière avant le délai réglé (90 jours). Analyse chaque nuit (tâche quotidienne) ou à la demande dans la console.

## Réglages (Console › Tutor Match › Réglages)

Tuteurs indépendants ; enseignants d'établissements ; vérification obligatoire ; interdiction dans son propre établissement ; demandes en cours maximum ; suggestions (activation, seuil, nombre de bulletins, délai) ; règles du service affichées aux familles et aux tuteurs.

## Base de données

Migration `20261017008500_tutor_match.sql` : `tutor_settings`, `tutor_profiles`, `tutor_requests`, `tutor_request_messages`, `tutor_sessions`, `tutor_blocks`, `tutor_suggestions`, `tutor_suggestion_optouts` ; module public `tutor_match` ; signalements étendus aux tuteurs.

## Tests

- `tests/db/tutorat.test.mjs`
- `tests/e2e/tutorat.mjs`

## Non inclus

Visioconférence et paiement en ligne entre familles et tuteurs (pas d'équivalent existant à réutiliser) ; notification des tuteurs indépendants hors de leur espace (les notifications de l'application sont rattachées à un établissement).
