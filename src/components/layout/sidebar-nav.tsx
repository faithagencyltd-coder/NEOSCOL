"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { NavIcon } from "@/components/layout/nav-icon";
import type { NavSection } from "@/config/navigation";
import { cn } from "@/lib/utils/cn";

export function SidebarNav({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const search = useSearchParams();
  // L'entrée active est celle dont l'adresse correspond le plus précisément
  // (/personnel/pointage ≠ /personnel ; /finances?onglet=depenses ≠ /finances).
  const score = (href: string) => {
    const [path, query] = href.split("?");
    if (!(pathname === path || pathname.startsWith(`${path}/`))) return -1;
    if (!query) return path!.length;
    const wanted = new URLSearchParams(query);
    return [...wanted.entries()].every(([k, v]) => search.get(k) === v) ? path!.length + 1000 : -1;
  };
  const activeHref = sections
    .flatMap((section) => section.items.map((item) => item.href))
    .map((href) => ({ href, s: score(href) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)[0]?.href;
  return (
    <nav aria-label="Navigation principale" className="grid gap-4">
      {sections.map((section) => (
        <div key={section.label} className="grid gap-0.5">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
            {section.label}
          </p>
          {section.items.map((item) => {
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-sidebar-active text-sidebar-active-foreground shadow-sm"
                    : "text-sidebar-foreground hover:translate-x-0.5 hover:bg-sidebar-muted hover:text-white",
                )}
              >
                <NavIcon name={item.icon} className="size-[18px]" />
                <span className="flex-1">{item.label}</span>
                <PendingDot />
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Indicateur de chargement du lien cliqué, pendant la navigation (sans casser les codes HTTP 403/404). */
function PendingDot() {
  const { pending } = useLinkStatus();
  return pending ? (
    <span role="status" className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80">
      <span className="sr-only">Chargement…</span>
    </span>
  ) : null;
}
