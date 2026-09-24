import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

// GitHub Codespaces : l'application est servie via https://<codespace>-3000.app.github.dev.
// Autorisé uniquement quand le serveur tourne dans un Codespace (variable CODESPACES).
const codespaceOrigins = process.env.CODESPACES === "true" ? [`*.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? "app.github.dev"}`] : [];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Paquet portable (scripts/portable) : serveur autonome sans dépendances à installer.
  output: process.env.NEOSCOL_STANDALONE === "1" ? "standalone" : undefined,
  allowedDevOrigins: codespaceOrigins,
  experimental: {
    // Justificatifs, photos et pièces jointes (5 Mo max côté base, D-15).
    serverActions: { bodySizeLimit: "6mb", allowedOrigins: codespaceOrigins },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Les PDF et fichiers peuvent être affichés en aperçu dans l'application elle-même (même origine uniquement).
      { source: "/api/documents/:path*", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
      { source: "/api/fichiers/:path*", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
