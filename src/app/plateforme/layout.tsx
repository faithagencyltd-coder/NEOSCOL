import { KeyRound } from "lucide-react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { UserMenu } from "@/components/layout/user-menu";
import { InstallAppButton } from "@/components/shared/pwa";
import { PlatformFrame } from "@/features/platform/components/platform-frame";
import { getPlatformRole, PLATFORM_ROLE_LABELS } from "@/lib/auth/platform";
import { securityState } from "@/lib/auth/security";
import { maintenanceState } from "@/lib/maintenance";
import { requireSession } from "@/lib/auth/guards";
import { displayName } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** « NeoScool Console » : application installable distincte (manifeste propre, portée /plateforme). */
export const metadata: Metadata = {
  title: { template: "%s · NeoScool Console", default: "NeoScool Console" },
  manifest: "/console.webmanifest",
  applicationName: "NeoScool Console",
  appleWebApp: { capable: true, title: "NeoScool Console", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/console-192.png" },
};
export const viewport: Viewport = { themeColor: "#07142b" };

/** Console du Super Administrateur NeoScool (PLATFORM CONSOLE). */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const context = await requireSession();
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) notFound();
  const [security, role, maintenance, { count: openTickets }] = await Promise.all([
    securityState(),
    getPlatformRole(),
    maintenanceState(),
    supabase.from("support_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
  ]);
  const roleLabel = role && role !== "owner" ? `Super Admin — ${PLATFORM_ROLE_LABELS[role]}` : "Super administrateur";
  const banners = (
    <>
      {maintenance ? (
        <div role="status" className="bg-warning-soft px-4 py-2 text-center text-sm font-medium text-warning" data-testid="maintenance-banner">
          Mode maintenance actif : les établissements voient l&apos;écran de maintenance. Vous gardez l&apos;accès pour vérifier.{" "}
          <Link href="/plateforme/maintenance" className="font-semibold underline-offset-4 hover:underline">
            Gérer
          </Link>
        </div>
      ) : null}
      {role === "viewer" ? (
        <div role="status" className="bg-info-soft px-4 py-2 text-center text-sm font-medium text-info" data-testid="viewer-banner">
          Accès en lecture seule : vous consultez la console, aucune modification n&apos;est possible (garanti par la base de données).
        </div>
      ) : null}
      {!security?.mfa_enrolled ? (
        <div role="alert" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-warning-soft px-4 py-2 text-center text-sm font-medium text-warning">
          <KeyRound className="size-4" aria-hidden /> Console non protégée par la double authentification : activez-la pour que votre mot de passe seul ne suffise jamais.
          <Link href="/securite" className="font-semibold underline-offset-4 hover:underline">
            Activer maintenant
          </Link>
        </div>
      ) : null}
    </>
  );
  return (
    <PlatformFrame
      roleLabel={roleLabel}
      openTickets={openTickets ?? 0}
      banners={banners}
      installButton={
        <div className="rounded-xl bg-white/95 text-foreground [&_p]:px-2 [&_p]:py-1 [&_p]:text-xs">
          <InstallAppButton label="Installer NeoScool Console" appName="NeoScool Console" />
        </div>
      }
      userMenu={
        <div className="rounded-xl border border-border bg-surface text-foreground">
          <UserMenu name={displayName(context)} email={context.user.email} roleLabel={roleLabel} organizations={context.organizations} activeOrganizationId={context.organization?.id ?? ""} />
        </div>
      }
    >
      {children}
    </PlatformFrame>
  );
}
