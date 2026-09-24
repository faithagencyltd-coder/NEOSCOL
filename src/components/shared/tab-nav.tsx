import Link from "next/link";
import type { ReactNode } from "react";

import { AnimatedSwap } from "@/components/motion/animated-page";
import { cn } from "@/lib/utils/cn";

export type TabLink = { key: string; label: string; href: string; count?: number };

/**
 * Onglets (AnimatedTabs) : l'onglet actif est dans l'URL ; barre de sélection
 * animée, survol, défilement horizontal sur mobile. Le contenu associé se
 * place dans <TabPanel> pour un fondu enchaîné sans rechargement brutal.
 */
export function TabNav({ tabs, active, label }: { tabs: TabLink[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="-mb-px flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            scroll={false}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "group relative flex h-11 shrink-0 items-center gap-2 rounded-t-lg px-3.5 text-sm transition-colors duration-200",
              selected ? "font-semibold text-primary" : "text-muted-foreground hover:bg-surface-muted/60 hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className={cn("rounded-full px-1.5 text-xs transition-colors", selected ? "bg-primary-soft" : "bg-surface-muted")}>{tab.count}</span>
            ) : null}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-primary transition-transform duration-300 ease-[var(--ease-out)]",
                selected ? "scale-x-100" : "scale-x-0 group-hover:scale-x-50 group-hover:bg-primary/40",
              )}
              style={selected ? { animation: "grow-width 320ms var(--ease-out) both" } : undefined}
            />
          </Link>
        );
      })}
    </nav>
  );
}

/** Contenu d'onglet : fondu enchaîné lors du changement d'onglet. */
export function TabPanel({ active, children }: { active: string; children: ReactNode }) {
  return <AnimatedSwap swapKey={active}>{children}</AnimatedSwap>;
}
