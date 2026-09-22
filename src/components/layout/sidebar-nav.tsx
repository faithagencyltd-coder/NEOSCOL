"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavIcon } from "@/components/layout/nav-icon";
import type { NavSection } from "@/config/navigation";
import { cn } from "@/lib/utils/cn";

export function SidebarNav({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation principale" className="grid gap-5">
      {sections.map((section) => (
        <div key={section.label} className="grid gap-0.5">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
            {section.label}
          </p>
          {section.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-active text-sidebar-active-foreground shadow-sm"
                    : "text-sidebar-foreground hover:bg-sidebar-muted hover:text-white",
                )}
              >
                <NavIcon name={item.icon} className="size-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
