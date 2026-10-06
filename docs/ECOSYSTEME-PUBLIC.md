# Écosystème public NeoScool

Annuaire public (Discover), demandes d'information (Leads), campagnes (Promotion) et visuels (Media Kit), annonces d'emploi et de services (Opportunities), mise en avant payante, publicité externe.

## Principe : fermé par défaut

Les six modules publics (`discover`, `leads`, `promotion`, `media_kit`, `opportunities`, `external_ads`) sont **fermés tant que le Super Admin ne les ouvre pas**, dans *Console › Contrôle des modules* :

- partout, par pays, par type d'établissement ou pour **un établissement pilote** ;
- avec une date de fin facultative (essai).

La base vérifie le module à chaque écriture et à chaque lecture publique. Un établissement **de démonstration** n'apparaît jamais dans l'annuaire public (message affiché dans sa fiche).

## Pages publiques (sans compte)

| Adresse | Contenu |
| --- | --- |
| `/decouvrir` | Annuaire : recherche, pays, ville, type ; « À la une » en premier |
| `/decouvrir/[adresse]` | Fiche : présentation, formations, admission, coordonnées officielles, photos, campagnes en cours, demande d'information, version anglaise (`?lang=en`), données structurées `EducationalOrganization` |
| `/decouvrir/[adresse]/campagnes/[id]` | Page de campagne (lien partagé, QR code) |
| `/opportunites` | Annonces : emplois, stages, répétiteurs, services |
| `/opportunites/[id]` | Annonce, candidature avec CV (compte requis), favori, signalement, données `JobPosting` |
| `/espace/inscription` | Compte gratuit d'un particulier |
| `/sitemap.xml`, `/robots.txt` | Seules les fiches et annonces publiques y figurent |

L'origine de chaque demande est conservée : `?source=discover|profile|campaign|qr|facebook|instagram|tiktok|whatsapp|link`.

## Espace personnel (particuliers) — `/espace`

**Confirmation de l'adresse e-mail** : quand la plateforme exige la vérification des adresses (*Console › Sécurité*) et que l'envoi d'e-mails est configuré (Brevo), un nouveau compte reçoit un lien (48 h, usage unique). Tant qu'il n'a pas cliqué, il peut consulter mais ni répondre à une annonce ni en publier (contrôlé en base) ; un bouton « Renvoyer le lien » est proposé (3 envois par heure). Sans envoi d'e-mails configuré, le compte est actif tout de suite : personne n'est bloqué faute d'e-mail.

Candidatures et leur statut, annonces publiées et réponses reçues, favoris, échanges. Le CV n'est visible que par son propriétaire et par l'auteur de l'annonce. L'adresse e-mail de l'auteur d'une annonce n'est révélée au candidat qu'une fois sa candidature acceptée.

## Espace établissement — menu « Visibilité »

| Page | Droit | Module |
| --- | --- | --- |
| Fiche publique (`/visibilite`) : fiche, bibliothèque d'images, vérification, statistiques, mise en avant | Paramètres | discover |
| Demandes reçues (`/visibilite/demandes`) : origine, statut, appels, notes | Inscriptions (gestion) | leads |
| Campagnes (`/visibilite/campagnes`) : lien suivi, Media Kit (SVG ou PNG avec QR code) | Communication | promotion, media_kit |
| Recrutement (`/visibilite/opportunites`) : offres, candidatures, CV, statut | Personnel | opportunities |
| Publicité externe (`/visibilite/publicite`) | Communication | external_ads |

Une entrée de menu n'apparaît que si le module est ouvert pour l'établissement.

## Console Super Admin — *Écosystème public*

Vue d'ensemble, modération (fiches, campagnes, annonces, signalements), vérification (pièces demandées par pays et type, lecture des pièces, décision), catégories d'annonces, offres de visibilité et commandes, publicité externe, règles de validation avant publication.

## Règles de confiance

- **Vérifié ≠ payé** : le badge « Profil vérifié » est accordé uniquement après contrôle des pièces ; une mise en avant payante ne le donne jamais.
- **Aucun tarif actif par défaut** : une offre de visibilité est créée inactive ; une commande n'est appliquée qu'après confirmation du paiement réellement reçu (référence obligatoire).
- **Trois montants distincts** : abonnement NeoScool, frais de visibilité ou d'accompagnement NeoScool, budget publicitaire payé directement à la plateforme (Meta, TikTok, Google). NeoScool n'encaisse jamais ce budget ; il ne figure pas dans les revenus.
- **Aucune publicité simulée** : aucune connexion aux régies n'existe ; rien n'est lancé automatiquement. Une campagne accompagnée ne passe « En diffusion » qu'après validation du plan par l'établissement. Les résultats sont saisis à partir du rapport de la plateforme, avec leur source.
- **Rien d'inventé** : la fiche et les visuels reprennent uniquement les textes et photos fournis par l'établissement ; seules les coordonnées officielles de l'établissement sont publiées.
- **Images** : une image n'est servie publiquement que si elle illustre une fiche ou une campagne publiée.
- **Anti-abus** : champ piège et anti-robot (si configuré), limites par jour pour les demandes, comptes, fichiers et signalements.

## Tests

- Base : `tests/db/ecosysteme.test.mjs`
- Navigateur (parcours complet) : `tests/e2e/ecosysteme.mjs` — ouvre les modules pour l'établissement de démonstration le temps du test, puis remet tout à l'état par défaut et supprime ses propres données.
