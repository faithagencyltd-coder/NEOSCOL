# Vidéos Motion Design NeoScool

Trois vidéos (module scolaire, formation professionnelle, université / institut),
chacune en 16:9 (1920 × 1080) et en 9:16 (1080 × 1920), écrites avec
[Remotion](https://www.remotion.dev) (React). Toutes les interfaces montrées sont
des **captures réelles** de l'application en mode démonstration (données fictives).

## Fabrication

1. Application démarrée sur `http://localhost:3000` avec la base de démo
   (`supabase db reset`), puis captures réelles et documents PDF :
   `node marketing/videos/scripts/capture.mjs`
   puis rendu des PDF en images (PyMuPDF) :
   `python3 marketing/videos/scripts/pdf-to-png.py`.
2. Voix off française (synthèse neuronale Kokoro, voix `ff_siwis`) à partir de
   `src/voiceover.json` : `python3 scripts/voiceover.py <dossier du modèle Kokoro>`
   (fichiers `kokoro-v1.0.onnx` et `voices-v1.0.bin`). Les durées écrites dans
   `src/voix-durees.json` calent chaque scène sur sa phrase.
3. Musique originale (synthèse, sans extrait tiers) : `python3 scripts/music.py`.
4. Aperçu interactif : `npm run studio` ; rendu des 6 fichiers : `npm run render`
   (sortie dans `out/`).

Le texte de la voix off, les scènes et les captures utilisées sont modifiables
dans `src/voiceover.json` et `src/videos.ts`.
