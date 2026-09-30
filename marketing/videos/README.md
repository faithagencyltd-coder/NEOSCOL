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

## Film officiel « Le fil NeoScool » (module scolaire)

Une journée d'école racontée en 20 scènes, uniquement avec des fonctions
présentes dans l'application et des captures réelles (établissement de
démonstration, données fictives). Aucune personne n'est inventée : les plans
filmés prévus au dossier s'intercaleront au montage ; en attendant, chaque moment
est annoncé par l'heure, le lieu et l'acteur.

| Composition | Format | Durée |
| --- | --- | --- |
| `film-scolaire-16x9` | 1920 × 1080 | ≈ 3 min (20 scènes) |
| `film-60s-16x9` / `film-60s-9x16` | 16:9 / 9:16 | ≈ 60 s |
| `film-30s-16x9` / `film-30s-9x16` | 16:9 / 9:16 | ≈ 30 s |
| `logo-6s-16x9` / `logo-6s-9x16` | 16:9 / 9:16 | 6 s |
| `logo-2s-16x9` | 16:9 | 2 s |

1. Captures complémentaires (base de démo fraîche) :
   `node marketing/videos/scripts/capture-film.mjs` (après `capture.mjs`).
2. Voix off : texte dans `src/film/script.json`, synthèse
   `python3 scripts/film-voice.py <dossier du modèle Kokoro>` (écrit
   `public/voix/film/` et `src/film/durees.json`).
3. Musique et effets sonores originaux : `python3 scripts/film-music.py`.
4. Montage : storyboard et versions courtes dans `src/film/cuts.json`, contenu
   des scènes dans `src/film/scenes.ts`, animation dans `src/film/Film.tsx`.
   Rendu de toutes les versions : `npm run render:film` (sortie dans `out/`).
