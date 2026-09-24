"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState, type ReactNode } from "react";

import { SidebarNav } from "@/components/layout/sidebar-nav";
import { Logo, LogoMark } from "@/components/shared/logo";
import type { NavSection } from "@/config/navigation";
import { SIDEBAR_COOKIE } from "@/config/ui";
import { cn } from "@/lib/utils/cn";

/**
 * Coque de l'application : barre latérale (complète ou réduite, mémorisée
 * dans un cookie pour un premier rendu sans saut) et zone de contenu.
 */
export function AppShell({
  sections,
  initialCollapsed,
  organization,
  children,
}: {
  sections: NavSection[];
  initialCollapsed: boolean;
  organization: { name: string; isDemo: boolean };
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <div className={cn("app-shell min-h-dvh lg:grid", collapsed ? "lg:grid-cols-[5.25rem_1fr]" : "lg:grid-cols-[17rem_1fr]")}>
      <aside className={cn("sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto overflow-x-hidden bg-sidebar py-5 lg:flex", collapsed ? "px-3" : "px-4")}>
        <div className={cn("flex items-center", collapsed ? "justify-center" : "px-1.5")}>
          {collapsed ? <LogoMark inverted className="size-11" /> : <Logo inverted tagline />}
        </div>
        <SidebarNav sections={sections} collapsed={collapsed} />
        <div className="mt-auto grid gap-2">
          {collapsed ? null : (
            <div className="anim-fade grid gap-1 rounded-xl bg-sidebar-muted p-3.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/70">Établissement</p>
              <p className="text-sm font-semibold text-white" title={organization.name}>
                {organization.name}
              </p>
              {organization.isDemo ? <p className="text-xs font-medium text-accent">Démonstration · données fictives</p> : null}
            </div>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-pressed={collapsed}
            className={cn(
              "flex h-10 items-center gap-2.5 rounded-xl text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-muted hover:text-white",
              collapsed ? "justify-center" : "px-3",
            )}
          >
            {collapsed ? <PanelLeftOpen className="size-[18px]" aria-hidden /> : <PanelLeftClose className="size-[18px]" aria-hidden />}
            <span className={collapsed ? "sr-only" : undefined}>{collapsed ? "Déplier le menu" : "Réduire le menu"}</span>
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">{children}</div>
    </div>
  );
}
