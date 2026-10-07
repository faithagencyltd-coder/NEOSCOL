# Vidéo motion design « NeoScool — module scolaire » (90 s) — HyperFrames

Composition HTML + GSAP rendue par [HyperFrames](https://hyperframes.heygen.com) :
11 scènes (chaos → plateforme unique → inscription → arrivée → classe → bulletins →
caisse → familles → documents → pilotage → signature). Les scènes 2 à 10 montrent
les VRAIES pages de NeoScool en cours d'utilisation (école de démonstration, données
fictives), filmées automatiquement puis intégrées dans des cadres ordinateur,
tablette et téléphone, avec zooms et textes animés. Site affiché à la fin :
www.neoscool.com.

Module scolaire : la tablette pointe le personnel (l'enseignant badge, son appel
s'ouvre) ; les parents sont prévenus quand l'appel validé signale une absence.

## Régénérer

```bash
cd marketing/videos
python3 scripts/promo-voice.py <dossier du modèle Kokoro>   # voix → public/voix/promo/
cp public/voix/promo/*.wav hyperframes/neoscool-90s/assets/audio/
python3 scripts/promo-music.py                             # musique + bruitages
node scripts/hf-icons.mjs                                  # icônes SVG (lucide)
# Vraies séquences du logiciel (appli lancée sur localhost:3000 + base de démo locale)
CHROMIUM_PATH=… DATABASE_URL=… node scripts/record-pages.mjs # → neoscool-90s/assets/ecrans/
cd hyperframes && npm install
cd neoscool-90s
npx hyperframes lint .
npx hyperframes snapshot . --at 4.5,22,46,88             # images de contrôle
npx hyperframes render -o ../../out/NeoScool-module-scolaire-90s.mp4
```

Prérequis : Node ≥ 22, FFmpeg, Chrome (ou `HYPERFRAMES_BROWSER_PATH`).
Textes de la voix off : `src/promo/script.json` ; minutage des scènes : attributs
`data-start` / `data-duration` de `neoscool-90s/index.html`.
