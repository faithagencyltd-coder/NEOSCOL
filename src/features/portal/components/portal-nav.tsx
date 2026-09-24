"use client";

import { CalendarClock, ClipboardCheck, House, LayoutGrid, NotebookPen, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

type Item = { href: string; label: string; icon: LucideIcon };

const HOME: Item = { href: "/portail", label: "Accueil", icon: House };
const ATTENDANCE: Item = { href: "/portail/presences", label: "Présences", icon: ClipboardCheck };
const GRADES: Item = { href: "/portail/notes", label: "Notes", icon: NotebookPen };
const FINANCE: Item = { href: "/portail/finances", label: "Finances", icon: Wallet };
const TIMETABLE: Item = { href: "/portail/emploi-du-temps", label: "Horaires", icon: CalendarClock };
const MORE: Item = { href: "/portail/plus", label: "Plus", icon: LayoutGrid };

export function portalItems(parent: boolean): Item[] {
  return parent ? [HOME, ATTENDANCE, GRADES, FINANCE, MORE] : [HOME, TIMETABLE, ATTENDANCE, GRADES, MORE];
}

function isActive(pathname: string, href: string) {
  return href === "/portail" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** Navigation du portail : barre d'onglets en bas sur téléphone, onglets en haut sur écran large. */
export function PortalNav({ parent }: { parent: boolean }) {
  const pathname = usePathname();
  const items = portalItems(parent);
  return (
    <>
      <nav aria-label="Portail" className="hidden border-b border-border bg-surface md:block">
        <ul className="mx-auto flex max-w-4xl gap-1 px-4">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-2 px-3 py-3 text-sm font-medium transition-colors duration-200",
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4 transition-transform duration-200 group-hover:scale-110" aria-hidden />
                  {item.label}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-primary transition-transform duration-300 ease-[var(--ease-out)]",
                      active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-50 group-hover:bg-primary/40",
                    )}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <nav
        aria-label="Portail"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-5">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-200 active:scale-95",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-12 items-center justify-center rounded-full transition-all duration-300 ease-[var(--ease-spring)]",
                      active ? "scale-100 bg-primary-soft" : "scale-90 bg-transparent",
                    )}
                  >
                    <item.icon className={cn("size-5 transition-transform duration-300", active && "anim-pop")} aria-hidden />
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
