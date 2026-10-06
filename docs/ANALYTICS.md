# Analytics (console Super Admin)

Rubrique **Console › Analytics**. Toutes les valeurs proviennent d'événements réellement enregistrés ou des tables métier (demandes reçues, établissements créés, paiements confirmés) ; rien n'est estimé.

## Onglets

| Onglet | Contenu |
| --- | --- |
| Vue d'ensemble | Visiteurs en ce moment (5 dernières minutes), aujourd'hui, 7 et 30 jours ; visites, pages vues, durée moyenne, visites d'une seule page ; nouveaux visiteurs et visiteurs qui reviennent (parmi ceux qui ont accepté) ; courbe jour par jour ; comparaison avec la période précédente |
| Géographie | Carte du monde, répartition par pays, villes (fournies par Vercel) |
| Comportement | Pages consultées et temps moyen, rubriques du site, boutons cliqués, liens, origine des visites, pages d'entrée et de sortie, parcours (3 premières pages), campagnes (`utm_source`, `utm_campaign`, `source`) |
| Appareils | Téléphone / tablette / ordinateur, Android / iPhone / Windows / Mac, navigateurs, conversion par appareil |
| Conversion | Taux de conversion des visites, entonnoir d'inscription, formulaires envoyés ; demandes de démonstration et de contact, inscriptions terminées, abonnements payés (tables métier) |
| Établissements | Établissements actifs, connexions, utilisateurs actifs, dernière connexion, actions, pages consultées par module |
| Rapports | Export Excel (une feuille par thème) et PDF, selon la période et les filtres |
| Réglages | Activer / désactiver la mesure détaillée, le consentement, les clics, la durée, l'usage des modules ; durée de conservation ; purge |

Filtres : période (7 j, 30 j, 90 j, 12 mois ou dates), pays, type d'appareil.

## Collecte

- **Site public** : le composant `VisitBeacon` (pages du site) envoie à `/api/site/visite` les pages vues, clics (libellé du bouton ou adresse du lien), durée de la page visible et conversions (`trackConversion`). La durée envoyée à la fermeture de la page peut être interrompue par le navigateur : elle est aussi gardée dans l'onglet (sessionStorage) et renvoyée par la page suivante ; chaque durée porte une clé unique et le serveur ignore les doublons. Le compteur de visites existant (page « Visiteurs ») continue d'être alimenté par la même requête.
- **Application des établissements** : `AppUsageBeacon` envoie le module consulté (premier segment de l'adresse) à `/api/analytics/app` ; établissement et compte sont lus dans la session, côté serveur.
- **Connexions** : déjà enregistrées dans le journal d'audit (`auth.login`).

## Confidentialité

- Aucun cookie. Aucune adresse IP conservée (pays et ville seulement, fournis par l'hébergeur).
- Jamais de saisie de formulaire, de mot de passe, de contenu de page, de donnée scolaire ou financière des familles.
- Visiteur anonyme par défaut (empreinte renouvelée chaque jour). Identifiant durable seulement après **consentement** (bandeau sur le site) ; refus = mesure anonyme.
- « Ne pas me suivre » (DNT / GPC) : aucune mesure. Robots déclarés ignorés.
- Console et espace personnel jamais mesurés.
- Lecture réservée à l'administration de la plateforme (contrôlé en base) ; réglages journalisés.
- Conservation : 13 mois par défaut (réglable de 1 à 25), purge chaque nuit (`/api/cron/analytics`) ou à la demande.

## Tables

`analytics_settings`, `analytics_sessions`, `analytics_events`, `analytics_app_usage` (migration `20261017008200_analytics.sql`).

## Tests

- Base : `tests/db/analytics.test.mjs`
- Navigateur : `tests/e2e/analytics.mjs`
