# Mise en ligne sur Vercel

NeoScool (Next.js 16) se déploie sur Vercel sans adaptation. La base de données reste chez Supabase.

## 1. Supabase (une fois)

1. Créer un projet Supabase dans la région **Europe — Paris (eu-west-3)** : la plus proche de l'Afrique de l'Ouest parmi les régions disponibles.
2. Appliquer les migrations du dossier `supabase/migrations` (Supabase CLI : `supabase link` puis `supabase db push`). Ne jamais charger `supabase/seed.sql` (données de démonstration) en production.
   Sans Supabase CLI : `node scripts/db/parties-sql-editor.mjs <dossier>` produit des fichiers `NeoScool-base-partie-N.sql` à coller dans l'ordre dans Supabase › SQL Editor (chaque partie vérifie que la précédente est appliquée et enregistre ses migrations pour un futur `supabase db push`).
   Premier Super Admin : Supabase › Authentication › Users › *Add user* (cocher *Auto Confirm User*), puis dans SQL Editor : `insert into public.platform_admins (user_id, role) select id, 'owner' from auth.users where email = 'votre@adresse';` et connexion sur `/connexion` → `/plateforme`.
3. *Authentication › URL Configuration* : mettre l'adresse du site (ex. `https://app.neoscool.com`) dans **Site URL** et `https://app.neoscool.com/**` dans **Redirect URLs**.

## 2. Vercel

1. *Add New › Project* : importer le dépôt GitHub. Le cadre « Next.js » est détecté.
2. Le fichier `vercel.json` fixe la région des fonctions à **Paris (cdg1)**, à côté de la base, et programme les tâches automatiques (voir § 4).
3. Offre **Pro** obligatoire pour un usage commercial ; elle est aussi nécessaire pour les tâches planifiées à la minute.
4. *Settings › Domains* : ajouter votre domaine. Si le domaine est géré chez Cloudflare, laisser l'enregistrement en **DNS only** (nuage gris).

## 3. Variables d'environnement (*Settings › Environment Variables*)

Saisir les valeurs **dans Vercel uniquement**, jamais dans le dépôt. Production et Preview ont des valeurs séparées.

Les noms doivent être **exactement** ceux-ci : l'application ne lit pas `SUPABASE_URL`, `SUPABASE_ANON_KEY` ni `SUPABASE_PUBLISHABLE_KEY`. Les variables du fichier `.env.local` de votre ordinateur ne sont **pas** envoyées à Vercel.

| Variable | Production | Preview | Development | Rôle |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | **obligatoire** | **obligatoire** | si `vercel dev` | URL du projet Supabase (*Project Settings › API › Project URL*) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **obligatoire** | **obligatoire** | si `vercel dev` | Clé publique « anon » (*Project Settings › API*) |
| `SUPABASE_SERVICE_ROLE_KEY` | **obligatoire** | **obligatoire** | si `vercel dev` | Clé serveur « service_role » (secrète, jamais dans le navigateur) |
| `CRON_SECRET` | **obligatoire** | conseillée | — | Secret des tâches planifiées (au moins 16 caractères aléatoires) ; Vercel l'envoie automatiquement aux crons (`Authorization: Bearer …`) |
| `NEXT_PUBLIC_SITE_URL` | **obligatoire** | conseillée | — | Adresse publique du site, ex. `https://www.neoscool.com` (liens des e-mails, QR codes) |
| `PAYMENT_PROVIDER`, `PAYDUNYA_*`, `PAYMENT_WEBHOOK_SECRET` | si paiement en ligne | clés de test | — | Paiement des abonnements (clés **live** seulement en production) |
| `ANTHROPIC_API_KEY` | facultatif | facultatif | — | Assistant IA (sinon, clé saisie chiffrée dans la console) |
| `VISIT_SALT` | conseillée | — | — | Sel des empreintes anonymes de la mesure d'audience |

**Important** : les variables `NEXT_PUBLIC_*` sont intégrées **au moment de la compilation**. Après les avoir créées ou modifiées, relancez un déploiement (*Deployments › … › Redeploy*, sans « Use existing Build Cache »). Il en va de même pour `CRON_SECRET` (Vercel ne l'ajoute aux appels des crons qu'après un nouveau déploiement).

Si ces variables manquent, le site n'affiche plus d'erreur 500 : toutes les pages mènent à `/configuration`, qui liste les variables manquantes (noms seulement, jamais de valeur), et les API répondent `503` avec la même liste. Les journaux Vercel indiquent `[configuration] Variables Supabase manquantes : …`.

À **ne pas** définir en production : `NEOSCOL_DEMO_MODE`, `PAYMENT_ALLOW_SIMULATION`, `PAYMENT_CUSTOM_ALLOW_LOCAL`.

Les autres réglages (e-mails Brevo, SMS, WhatsApp, anti-robot Turnstile, moyens de paiement des familles) se font dans la console Super Admin, où les clés sont chiffrées.

## 4. Tâches automatiques (`vercel.json`)

| Tâche | Fréquence (heure UTC = heure d'Abidjan) |
| --- | --- |
| `/api/cron/notifications` : notifications push | chaque minute |
| `/api/cron/abonnements` : fin d'essai, échéances, relances d'abonnement | chaque jour à 6 h 15 |
| `/api/cron/rappels` : rappels d'impayés des familles | chaque jour à 7 h |
| `/api/cron/analytics` : suppression des données Analytics trop anciennes | chaque jour à 3 h 30 |

Chaque tâche refuse tout appel sans `CRON_SECRET` (réponse `401`). La cause exacte est écrite dans les journaux Vercel (*Logs*), sans jamais afficher la valeur :

- `[cron] … la variable CRON_SECRET n'est pas définie sur le serveur` → créer `CRON_SECRET` (Production) puis redéployer ;
- `[cron] … en-tête Authorization absent` → appel manuel sans jeton, ou `CRON_SECRET` ajoutée après le dernier déploiement (redéployer) ;
- `[cron] … jeton différent de CRON_SECRET` → le jeton envoyé ne correspond pas à la valeur enregistrée.

**Tester après déploiement** (remplacer la valeur ; à faire depuis votre ordinateur) :

```bash
curl -i -H "Authorization: Bearer VOTRE_CRON_SECRET" https://votre-domaine/api/cron/notifications
# attendu : HTTP 200 et {"ok":true,...}
curl -i https://votre-domaine/api/cron/notifications
# attendu : HTTP 401 (protection active)
```

Dans Vercel, *Settings › Cron Jobs* liste les tâches et permet de les lancer à la main (« Run ») ; le résultat apparaît dans *Logs*.

Plan Vercel **Hobby** : une tâche planifiée ne peut s'exécuter qu'une fois par jour. La tâche `/api/cron/notifications` (chaque minute) exige le plan **Pro** ; sinon, réduire sa fréquence dans `vercel.json` ou l'appeler depuis un autre planificateur avec le même en-tête.

## 5. Données fournies par Vercel

À chaque visite, Vercel indique le **pays** et la **ville** approximatifs du visiteur (en-têtes `x-vercel-ip-country`, `x-vercel-ip-city`). NeoScool les utilise pour la mesure d'audience, sans conserver l'adresse IP.

## 6. Vérifications après la mise en ligne

- `https://votre-domaine/api/sante` répond `"status": "ok"`.
- Connexion du Super Admin, création d'un établissement de test, envoi d'un e-mail de test depuis *Console › Intégrations*.
- *Console › Supervision* : la version déployée et la date de construction sont affichées.
