"use client";

import { ChevronDown } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Tooltip } from "radix-ui";
import { useState } from "react";

import { NavIcon } from "@/components/layout/nav-icon";
import type { NavItem, NavSection } from "@/config/navigation";
import { cn } from "@/lib/utils/cn";

/**
 * Navigation principale interactive : indicateur lumineux sur la page active,
 * icône animée au survol, sections repliables (chevron animé), mode réduit
 * (icônes seules) avec infobulles.
 */
export function SidebarNav({ sections, onNavigate, collapsed = false }: { sections: NavSection[]; onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const [closed, setClosed] = useState<Set<string>>(new Set());
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

  const toggle = (label: string) =>
    setClosed((cur) => {
      const next = new Set(cur);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  return (
    <Tooltip.Provider delayDuration={120} skipDelayDuration={0}>
      <nav aria-label="Navigation principale" className={cn("grid", collapsed ? "gap-2" : "gap-3")}>
        {sections.map((section) => {
          const hasActive = section.items.some((i) => i.href === activeHref);
          const open = collapsed || hasActive || !closed.has(section.label);
          return (
            <div key={section.label} className="grid">
              {collapsed ? (
                <span aria-hidden className="mx-auto my-1 h-px w-6 bg-sidebar-foreground/20" />
              ) : (
                <button
                  type="button"
                  onClick={() => toggle(section.label)}
                  aria-expanded={open}
                  className="group flex items-center justify-between rounded-md px-3 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground"
                >
                  {section.label}
                  <ChevronDown className={cn("size-3.5 transition-transform duration-300", !open && "-rotate-90")} aria-hidden />
                </button>
              )}
              <div className="collapsible" data-open={open}>
                <div className="grid gap-0.5">
                  {section.items.map((item) => (
                    <NavLink key={item.href} item={item} active={item.href === activeHref} collapsed={collapsed} onNavigate={onNavigate} />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </nav>
    </Tooltip.Provider>
  );
}

function NavLink({ item, active, collapsed, onNavigate }: { item: NavItem; active: boolean; collapsed: boolean; onNavigate?: () => void }) {
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex min-h-10 items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 ease-[var(--ease-out)]",
        collapsed ? "justify-center px-0" : "px-3",
        active
          ? "bg-gradient-to-r from-sidebar-active to-[#2f7cf6] text-sidebar-active-foreground shadow-[0_8px_20px_-10px_rgba(29,99,237,0.9)]"
          : "text-sidebar-foreground hover:bg-sidebar-muted hover:text-white",
      )}
    >
      {/* Indicateur lumineux de la page active */}
      <span
        aria-hidden
        className={cn(
          "absolute -left-4 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-accent shadow-[0_0_12px_rgba(245,158,11,0.9)] transition-all duration-300",
          active ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0",
        )}
      />
      <NavIcon
        name={item.icon}
        className={cn(
          "size-[18px] shrink-0 transition-transform duration-200 ease-[var(--ease-spring)]",
          active ? "scale-110" : "group-hover:-rotate-6 group-hover:scale-110",
        )}
      />
      {collapsed ? null : <span className={cn("flex-1 truncate transition-transform duration-200", !active && "group-hover:translate-x-0.5")}>{item.label}</span>}
      <PendingDot collapsed={collapsed} />
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="right" sideOffset={12} className="tooltip-anim z-50 rounded-lg bg-[#0b1f4d] px-2.5 py-1.5 text-xs font-medium text-white shadow-lg">
          {item.label}
          <Tooltip.Arrow className="fill-[#0b1f4d]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Indicateur de chargement du lien cliqué, pendant la navigation (sans casser les codes HTTP 403/404). */
function PendingDot({ collapsed }: { collapsed: boolean }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <span role="status" className={cn("size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80", collapsed && "absolute right-1 top-1 size-2.5")}>
      <span className="sr-only">Chargement…</span>
    </span>
  ) : null;
}
