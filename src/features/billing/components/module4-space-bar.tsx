import { Briefcase, Building2, GraduationCap, Lock, School } from "lucide-react";

import { switchOrganization } from "@/features/auth/actions";
import type { Module4Component } from "@/features/billing/constants";
import { module4Overview } from "@/features/billing/module4";
import { cn } from "@/lib/utils/cn";

export const COMPONENT_ICONS: Record<Module4Component, typeof School> = {
  school: School,
  training: Briefcase,
  university: GraduationCap,
};

/**
 * Module 4 : bascule entre l'établissement principal et ses espaces (école,
 * formation, université). Seuls les espaces dont l'utilisateur est membre sont
 * ouvrables ; l'adhésion est revérifiée côté serveur à la bascule.
 */
export async function Module4SpaceBar({ organizationId }: { organizationId: string }) {
  const overview = await module4Overview(organizationId);
  if (!overview) return null;
  const items = [
    { id: overview.group.id, name: overview.group.name, icon: Building2, member: overview.group.member, locked: false, label: "Établissement principal" },
    ...overview.spaces.map((s) => ({
      id: s.id,
      name: s.name,
      icon: COMPONENT_ICONS[s.component] ?? School,
      member: s.member,
      locked: s.access === "read_only",
      label: s.access === "read_only" ? "Lecture seule : domaine non inclus dans l'abonnement" : "Espace",
    })),
  ].filter((i) => i.member);
  if (items.length < 2) return null;
  return (
    <nav aria-label="Mes espaces" className="border-b border-border bg-surface/80">
      <ul className="mx-auto flex w-full max-w-[90rem] gap-2 overflow-x-auto px-4 py-2 sm:px-7">
        {items.map((item) => {
          const active = item.id === organizationId;
          const Icon = item.icon;
          return (
            <li key={item.id} className="shrink-0">
              <form action={switchOrganization}>
                <input type="hidden" name="organizationId" value={item.id} />
                <button
                  type="submit"
                  aria-current={active ? "page" : undefined}
                  title={item.label}
                  disabled={active}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                    active
                      ? "border-transparent bg-gradient-to-r from-[#0b2559] to-[#1d63ed] text-white shadow-sm"
                      : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  <span className="max-w-[16rem] truncate">{item.name}</span>
                  {item.locked ? <Lock className="size-3.5 text-warning" aria-label="Lecture seule" /> : null}
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
