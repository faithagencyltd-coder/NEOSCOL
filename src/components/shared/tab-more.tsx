"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";

import type { TabLink } from "./tab-nav";

/** Onglets secondaires regroupés dans « Plus » (évite la barre de défilement). */
export function TabMore({ tabs, active }: { tabs: TabLink[]; active: string }) {
  const current = tabs.find((t) => t.key === active);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "group relative flex h-11 shrink-0 items-center gap-1.5 rounded-t-lg px-3.5 text-sm outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary/30",
          current ? "font-semibold text-primary" : "text-muted-foreground hover:bg-surface-muted/60 hover:text-foreground",
        )}
        data-testid="tab-more"
      >
        {current ? current.label : "Plus"}
        <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
        {current ? <span aria-hidden className="absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-primary" /> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70dvh] overflow-y-auto">
        {tabs.map((t) => (
          <DropdownMenuItem key={t.key} asChild>
            <Link href={t.href} scroll={false} aria-current={t.key === active ? "page" : undefined} className={cn("justify-between", t.key === active && "font-semibold text-primary")}>
              {t.label}
              {t.count !== undefined ? <span className="rounded-full bg-surface-muted px-1.5 text-xs">{t.count}</span> : null}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
