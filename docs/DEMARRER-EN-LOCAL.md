# Essayer NéoScol sur votre ordinateur

Une seule commande lance la vraie application avec les données de démonstration
(3 établissements fictifs : groupe scolaire, centre de formation, université).

## 1. Installer (une seule fois)

| Logiciel | Où le trouver | Vérifier |
|---|---|---|
| **Node.js 20 ou plus** (version « LTS ») | https://nodejs.org | `node -v` |
| **Docker Desktop** | https://www.docker.com/products/docker-desktop | l'icône Docker est verte |
| **Git** (pour récupérer le code) | https://git-scm.com | `git --version` |

Ordinateur conseillé : 8 Go de mémoire, 10 Go d'espace disque libre.

## 2. Récupérer le code

```bash
git clone https://github.com/faithagencyltd-coder/neoscol.git
cd neoscol
git checkout claude/neoscol-architecture-design-81m58e
```

## 3. Lancer

Démarrez **Docker Desktop**, puis dans le dossier `neoscol` :

| Système | Commande |
|---|---|
| macOS / Linux | `npm run demo` |
| Windows (PowerShell) | `npm run demo:windows` |

La première fois, comptez 5 à 10 minutes (téléchargement de la base de données).
Quand « NéoScol démarre » s'affiche, ouvrez **http://localhost:3000**.

## 4. Se connecter

Sur la page de connexion, **cliquez sur un rôle** (mode démonstration) : aucune saisie nécessaire.

| Rôle | Ce qu'il permet d'essayer |
|---|---|
| Administrateur | Tous les modules : élèves, finances, documents, paramètres, audit |
| Direction · Secrétariat · Comptabilité | Mêmes écrans, limités aux droits du rôle |
| Professeur | Mes cours, appel (après scan du badge), saisie des notes |
| Parent | Portail mobile : impayé → restriction → paiement → déblocage |
| Élève | Emploi du temps, présences, notes, bulletins |
| Tablette de pointage | Écran « Scannez votre badge » |
| Université | Étudiants, promotions, semestres, crédits ECTS |
| Centre de formation | Apprenants, sessions, formateurs |

Connexion manuelle possible : mot de passe commun `NeoScol-Demo-2026!` ;
parent : téléphone `+2250700000001`, nom `BAMBA`, prénom `Adjoua`, code SMS `123456`.

## 5. Parcours conseillés (10 minutes)

1. **Administrateur → Personnel** : créez un enseignant, générez son badge QR.
2. **Tablette de pointage** : collez le code du badge → le cours se déverrouille.
3. **Professeur → Mes cours** : faites l'appel, puis saisissez des notes.
4. **Administrateur → Bulletins** : calculez, publiez, ouvrez le PDF.
5. **Parent** : notes bloquées pour impayé ; **Comptabilité** enregistre le paiement ; le parent recharge : accès rétabli.
6. **Documents → Document Studio** : modifiez le texte du certificat, aperçu en direct.
7. **Université** : ouvrez un étudiant → onglet Documents → « Relevé de notes » (crédits ECTS).

## Commandes utiles

| Besoin | Commande |
|---|---|
| Arrêter l'application | `Ctrl + C` |
| Arrêter la base de données | `npx supabase stop` |
| Remettre les données de démonstration à zéro | `npm run demo -- --reset` (Windows : `npm run demo:windows -- -Reset`) |
| Voir la base (tableau de bord Supabase) | http://127.0.0.1:54323 |

## En cas de problème

| Message | Solution |
|---|---|
| « Docker n'est pas démarré » | Ouvrez Docker Desktop et attendez l'icône verte |
| « port is already allocated » | Un autre projet Supabase tourne : `npx supabase stop --all` |
| La page affiche « Configuration » | Relancez `npm run demo` (il recrée `.env.local`) |
| Windows : « l'exécution de scripts est désactivée » | Utilisez bien `npm run demo:windows` (il autorise le script pour cette exécution) |

⚠ Toutes les données sont **fictives**. Ne pas utiliser ces réglages (code SMS fixe,
mode démonstration) en production.
