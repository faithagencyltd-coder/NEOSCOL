# Rapport de sécurité NEOSCOOL

Ce rapport porte sur les étapes P3 (intégrations) et P4 (sécurité).

Principe suivi partout : **cacher un bouton n'est jamais une sécurité**. Chaque contrôle est appliqué par le serveur et, autant que possible, par la base de données (RLS, fonctions `SECURITY DEFINER`). Un appel direct à l'API contourne donc l'interface, mais pas la base.

## 1. Isolation des établissements

- Chaque table porte l'`organization_id` de l'établissement et est protégée par RLS. Les droits sont vérifiés par `app.permitted_org_ids` / `app.has_permission`.
- L'établissement actif est un simple cookie de préférence. L'appartenance est revérifiée côté serveur, et la RLS reste la barrière : le `tenant_id` envoyé par le navigateur n'est jamais cru.
- **Module 4** : chaque espace est un établissement rattaché. Un domaine non souscrit met son espace en lecture seule (`app.org_billing_access`). L'accès aux données des autres établissements reste nul.

## 2. Double authentification (TOTP), appliquée en base

- `app.mfa_satisfied()` est intégrée à `app.permitted_org_ids` et à `app.is_platform_admin`.
- Un compte qui a activé la double authentification n'a **aucun droit** tant que sa session n'est pas au niveau `aal2`. Un mot de passe volé ne donne donc accès à rien, même via l'API.
- **Connexion** : mot de passe, puis `/connexion/verification` (code à 6 chiffres). Les codes faux sont soumis au même verrouillage que le mot de passe.
- **Activation et désactivation** : page `/securite`. L'activation passe par un QR code et une clé, puis un premier code de confirmation. La désactivation exige un code valide.
- **Option du Super Admin** : double authentification obligatoire pour les rôles sensibles (Super Admin, direction, comptabilité). Les comptes concernés sont redirigés vers l'activation.

## 3. Verrouillage progressif et anti-robot

- Toute tentative de connexion est enregistrée dans `auth_login_attempts`. L'identifiant et l'IP sont hachés (SHA-256) ; cette table n'est accessible qu'au serveur.
- **Verrouillage** : après 5 échecs (réglable), le compte est verrouillé 15 minutes, **même avec le bon mot de passe**. Une réussite remet le compteur à zéro. Le Super Admin peut déverrouiller depuis le centre de sécurité.
- **Anti-robot Turnstile** : exigé après 3 échecs sur un compte ou depuis une même IP, ou à chaque connexion en mode `always`. Il est toujours exigé à l'inscription quand Turnstile est actif. Le jeton est vérifié côté serveur auprès de Cloudflare.
- **Repli** : si Turnstile n'est pas configuré, il n'y a pas d'anti-robot, mais le verrouillage et les limites d'inscription par IP restent actifs.

## 4. Vérification de l'adresse e-mail des nouveaux établissements

- Un nouvel établissement passe en `email_verification = 'pending'`. Il est alors en **lecture seule, appliquée par la base** (ses espaces Module 4 aussi) jusqu'au clic sur le lien.
- Le lien porte un jeton haché en base, à usage unique, valable 48 h. Un bandeau propose de le renvoyer (3 envois par heure au plus).
- Cette vérification s'applique si le Super Admin l'exige **et** si l'e-mail (Brevo) est configuré. Sinon l'établissement est actif immédiatement : aucun blocage faute d'e-mail.

## 5. Sessions et appareils

- `/securite` liste les appareils connectés (navigateur, IP, date, session vérifiée par code). On peut y fermer un appareil, ou tous les autres.
- Le Super Admin peut fermer toutes les sessions d'un compte compromis.
- **Limite connue** : un jeton d'accès déjà émis reste valable jusqu'à son expiration (1 h au plus). Le renouvellement est, lui, refusé immédiatement.

## 6. Intégrations (P3)

- Les clés sont saisies par le Super Admin dans la console, jamais dans le code ni dans la discussion.
- Elles sont chiffrées par le serveur (AES-256-GCM) avant d'arriver en base.
- La colonne chiffrée n'est lisible par aucun rôle navigateur (privilèges de colonne), pas même par le Super Admin. Seul l'indice « ••1234 » est réaffiché.
- Il n'y a jamais de clé dans le journal d'audit, dans les messages d'erreur, ni dans une variable `NEXT_PUBLIC_`.
- **Quotas mensuels** : fixés par établissement, ils sont contrôlés avant chaque envoi.
- **Journal des envois** : le destinataire y est masqué, le contenu n'est pas conservé.
- **WhatsApp** : API Cloud officielle de Meta, modèles approuvés uniquement. Aucune automatisation non officielle.
- **Send Email Hook** : signature « Standard Webhooks » vérifiée, horodatage limité à ±5 minutes.

## 7. Centre de sécurité (Super Admin)

La page `/plateforme/securite` regroupe :

- les indicateurs : échecs sur 24 h, comptes verrouillés, rôles sensibles sans double authentification, adresses à vérifier ;
- les réglages : seuils, durée de verrouillage, double authentification obligatoire, vérification e-mail ;
- les actions : déverrouiller un compte, fermer les sessions d'un compte ;
- le journal de sécurité.

Toutes les actions sont auditées.

## 8. Tests

| Suite | Résultat |
| --- | --- |
| Base de données (`npm run db:test`) | 156/156, dont `securite.test.mjs` (5) et `integrations.test.mjs` (5) |
| Unitaires (`npm run test:unit`) | 19/19 (chiffrement, fournisseurs, signature du hook) |
| E2E `tests/e2e/securite.mjs` | 17/17 |
| E2E `tests/e2e/integrations.mjs` | 16/16 |
| Non-régression E2E | abonnements 64, 12 scénarios 49, université 111, formation 75, module scolaire 51 |

Le test E2E de sécurité vérifie notamment :

- le verrouillage, y compris avec le bon mot de passe ;
- la double authentification avec un vrai code TOTP calculé ;
- la connexion en deux étapes et le refus de l'accès direct sans code ;
- la fermeture d'un appareil.

## 9. À faire en production

- Définir `INTEGRATIONS_ENCRYPTION_KEY` (32 octets en base64) **avant** d'enregistrer les clés des intégrations.
- Définir `SEND_EMAIL_HOOK_SECRET` et activer `[auth.hook.send_email]` une fois Brevo testé.
- Activer Turnstile (Intégrations), puis la double authentification obligatoire (Sécurité) une fois les responsables équipés.
- Les limites de débit natives de Supabase Auth (`[auth.rate_limit]`) protègent aussi les appels directs à l'API d'authentification.

## 10. « Mon badge » : QR code tournant (P5)

- Le téléphone affiche `NEOSCOL-DYN:<S|E>:<badge>:<fenêtre>:<signature>`, renouvelé toutes les 30 secondes.
  La signature (HMAC-SHA256) est calculée en base avec le jeton secret du badge, qui n'est **jamais envoyé** au téléphone.
- La tablette vérifie la signature, une fenêtre de ±1 minute et un badge actif.
  Chaque code est **à usage unique** : une capture d'écran réutilisée est refusée.
  Le pointage existant s'applique ensuite sans aucune modification de ses règles.
- Le badge imprimé (QR fixe) reste valable. Un badge désactivé rend tous ses codes invalides.
- Pas de badge pour une session non vérifiée par la double authentification.
- Les fonctions internes (`scan_*_core`, `app.resolve_badge_code`) ne sont pas appelables depuis le navigateur.
- Tests : `tests/db/badges-dynamiques.test.mjs` (4) et `tests/e2e/mon-badge.mjs` (12).
