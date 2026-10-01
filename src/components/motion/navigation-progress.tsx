"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Barre de progression fine en haut de l'écran pendant un changement de page
 * (liens internes) : retour immédiat au clic, même sur une connexion lente.
 * Elle disparaît dès que la nouvelle page s'affiche (adresse différente).
 * Mouvement réduit : la barre apparaît sans animation de progression.
 */
export function NavigationProgress() {
  const route = `${usePathname()}?${useSearchParams().toString()}`;
  // Adresse de la page quittée ; la barre reste visible tant qu'elle est affichée.
  const [leaving, setLeaving] = useState<string | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const a = (event.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      const from = `${window.location.pathname}?${new URLSearchParams(window.location.search).toString()}`;
      setLeaving(from);
      // Sécurité : redirection vers la même page ou navigation annulée → la barre ne reste pas.
      window.setTimeout(() => setLeaving((current) => (current === from ? null : current)), 10000);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (leaving !== route) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]">
      <div className="nav-progress-run h-full bg-gradient-to-r from-primary via-sky-400 to-primary" />
    </div>
  );
}
