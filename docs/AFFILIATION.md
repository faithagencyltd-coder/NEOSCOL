# NEOSCOOL Affiliates (programme de recommandation)

Console › **Affiliation** (`/plateforme/affiliation`) — espace affilié : **Mon espace › Affiliation** (`/espace/affiliation`). **Désactivé par défaut.**

## Fonctionnement

1. Une personne connectée (enseignant, ambassadeur, commercial, partenaire… selon les profils acceptés) demande à rejoindre le programme. Aucun compte supplémentaire : son compte NeoScool habituel suffit.
2. Le Super Admin approuve (ou refuse / suspend, avec motif). L'affilié reçoit un **lien** (`/r/NEO-NOM-1234`) et un **code**.
3. Une école qui clique le lien, puis crée son établissement dans le délai d'attribution (60 jours par défaut), ou qui saisit le code à l'inscription, est **attribuée une seule fois**, côté serveur. La preuve (clic, code, date) est conservée.
4. Quand l'école **paie réellement** son abonnement (paiement confirmé par le fournisseur ou paiement manuel enregistré par la console), une commission « en attente » est créée selon la règle (par défaut : 20 % du premier paiement).
5. Le Super Admin vérifie, valide ou refuse (motif). Après le délai de vérification, la commission devient **payable** (tâche quotidienne ou ouverture de la console).
6. Le versement est fait **hors NeoScool** (Mobile Money, virement), puis enregistré dans la console **avec sa référence réelle** : la commission passe « payée ». Aucun versement n'est simulé.

## Protections

- Lien : seul un identifiant aléatoire de clic est gardé dans un cookie technique `ns_ref` ; le serveur relit le clic en base (affilié approuvé, délai). Un identifiant inventé ou modifié n'attribue rien.
- Une école déjà existante n'est jamais attribuée ; une école déjà cliente (même nom et ville, ou même téléphone) est signalée « à vérifier ».
- Auto-parrainage (même téléphone que l'affilié) refusé.
- Une seule commission par paiement ; règle « premier paiement » : jamais de seconde commission pour la même école.
- Paiement remboursé → commission annulée (ou signalée « à régulariser » si déjà versée).
- Contestation possible par l'affilié ; correction d'attribution motivée et journalisée.
- Les affiliés ne voient que leurs propres données (nom et état des écoles recommandées, aucune autre donnée d'établissement).

## Réglages du Super Admin

Interrupteur général ; nouvelles demandes ; liens ; codes (et codes promo liés, Console › Offres) ; campagnes ; validation manuelle ; profils acceptés ; téléphone et coordonnées de versement obligatoires ; type et montant de récompense ; déclencheur (premier paiement ou chaque paiement pendant N mois) ; formules concernées ; plafond mensuel ; durée d'attribution ; règle en cas de conflit (code d'abord, premier clic, dernier clic) ; délai de vérification ; minimum de versement ; conditions du programme ; prise en compte des paiements de test (démonstration uniquement).

**Désactivation** : plus de nouvelles demandes, clics, attributions ni commissions ; l'historique est conservé, l'affilié garde l'accès à son espace et les commissions validées restent payables.

Pensez à mentionner le cookie `ns_ref` dans la politique de confidentialité (Console › Site).

## Base de données

Migration `20261017008400_affiliates.sql` : `affiliate_settings`, `affiliate_campaigns`, `affiliates`, `affiliate_clicks`, `affiliate_attributions`, `affiliate_commissions`, `affiliate_payouts`, déclencheurs sur `subscription_payments`, `promo_redemptions` et `payment_transactions` (remboursement).

## Tests

- `tests/db/affiliation.test.mjs`
- `tests/e2e/affiliation.mjs`
