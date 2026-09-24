import { ViewTransition, type ReactNode } from "react";

/**
 * Transition de page : l'ancien contenu s'efface vite, le nouveau glisse vers
 * le haut en fondu (classes .page-exit / .page-enter du design system).
 * À placer dans un template.tsx (remonté à chaque navigation).
 */
export function AnimatedPage({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      {children}
    </ViewTransition>
  );
}

/** Fondu enchaîné lors d'un changement d'onglet (clé = onglet actif). */
export function AnimatedSwap({ swapKey, children }: { swapKey: string; children: ReactNode }) {
  return (
    <ViewTransition key={swapKey} enter="tab-swap" exit="tab-swap" default="none">
      {children}
    </ViewTransition>
  );
}
