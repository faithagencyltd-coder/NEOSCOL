"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Compte la consultation d'un module de l'application (établissement et compte lus côté serveur). */
export function AppUsageBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      void fetch("/api/analytics/app", { method: "POST", body: JSON.stringify({ path: pathname }), headers: { "Content-Type": "application/json" }, keepalive: true });
    } catch {
      // Mesure facultative : jamais bloquante.
    }
  }, [pathname]);
  return null;
}
