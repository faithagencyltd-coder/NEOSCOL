# Console Super Admin — centre de contrôle NeoScool

Ce document décrit les outils ajoutés à la console (`/plateforme`) par les phases SA-1 à SA-11.
Tout repose sur des données réelles ; rien n'est simulé. Chaque contrôle est appliqué par la base de données.

## Rôles de l'équipe (Équipe)

| Rôle | Droits |
|---|---|
| Propriétaire | Tout, y compris l'équipe et l'export des données d'un établissement |
| Administrateur | Tout, sauf l'équipe et l'export des données |
| Lecture seule | Consulte toute la console, ne modifie rien |

La lecture seule est garantie par la base : ce rôle n'est reconnu que dans une transaction en lecture seule.
La plateforme garde toujours au moins un propriétaire actif.

## Pages

| Onglet | Rôle |
|---|---|
| Établissements | Tableau de bord : chiffres clés, alertes, échéances, liste des établissements |
| Comptes | Recherche d'un compte, fermeture des sessions, suspension ou réactivation motivée |
| Abonnements, Paiements, Revenus, Formules, Offres, SMS | Inchangés |
| Analyses | Évolution mensuelle, revenus NeoScool (hors frais de scolarité), établissements inactifs, export CSV |
| Commercial | Prospects du site : état, responsable, relance, historique, conversion en client |
| Visiteurs | Audience du site, sans cookie (empreinte jetable quotidienne, DNT/GPC respectés, conservation 13 mois) |
| Sécurité | Réglages existants et alertes : faits observés, comportements à vérifier, modifications sensibles |
| Supervision | Base de données, services externes, notifications de paiement, envois, erreurs, stockage |
| Assistance | Demandes des établissements (menu « Assistance » de l'application) et incidents de la plateforme |
| Maintenance | Mode maintenance, version en service et historique, sauvegardes, procédures |
| Contrôle des modules | Arrêt ou ouverture d'une fonctionnalité : toute la plateforme, un pays ou un type d'établissement |
| Journal | Tous les événements, avec filtres. Le détail métier d'une école reste réservé à l'école |
| Confidentialité | Registre des demandes (échéance 30 jours), export JSON des données d'un établissement (propriétaires), règles de conservation |
| Assistant IA | Questions en français sur l'état de la plateforme, en lecture seule. Faits et soupçons sont distingués |
| Équipe | Membres et rôles |

## Ce qui dépend de l'extérieur (sans simulation)

- **Surveillance 24 h/24** : une application ne peut pas constater sa propre panne.
  - Il faut configurer un service externe (UptimeRobot, Better Stack…) sur `GET /api/sante`.
  - Cette adresse renvoie « ok » ou une erreur 503, sans aucune donnée.
- **Sauvegardes** : elles sont réalisées par l'hébergeur de la base.
  - Pour les afficher, définissez sur le serveur `SUPABASE_ACCESS_TOKEN` (jeton en lecture) et `SUPABASE_PROJECT_REF`. Ces valeurs ne sont jamais affichées.
  - Aucune restauration n'est déclenchée depuis l'application.
- **Retour à une version précédente** : il se fait chez l'hébergeur de l'application.
  - La console enregistre chaque version démarrée, avec les erreurs constatées pendant sa période de service.
- **Assistant IA** : il utilise Claude si la clé est configurée dans Intégrations.
  - Sinon, il fonctionne en mode local guidé : mêmes outils, mêmes données.
- **Pays des visiteurs** : fourni par l'hébergeur (en-têtes `x-vercel-ip-country` ou `cf-ipcountry`), absent en local.

## Choix de confidentialité

- **Pas de « voir comme »** : se connecter à la place d'un utilisateur donnerait un accès invisible aux données d'une école.
  - L'aide passe par la fiche établissement (volumes, comptes, événements, aucune donnée d'élève), la recherche de compte et les demandes d'assistance.
- **Variable facultative** : `VISIT_SALT` personnalise le sel de l'empreinte des visiteurs. À défaut, une valeur serveur est utilisée.
