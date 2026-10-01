# Paiements en ligne des familles (multi-agrégateurs)

Les familles paient les frais de scolarité depuis le portail parent ; chaque
paiement confirmé par le fournisseur est enregistré automatiquement en
comptabilité (reçu numéroté, solde de la facture et des échéances, notifications,
historique, audit).

```
PARENT → PAIEMENT → FOURNISSEUR → WEBHOOK → VÉRIFICATION SERVEUR → SUCCESS
       → COMPTABILITÉ (payments) → SOLDE → REÇU PDF → NOTIFICATIONS → HISTORIQUE → AUDIT
```

## Où le trouver

| Rôle | Écran |
| --- | --- |
| Super Admin | Console › Paiements en ligne › « Paiements des familles dans les établissements » (interrupteur global) |
| Admin établissement, direction (`finance.online.manage`) | Paramètres › Paiements en ligne (`/parametres/paiements`) : activation, options, fournisseurs |
| Comptable, admin (`finance.read`) | Finances › Paiements en ligne (`/finances/paiements-en-ligne`) : transactions, totaux, à traiter, remboursements, notifications reçues, journal |
| Parent (`portal.parent`) | Portail › Finances : « PAYER MAINTENANT », paiements en attente et effectués, reçus |
| Élève | Portail › Finances : consultation (le paiement est réservé au parent, contrôlé en base) |

Secrétaire : aucun accès aux réglages ni aux transactions en ligne sauf si son
rôle reçoit `finance.read` (matrice des rôles).

## Interrupteurs (rien n'est jamais supprimé)

1. **Global (Super Admin)** — `platform_payment_settings.school_payments_enabled`.
   Désactivé : message « Les paiements en ligne sont actuellement désactivés au
   niveau global. » côté établissement et parent ; réglages, clés, transactions
   et reçus conservés.
2. **Établissement** — `org_payment_settings.online_enabled` + options (acompte
   libre, minimum, délai d'expiration).
3. **Fournisseur** — ACTIF / INACTIF, par défaut, priorité ; archivage (historique conservé).

## Fournisseurs (sans limite, sans liste fermée)

Chaque fournisseur d'établissement est une ligne `org_payment_providers`
(adapter + configuration + clés chiffrées). Les « adapters » implémentent tous
le même contrat `PaymentProvider` (`src/lib/payments/types.ts`) ; le module ne
connaît que ce contrat (`src/features/fee-payments/server.ts › buildSchoolProvider`).

| Adapter | Usage |
| --- | --- |
| `paydunya`, `cinetpay`, `fedapay`, `flutterwave`, `paystack`, `stripe`, `wave` | agrégateurs intégrés (mêmes classes que les abonnements) |
| `custom_…` | agrégateurs ajoutés par le Super Admin, réutilisés avec les clés de l'établissement |
| `custom` | toute autre API décrite par l'établissement (API URL test/production, API Key, Secret Key, Client Secret, Merchant ID, Client ID, Account ID, paramètres supplémentaires, description JSON de création/vérification) |
| `mock` | **fournisseur de test** : mode TEST uniquement (contrainte en base), désactivé en production sauf `PAYMENT_ALLOW_SIMULATION=1`, écritures marquées « MODE TEST » |

Champs : nom, pays, devise, environnement TEST / PRODUCTION, moyens (Mobile
Money, carte, virement, autre), identifiants publics, clés secrètes,
paramètres supplémentaires. **Webhook URL** propre à chaque fournisseur
(`/api/webhooks/school-payments/{jeton aléatoire}`) et **Callback URL**
(`/portail/finances/retour`) affichées sur la fiche. Boutons [TESTER LA
CONNEXION] et [ENREGISTRER]. Changer les identifiants désactive le fournisseur
et invalide le dernier test. API personnalisée : test réussi obligatoire avant
activation (contrôlé en base, migration 006500).

## Statuts internes

`PENDING` → `PROCESSING` (paiement ouvert chez le fournisseur) → `SUCCESS` |
`FAILED` | `CANCELLED` | `EXPIRED` ; puis `PARTIALLY_REFUNDED` / `REFUNDED`.
Une confirmation tardive d'une demande expirée est acceptée (l'argent a été reçu).

## Sécurité

- Montant, devise, établissement, élève et référence calculés **en base**
  (`fee_payment_start`) depuis la facture ; le navigateur n'envoie que des choix.
- Facture verrouillée pendant la création : double clic → même transaction
  réutilisée ; total des paiements en cours ≤ reste dû (pas de double paiement).
- Confirmation uniquement par le serveur : la notification et le retour du
  navigateur ne sont que des signaux, l'identifiant est **revérifié auprès du
  fournisseur** (`verifyPayment`) puis `fee_payment_confirm` contrôle
  transaction connue, fournisseur, référence, montant, devise, statut et
  doublon (webhook reçu deux fois → ignoré). Écart → refus + « à traiter ».
- Facture réglée ou annulée entre-temps → paiement confirmé « à traiter » (aucune
  double écriture) avec notification à la comptabilité.
- Clés chiffrées AES-256-GCM côté serveur, jamais renvoyées au navigateur
  (indice « ••••1234 » seulement), jamais dans les journaux (contenus des
  notifications masqués). Colonnes sensibles non lisibles par le rôle
  `authenticated` (`secret_ciphertext`, `provider_response`).
- RLS : chaque établissement ne voit que ses fournisseurs et transactions ; le
  parent ne voit que les transactions de ses enfants.
- RPC de confirmation/échec/ouverture réservées au `service_role`.

## Comptabilité, reçu, notifications

Paiement confirmé → ligne `payments` (méthode, référence fournisseur, numéro
`REC-…` unique par établissement et par année, `balance_after`), soldes de la
facture et des échéances recalculés par les vues existantes, reçu PDF existant
(`/api/documents/recus/{id}` : logo, établissement, parent, élève, matricule,
classe, année, motif, montant, devise, moyen, référence, n° de reçu, date, QR de
vérification). Notifications dans l'application (et notifications push via la
file existante) : parent « Paiement reçu avec succès. », comptables « Nouveau
paiement reçu de 150 000 FCFA pour … ». Événements dans `fee_payment_events`
(historique) et `audit_logs`.

## Remboursements

[DEMANDER UN REMBOURSEMENT] (`finance.payments.create`) puis [REMBOURSER]
(`finance.payments.cancel`) : automatique si l'API du fournisseur le permet
(fournisseur de test), sinon procédure manuelle tracée avec la référence du
remboursement. Le paiement est annulé et le reste ré-enregistré : le solde de la
facture est rouvert du montant remboursé.

## Rapprochement

Recherche par référence NeoScool ou fournisseur, onglet « À traiter » (montant
ou devise différents, facture ne pouvant plus recevoir le paiement), bouton
« Vérifier auprès du fournisseur » (même chemin que la notification), « Marquer
comme traité » avec note, journal des notifications reçues (traitée, doublon,
rejetée, erreur).

## Tests

- Base : `tests/db/paiements-familles.test.mjs` (création, double clic, double
  paiement, interrupteurs, contrôles de confirmation, doublons, comptabilité,
  notifications, échec/expiration/confirmation tardive, remboursements,
  secrets, isolation, régression d'annulation de paiement).
- Navigateur : `tests/e2e/paiements-familles.mjs` (58 contrôles, rejouable) —
  cycle complet avec le fournisseur de test, échec, annulation, double clic,
  webhook reçu deux fois, transaction inconnue, adresse inconnue, notification
  forgée, montant différent, attente → expiration → confirmation tardive,
  fournisseur sans clés, clés jamais affichées, remboursement automatique,
  établissement et plateforme désactivés, isolation.

## Limites connues

- Les agrégateurs réels n'ont pas été appelés depuis cet environnement (aucune
  clé de test fournie) : leurs adapters sont ceux, déjà testés, des abonnements.
  À valider avec les clés sandbox de chaque fournisseur ([TESTER LA CONNEXION]
  puis un petit paiement en mode TEST).
- Remboursement automatique : seul le fournisseur de test l'expose ; pour les
  autres, procédure manuelle tracée.
- Confirmation par e-mail / SMS / WhatsApp : les notifications partent dans
  l'application et en push ; l'envoi par les canaux du Centre d'envois reste à
  brancher sur l'événement `payment.online`.
