"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Compte une page vue du site public (aucun cookie ; voir /api/site/visite). */
export function VisitBeacon({ locale }: { locale: "fr" | "en" }) {
  const pathname = usePathname();
  useEffect(() => {
    const payload = JSON.stringify({ path: pathname, referrer: document.referrer, locale });
    try {
      if (!navigator.sendBeacon?.("/api/site/visite", new Blob([payload], { type: "application/json" }))) {
        void fetch("/api/site/visite", { method: "POST", body: payload, headers: { "Content-Type": "application/json" }, keepalive: true });
      }
    } catch {
      // Mesure facultative : jamais bloquante.
    }
  }, [pathname, locale]);
  return null;
}
