"use client";

import { Bell, ChevronDown, Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Logo } from "@/components/shared/logo";
import {
  currentNav,
  isNavActive,
  PLATFORM_NAV,
} from "@/features/platform/components/platform-nav";
import { cn } from "@/lib/utils/cn";

/**
 * Cadre de la console Super Admin : barre latérale regroupée par domaine (repliable
 * groupe par groupe, tiroir sur mobile), barre du haut (fil d'Ariane, recherche de
 * comptes, demandes d'assistance ouvertes, compte). Présentation uniquement.
 */
export function PlatformFrame({
  roleLabel,
  userMenu,
  installButton,
  openTickets,
  banners,
  children,
}: {
  roleLabel: string;
  userMenu: ReactNode;
  installButton?: ReactNode;
  openTickets: number;
  banners?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const here = currentNav(pathname);

  return (
    <div className="min-h-dvh bg-[#f4f7fc] dark:bg-background">
      {/* Fond assombri du tiroir (mobile) */}
      {open ? (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-[#07142b]/50 backdrop-blur-[2px] lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-gradient-to-b from-[#07142b] via-[#0a1d45] to-[#0b2559] text-white shadow-2xl transition-transform duration-300 lg:translate-x-0 lg:shadow-none",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Navigation de la console"
      >
        <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-4">
          <Link
            href="/plateforme"
            onClick={() => setOpen(false)}
            aria-label="Tableau de bord de la console"
          >
            <Logo inverted tagline />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 lg:hidden"
            aria-label="Fermer le menu"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="mx-5 mb-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-300">
            NeoScool Console
          </p>
          <p className="truncate text-sm font-medium text-white/90">
            {roleLabel}
          </p>
        </div>

        <nav
          aria-label="Console de la plateforme"
          className="flex-1 overflow-y-auto px-3 pb-4 [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin]"
        >
          {PLATFORM_NAV.map((group) => {
            const hasActive = group.items.some((i) =>
              isNavActive(i.href, pathname),
            );
            const isCollapsed = collapsed[group.label] && !hasActive;
            return (
              <div key={group.label} className="mt-3 first:mt-0">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((c) => ({
                      ...c,
                      [group.label]: !c[group.label],
                    }))
                  }
                  aria-expanded={!isCollapsed}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-white/45 hover:text-white/75"
                >
                  <span className="truncate">{group.label}</span>
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      isCollapsed && "-rotate-90",
                    )}
                    aria-hidden
                  />
                </button>
                {!isCollapsed ? (
                  <ul className="mt-0.5 grid gap-0.5">
                    {group.items.map(({ href, label, icon: Icon, badge }) => {
                      const active = isNavActive(href, pathname);
                      return (
                        <li key={href}>
                          <Link
                            href={href}
                            onClick={() => setOpen(false)}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                              active
                                ? "bg-gradient-to-r from-[#1d63ed] to-[#2f7bff] text-white shadow-[0_8px_20px_-10px_rgba(29,99,237,0.9)]"
                                : "text-white/72 hover:bg-white/[0.07] hover:text-white",
                            )}
                          >
                            <Icon
                              className={cn(
                                "size-[18px] shrink-0",
                                active
                                  ? "text-white"
                                  : "text-white/55 group-hover:text-cyan-200",
                              )}
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1 truncate" title={label}>{label}</span>
                            {badge ? (
                              <span className="rounded-full bg-[#f59e0b] px-1.5 py-0.5 text-[10px] font-bold leading-none text-[#07142b]">
                                {badge}
                              </span>
                            ) : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </nav>
        {installButton ? (
          <div className="border-t border-white/10 p-3 [&_button]:w-full">
            {installButton}
          </div>
        ) : null}
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-border/70 bg-white/85 backdrop-blur-md dark:bg-surface/85">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-lg p-2 text-foreground hover:bg-surface-muted lg:hidden"
              aria-label="Ouvrir le menu"
            >
              <Menu className="size-5" aria-hidden />
            </button>
            <div className="hidden min-w-0 md:block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {here?.group ?? "Console"}
              </p>
              <p className="truncate text-sm font-semibold text-foreground">
                {here?.item.label ?? "Plateforme NeoScool"}
              </p>
            </div>
            <form
              action="/plateforme/comptes"
              role="search"
              className="mx-auto flex w-full max-w-md items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15"
            >
              <Search
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <input
                name="q"
                placeholder="Rechercher un compte…"
                title="Nom, e-mail ou téléphone"
                aria-label="Rechercher un compte"
                className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
              />
            </form>
            <div className="flex items-center gap-2">
              <Link
                href="/plateforme/incidents"
                className="relative rounded-xl p-2 text-foreground hover:bg-surface-muted"
                aria-label={`Demandes d'assistance ouvertes : ${openTickets}`}
              >
                <Bell className="size-5" aria-hidden />
                {openTickets ? (
                  <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-white">
                    {openTickets > 99 ? "99+" : openTickets}
                  </span>
                ) : null}
              </Link>
              {userMenu}
            </div>
          </div>
        </header>
        {banners}
        <main className="mx-auto grid w-full max-w-[1400px] gap-6 px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
