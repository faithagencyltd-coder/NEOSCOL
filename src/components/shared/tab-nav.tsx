import Link from "next/link";

import { cn } from "@/lib/utils/cn";

export type TabLink = { key: string; label: string; href: string; count?: number };

/** Onglets par liens (l'onglet actif est dans l'URL). Défile horizontalement sur mobile. */
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
              "flex h-11 shrink-0 items-center gap-2 border-b-[3px] px-3.5 text-sm transition-colors",
              selected ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className={cn("rounded-full px-1.5 text-xs", selected ? "bg-primary-soft" : "bg-surface-muted")}>{tab.count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
