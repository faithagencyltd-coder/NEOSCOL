import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Justificatifs, photos et pièces jointes (5 Mo max côté base, D-15).
    serverActions: { bodySizeLimit: "6mb" },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Les PDF et fichiers peuvent être affichés en aperçu dans l'application elle-même (même origine uniquement).
      { source: "/api/documents/:path*", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
      { source: "/api/fichiers/:path*", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
    ];
  },
};

export default nextConfig;
