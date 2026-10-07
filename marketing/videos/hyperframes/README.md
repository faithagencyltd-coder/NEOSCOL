# Vidéo motion design « NeoScool — module scolaire » (90 s) — HyperFrames

Composition HTML + GSAP rendue par [HyperFrames](https://hyperframes.heygen.com) :
11 scènes (chaos → plateforme unique → inscription → arrivée → classe → bulletins →
caisse → familles → documents → pilotage → signature), éléments 100 % animés
(cartes en verre, icônes, téléphones, tablette, documents, graphiques, particules),
aucune capture d'écran.

## Régénérer

```bash
cd marketing/videos
python3 scripts/promo-voice.py <dossier du modèle Kokoro>   # voix → public/voix/promo/
cp public/voix/promo/*.wav hyperframes/neoscool-90s/assets/audio/
python3 scripts/promo-music.py                             # musique + bruitages
node scripts/hf-icons.mjs                                  # icônes SVG (lucide)
cd hyperframes && npm install
cd neoscool-90s
npx hyperframes lint .
npx hyperframes snapshot . --at 4.5,22,46,88             # images de contrôle
npx hyperframes render -o ../../out/NeoScool-module-scolaire-90s.mp4
```

Prérequis : Node ≥ 22, FFmpeg, Chrome (ou `HYPERFRAMES_BROWSER_PATH`).
Textes de la voix off : `src/promo/script.json` ; minutage des scènes : attributs
`data-start` / `data-duration` de `neoscool-90s/index.html`.
