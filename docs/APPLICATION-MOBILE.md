# Application mobile NeoScool (Android et iPhone)

Une seule application pour tous les portails : parent, élève / étudiant / apprenant, enseignant / formateur, administration.
Elle ne contient aucune donnée scolaire : elle enregistre seulement les établissements ajoutés
(adresse du serveur, code, nom, logo) et ouvre leurs portails. La connexion, les droits et les
données restent ceux du compte, vérifiés par le serveur de l'établissement.

## Utilisation

1. Ouvrir l'application → **Scanner le QR code de l'établissement** (affiche ou message envoyé
   depuis *Paramètres › Lien des portails*), ou **Saisir le lien ou le code**.
2. L'établissement s'affiche (nom, logo, type, ville) → choisir son portail.
3. L'établissement reste dans **Mes établissements** ; on peut en ajouter plusieurs (enfants dans
   deux écoles, enseignant dans plusieurs établissements) et les retirer.
4. Dans un portail, le bouton **Mes établissements et portails** ramène à la liste.

Serveur local (version Windows installée dans l'établissement) : le téléphone doit être sur le même
Wi-Fi que l'ordinateur ; le lien affiché au démarrage (`http://192.168.x.x:3000/acces/CODE`) fonctionne
dans l'application.

## Obtenir l'APK (Android)

La construction se fait automatiquement sur GitHub (onglet **Actions › Application mobile**), à chaque
modification du dossier `mobile/` ou en cliquant **Run workflow** :

- `NeoScool-1.0.N-test.apk` : version de test, à installer directement sur un téléphone Android
  (autoriser « sources inconnues »).
- `NeoScool-1.0.N.apk` et `.aab` (Play Store) : seulement si la clé de signature est configurée.

Fichiers téléchargeables dans la section **Artifacts** de l'exécution (30 jours).

Lien fixe de la dernière version de test (à ouvrir depuis le téléphone) :
`https://github.com/faithagencyltd-coder/NEOSCOL/releases/download/mobile-test/NeoScool-test.apk`

### Clé de signature (pour le Play Store)

Créer une clé une seule fois et la garder précieusement (sans elle, impossible de publier les mises à jour) :

```
keytool -genkey -v -keystore neoscool.jks -keyalg RSA -keysize 2048 -validity 10000 -alias neoscool
```

Puis dans GitHub › Settings › Secrets and variables › Actions, créer les secrets :
`ANDROID_KEYSTORE_BASE64` (contenu de `base64 -w0 neoscool.jks`), `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` (`neoscool`), `ANDROID_KEY_PASSWORD`.
Variable facultative : `NEOSCOOL_SERVER_URL` (ex. `https://app.neoscool.com`), proposée par défaut.

## iPhone

La construction automatique vérifie que l'application compile pour le simulateur. La publication sur
l'App Store (ou TestFlight) demande un compte **Apple Developer** (99 $ / an) et un Mac pour la
signature : ouvrir `mobile/ios/App/App.xcodeproj` dans Xcode, choisir l'équipe, puis *Product › Archive*.

## Développement

```
cd mobile
npm ci
npm test                    # logique (liens, QR codes, liste des établissements)
node scripts/icones.mjs     # icônes et écrans de démarrage à partir du logo NeoScool
npm run sync                # configuration + copie des écrans dans les projets natifs
```

Test des écrans dans un navigateur au format téléphone (serveur NeoScool lancé) :
servir `mobile/www` sur `http://localhost` (port 80) puis
`APP_URL=http://localhost/index.html SERVER_URL=http://localhost:3000 node scripts/ecrans.e2e.mjs`.
