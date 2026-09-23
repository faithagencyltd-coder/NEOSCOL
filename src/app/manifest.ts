import type { MetadataRoute } from "next";

/** Manifeste PWA : NéoScol s'installe sur ordinateur, tablette et téléphone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NéoScol — Gestion scolaire et de formation",
    short_name: "NéoScol",
    description: "Plus qu'un logiciel, une vision pour l'éducation.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#07142b",
    theme_color: "#0b2559",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Tableau de bord", url: "/tableau-de-bord" },
      { name: "Espace famille", url: "/portail" },
      { name: "Mes cours", url: "/mes-cours" },
      { name: "Tablette de pointage", url: "/pointage" },
    ],
  };
}
