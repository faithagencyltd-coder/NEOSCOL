/**
 * Manifeste de « NéoScol Console » : application installable distincte
 * (identifiant, portée /plateforme, icône et fenêtre propres) pour le
 * Super Administrateur. Mises à jour automatiques : c'est le site lui-même.
 * Aucune donnée n'est stockée sur l'ordinateur (le service worker ne met
 * jamais en cache les pages de la console).
 */
export function GET() {
  return Response.json(
    {
      id: "/plateforme",
      name: "NéoScol Console — Super Administration",
      short_name: "NéoScol Console",
      description: "Centre de contrôle de la plateforme NéoScol : établissements, abonnements, paiements, intégrations, sécurité.",
      lang: "fr",
      start_url: "/plateforme",
      scope: "/plateforme",
      display: "standalone",
      display_override: ["window-controls-overlay", "standalone"],
      orientation: "any",
      background_color: "#07142b",
      theme_color: "#07142b",
      categories: ["business", "productivity", "education"],
      icons: [
        { src: "/icons/console-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/console-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/console-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
      shortcuts: [
        { name: "Établissements", url: "/plateforme" },
        { name: "Abonnements", url: "/plateforme/abonnements" },
        { name: "Intégrations", url: "/plateforme/integrations" },
        { name: "Sécurité", url: "/plateforme/securite" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
