# Vidéos HyperFrames NeoScool

Projet [HyperFrames](https://github.com/heygen-com/hyperframes) (HeyGen) :
des vidéos écrites en **HTML + CSS + GSAP** et rendues en MP4 de façon
déterministe. Il complète le projet Remotion voisin (`marketing/videos`).

## Prérequis

- Node.js 22+ et FFmpeg.
- Chrome pour le rendu : `npx hyperframes@0.8.140 browser ensure` (téléchargé une fois).
- Diagnostic complet : `npx hyperframes@0.8.140 doctor`.

## Commandes

```bash
cd marketing/hyperframes
npm run dev      # aperçu interactif (Studio) dans le navigateur
npm run check    # lint + exécution + mise en page + mouvement + contraste
npm run render   # rendu MP4 dans renders/
```

La composition principale est `index.html` (actuellement un titre de test de
4 s). GSAP est servi localement depuis `assets/vendor/` plutôt que depuis un
CDN, pour que le rendu fonctionne hors ligne et reste identique dans le temps.

## Avec un agent IA (Claude Code)

Les 21 skills HyperFrames sont installés dans le dépôt (`.claude/skills/`,
versions figées dans `skills-lock.json`). Commencer par `/hyperframes`, par
exemple :

> Avec `/hyperframes`, crée une intro de 15 secondes pour NeoScool.

Mise à jour des skills : `npx skills update -p` depuis la racine du dépôt.
