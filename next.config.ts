import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import type { NextConfig } from "next";

// Version réellement construite (affichée et enregistrée par la console Super Admin › Maintenance).
function gitCommit(): string {
  const fromEnv = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? process.env.SOURCE_COMMIT;
  if (fromEnv) return fromEnv.slice(0, 12);
  try {
    return execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}
const appVersion = (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }).version;

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
  env: { APP_VERSION: appVersion, APP_COMMIT: gitCommit(), APP_BUILT_AT: new Date().toISOString() },
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
