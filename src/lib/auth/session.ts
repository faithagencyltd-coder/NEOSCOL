import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { isPermission, type Permission } from "@/config/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export const ACTIVE_ORG_COOKIE = "neoscol_org";

export type Persona = "staff" | "teacher" | "parent" | "student";

export type OrganizationSummary = Pick<
  Tables<"organizations">,
  "id" | "name" | "short_name" | "code" | "type" | "currency" | "locale" | "timezone" | "is_demo" | "settings"
>;

export type SessionContext = {
  user: { id: string; email: string | null; phone: string | null };
  profile: Tables<"profiles"> | null;
  organizations: OrganizationSummary[];
  organization: OrganizationSummary | null;
  permissions: ReadonlySet<Permission>;
  personas: ReadonlySet<Persona>;
  /** Libellés des rôles dans l'établissement actif (ex. « Direction »). */
  roleNames: string[];
};

/**
 * Contexte de l'utilisateur courant, calculé une fois par requête.
 * Renvoie null si aucune session valide.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) {
    return null;
  }
  const user = userData.user;

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("memberships")
      .select(
        "status, organization:organizations(id, name, short_name, code, type, currency, locale, timezone, is_demo, settings), membership_roles(role:roles(persona, name))",
      )
      .eq("user_id", user.id)
      .eq("status", "active"),
  ]);

  const active = (memberships ?? []).filter(
    (m): m is typeof m & { organization: OrganizationSummary } => m.organization !== null,
  );
  const organizations = active.map((m) => m.organization).sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const cookieStore = await cookies();
  const preferredId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? profile?.last_organization_id ?? null;
  const organization =
    (profile?.is_active === false ? null : organizations.find((o) => o.id === preferredId) ?? organizations[0]) ?? null;

  let permissions = new Set<Permission>();
  let personas = new Set<Persona>();
  let roleNames: string[] = [];
  if (organization) {
    const { data: codes } = await supabase.rpc("my_permissions", { p_org: organization.id });
    permissions = new Set((codes ?? []).filter(isPermission));
    const membership = active.find((m) => m.organization.id === organization.id);
    personas = new Set(
      (membership?.membership_roles ?? [])
        .map((mr) => mr.role?.persona)
        .filter((p): p is Persona => p === "staff" || p === "teacher" || p === "parent" || p === "student"),
    );
    roleNames = (membership?.membership_roles ?? [])
      .map((mr) => mr.role?.name)
      .filter((name): name is string => Boolean(name));
  }

  return {
    user: { id: user.id, email: user.email ?? null, phone: user.phone ?? null },
    profile: profile ?? null,
    organizations,
    organization,
    permissions,
    personas,
    roleNames,
  };
});

export function can(context: SessionContext, permission: Permission): boolean {
  return context.permissions.has(permission);
}

export function canAny(context: SessionContext, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => context.permissions.has(permission));
}

export function displayName(context: SessionContext): string {
  const first = context.profile?.first_name?.trim();
  const last = context.profile?.last_name?.trim();
  if (first || last) {
    return [first, last].filter(Boolean).join(" ");
  }
  return context.user.email ?? context.user.phone ?? "Utilisateur";
}
