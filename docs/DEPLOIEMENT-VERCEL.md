# Mise en ligne sur Vercel

NeoScool (Next.js 16) se déploie sur Vercel sans adaptation. La base de données reste chez Supabase.

## 1. Supabase (une fois)

1. Créer un projet Supabase dans la région **Europe — Paris (eu-west-3)** : la plus proche de l'Afrique de l'Ouest parmi les régions disponibles.
2. Appliquer les migrations du dossier `supabase/migrations` (Supabase CLI : `supabase link` puis `supabase db push`). Ne jamais charger `supabase/seed.sql` (données de démonstration) en production.
3. *Authentication › URL Configuration* : mettre l'adresse du site (ex. `https://app.neoscool.com`) dans **Site URL** et `https://app.neoscool.com/**` dans **Redirect URLs**.

## 2. Vercel

1. *Add New › Project* : importer le dépôt GitHub. Le cadre « Next.js » est détecté.
2. Le fichier `vercel.json` fixe la région des fonctions à **Paris (cdg1)**, à côté de la base, et programme les tâches automatiques (voir § 4).
3. Offre **Pro** obligatoire pour un usage commercial ; elle est aussi nécessaire pour les tâches planifiées à la minute.
4. *Settings › Domains* : ajouter votre domaine. Si le domaine est géré chez Cloudflare, laisser l'enregistrement en **DNS only** (nuage gris).

## 3. Variables d'environnement (*Settings › Environment Variables*)

Saisir les valeurs **dans Vercel uniquement**, jamais dans le dépôt. Production et Preview ont des valeurs séparées.

| Variable | Rôle |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Projet Supabase (clé publique) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé serveur Supabase (secrète) |
| `NEXT_PUBLIC_SITE_URL` | Adresse publique du site (liens des e-mails, QR codes) |
| `CRON_SECRET` | Secret des tâches planifiées : Vercel l'envoie automatiquement (`Authorization: Bearer …`) |
| `PAYMENT_PROVIDER`, `PAYDUNYA_*`, `PAYMENT_WEBHOOK_SECRET` | Paiement des abonnements (clés **live** seulement en production) |
| `ANTHROPIC_API_KEY` | Facultatif : la clé de l'assistant peut aussi être saisie (chiffrée) dans la console |

À **ne pas** définir en production : `NEOSCOL_DEMO_MODE`, `PAYMENT_ALLOW_SIMULATION`, `PAYMENT_CUSTOM_ALLOW_LOCAL`.

Les autres réglages (e-mails Brevo, SMS, WhatsApp, anti-robot Turnstile, moyens de paiement des familles) se font dans la console Super Admin, où les clés sont chiffrées.

## 4. Tâches automatiques (`vercel.json`)

| Tâche | Fréquence (heure UTC = heure d'Abidjan) |
| --- | --- |
| `/api/cron/notifications` : notifications push | chaque minute |
| `/api/cron/abonnements` : fin d'essai, échéances, relances d'abonnement | chaque jour à 6 h 15 |
| `/api/cron/rappels` : rappels d'impayés des familles | chaque jour à 7 h |

Chaque tâche refuse tout appel sans `CRON_SECRET`.

## 5. Données fournies par Vercel

À chaque visite, Vercel indique le **pays** et la **ville** approximatifs du visiteur (en-têtes `x-vercel-ip-country`, `x-vercel-ip-city`). NeoScool les utilise pour la mesure d'audience, sans conserver l'adresse IP.

## 6. Vérifications après la mise en ligne

- `https://votre-domaine/api/sante` répond `"status": "ok"`.
- Connexion du Super Admin, création d'un établissement de test, envoi d'un e-mail de test depuis *Console › Intégrations*.
- *Console › Supervision* : la version déployée et la date de construction sont affichées.
