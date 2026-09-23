"use client";

import { Building2, Check, ChevronDown, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";

import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut, switchOrganization } from "@/features/auth/actions";
import type { OrganizationSummary } from "@/lib/auth/session";

export function UserMenu({
  name,
  email,
  roleLabel,
  organizations,
  activeOrganizationId,
  accountHref = "/mon-compte",
}: {
  name: string;
  email: string | null;
  roleLabel: string;
  organizations: OrganizationSummary[];
  activeOrganizationId: string;
  accountHref?: string;
}) {
  const [pending, startTransition] = useTransition();
  // Les actions sont appelées directement : un <form> dans un item de menu serait
  // démonté à la fermeture du menu, avant la soumission.
  const onSwitch = (organizationId: string) => {
    const formData = new FormData();
    formData.set("organizationId", organizationId);
    startTransition(() => switchOrganization(formData));
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-xl p-1 pr-2 hover:bg-surface-muted" aria-label="Menu du compte">
        <Avatar name={name} />
        <span className="hidden flex-col items-start leading-tight md:flex">
          <span className="max-w-44 truncate text-sm font-semibold">{name}</span>
          <span className="max-w-44 truncate text-xs text-muted-foreground">{roleLabel}</span>
        </span>
        <ChevronDown className="hidden size-4 text-muted-foreground md:block" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2.5 py-2">
          <p className="truncate text-sm font-medium">{name}</p>
          {email ? <p className="truncate text-xs text-muted-foreground">{email}</p> : null}
        </div>
        <DropdownMenuSeparator />
        {organizations.length > 1 ? (
          <>
            <DropdownMenuLabel>Établissement</DropdownMenuLabel>
            {organizations.map((organization) => (
              <DropdownMenuItem
                key={organization.id}
                disabled={pending}
                onSelect={() => organization.id !== activeOrganizationId && onSwitch(organization.id)}
              >
                <Building2 aria-hidden />
                <span className="flex-1 truncate">{organization.short_name ?? organization.name}</span>
                {organization.id === activeOrganizationId ? <Check className="text-primary" aria-label="Actif" /> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href={accountHref}>
            <UserRound aria-hidden /> Mon compte
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="text-danger" disabled={pending} onSelect={() => startTransition(() => signOut())}>
          <LogOut aria-hidden /> Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
