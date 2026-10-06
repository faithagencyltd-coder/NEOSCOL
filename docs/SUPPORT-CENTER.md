# Support Center (console Super Admin)

Console › **Support Center** (`/plateforme/support`). Tout est piloté par le Super Admin ; **tout est désactivé par défaut**.

## Ce qui est réutilisé (pas de deuxième messagerie)

- Les **tickets** existants (`support_tickets`, `support_ticket_messages`, page Console › Incidents) restent le système unique de suivi. Quand un visiteur ou un utilisateur demande à parler à une personne, la conversation du chatbot devient un ticket (canal « chatbot » ou « whatsapp »), avec le nom / e-mail / téléphone donnés par le visiteur.
- Les réponses de l'équipe dans le ticket (hors notes internes) sont recopiées automatiquement dans la conversation : le visiteur les voit dans la bulle, ou les reçoit sur WhatsApp.
- WhatsApp utilise l'intégration déjà configurée (Console › Intégrations › WhatsApp Meta).

## Onglets

| Onglet | Contenu |
|---|---|
| Conversations | Conversations du chatbot et de WhatsApp, réponse de l'équipe, clôture |
| Base de connaissances | Articles (titre, contenu, mots-clés, public : tout le monde / site public / portails), publication, désactivation |
| Statistiques | Conversations sur 30 jours, réponses de l'assistant, transferts vers l'équipe, conversations en attente, conversations et demandes par canal, questions sans réponse (pour compléter la base), articles les plus utilisés (données réelles uniquement) |
| Réglages | Activer / désactiver : le chatbot, sur le site, dans les portails, la reformulation par Claude, la réception WhatsApp, les réponses automatiques sur WhatsApp ; message d'accueil, message de transfert, consignes ; jeton de vérification et clé secrète du webhook WhatsApp |

## Ce que le chatbot peut et ne peut pas faire

- Il répond **uniquement** à partir des articles **publiés** de la base de connaissances (recherche plein texte `knowledge_search`).
- Il n'a accès à **aucune** donnée d'établissement, d'élève, de note, de paiement, de compte ni aux informations internes de la console : il ne reçoit que la question et les articles trouvés.
- Option « reformulation par Claude » (désactivée par défaut, nécessite la clé Claude de la console) : le modèle reçoit seulement les articles trouvés et doit répondre « HANDOFF » s'il ne peut pas répondre avec certitude.
- Sans article pertinent → message de transfert et proposition de parler à l'équipe Support.
- Limite : 20 messages par 10 minutes et par adresse.

## WhatsApp

1. Console › Intégrations : configurer WhatsApp Meta (déjà existant).
2. Support Center › Réglages : saisir un **jeton de vérification** et la **clé secrète de l'application** Meta (enregistrés hachés / chiffrés, jamais réaffichés).
3. Dans Meta, déclarer le webhook `https://<domaine>/api/webhooks/whatsapp` avec ce jeton.
4. Activer « Réception WhatsApp ». Chaque message est vérifié (signature `x-hub-signature-256`) ; sans réponses automatiques, la conversation part directement à l'équipe.
5. Réponses de l'équipe : envoyées dans la fenêtre de 24 h ouverte par le dernier message du contact (règle Meta).

## Sécurité

- Conversations, messages et réglages secrets : accessibles seulement au serveur (service_role) et aux membres de l'équipe Super Admin (lecture pour le rôle lecteur, écriture pour les autres) ; actions journalisées.
- Le visiteur retrouve sa conversation grâce à un jeton aléatoire gardé sur son appareil (haché en base).
- Lecture publique limitée aux réglages d'affichage du chatbot et aux articles publiés.

## Base de données

Migration `20261017008300_support_center.sql` : canal et coordonnées du demandeur sur les tickets, `support_settings`, `support_secrets`, `knowledge_articles`, `support_conversations`, `support_conversation_messages`, fonctions de recherche, d'enregistrement, de transfert, de réponse et de statistiques. Elle ajoute aussi la lecture publique (`anon`) manquante sur `opportunity_categories` et `analytics_settings` (catégories des opportunités et réglages de mesure d'audience invisibles pour les visiteurs non connectés).

## Tests

- `tests/db/support-center.test.mjs` (droits, transfert, recherche, isolation)
- `tests/e2e/support-center.mjs` (bulle, réponse, transfert, réponse de l'équipe, WhatsApp, réglages)
