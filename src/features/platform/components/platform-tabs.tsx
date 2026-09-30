"use client";

import { ArrowLeftRight, BadgePercent, Building2, CreditCard, Gem, Globe2, Layers, PlugZap, ShieldCheck, Sigma, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

const TABS = [
  { href: "/plateforme", label: "Établissements", icon: Building2 },
  { href: "/plateforme/abonnements", label: "Abonnements", icon: Gem },
  { href: "/plateforme/paiements", label: "Paiements", icon: CreditCard },
  { href: "/plateforme/paiements-en-ligne", label: "Paiements en ligne", icon: Wallet },
  { href: "/plateforme/formules", label: "Formules", icon: Layers },
  { href: "/plateforme/offres", label: "Offres", icon: BadgePercent },
  { href: "/plateforme/enseignants", label: "Enseignants multi-établissements", icon: Users },
  { href: "/plateforme/pays", label: "Pays", icon: Globe2 },
  { href: "/plateforme/regles", label: "Règles académiques", icon: Sigma },
  { href: "/plateforme/country-connect", label: "Country Connect", icon: ArrowLeftRight },
  { href: "/plateforme/integrations", label: "Intégrations", icon: PlugZap },
  { href: "/plateforme/securite", label: "Sécurité", icon: ShieldCheck },
];

export function PlatformTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Console de la plateforme" className="-mb-px flex gap-1 overflow-x-auto">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = href === "/plateforme" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-t-xl px-4 py-2.5 text-sm font-semibold transition-colors",
              active ? "bg-background text-foreground" : "text-white/75 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
