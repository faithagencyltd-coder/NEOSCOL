import { KeyRound } from "lucide-react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { UserMenu } from "@/components/layout/user-menu";
import { Logo } from "@/components/shared/logo";
import { InstallAppButton } from "@/components/shared/pwa";
import { PlatformTabs } from "@/features/platform/components/platform-tabs";
import { securityState } from "@/lib/auth/security";
import { requireSession } from "@/lib/auth/guards";
import { displayName } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** « NEOSCOOL Console » : application installable distincte (manifeste propre, portée /plateforme). */
export const metadata: Metadata = {
  title: { template: "%s · NEOSCOOL Console", default: "NEOSCOOL Console" },
  manifest: "/console.webmanifest",
  applicationName: "NEOSCOOL Console",
  appleWebApp: { capable: true, title: "NEOSCOOL Console", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/console-192.png" },
};
export const viewport: Viewport = { themeColor: "#07142b" };

/** Console du Super Administrateur NEOSCOOL (PLATFORM CONSOLE). */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const context = await requireSession();
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) notFound();
  const security = await securityState();
  return (
    <div className="min-h-dvh bg-background">
      <header className="bg-gradient-to-br from-[#07142b] via-[#0b2559] to-[#0e4a9a] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <Logo inverted tagline />
          <div className="flex items-center gap-2">
          <div className="hidden rounded-xl bg-white/95 px-1 text-foreground sm:block [&_p]:px-2 [&_p]:py-1 [&_p]:text-xs">
            <InstallAppButton label="Installer NEOSCOOL Console" appName="NEOSCOOL Console" />
          </div>
          <div className="rounded-xl bg-white text-foreground">
            <UserMenu name={displayName(context)} email={context.user.email} roleLabel="Super administrateur" organizations={context.organizations} activeOrganizationId={context.organization?.id ?? ""} />
          </div>
          </div>
        </div>
        <div className="mx-auto grid max-w-7xl gap-1 px-4 pt-2 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Platform console</p>
          <h1 className="text-3xl font-bold">Plateforme NEOSCOOL</h1>
          <p className="pb-4 text-white/75">Établissements, abonnements, paiements, formules, intégrations et sécurité. Les données de chaque établissement restent strictement séparées.</p>
          <PlatformTabs />
        </div>
      </header>
      {!security?.mfa_enrolled ? (
        <div role="alert" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-warning-soft px-4 py-2 text-center text-sm font-medium text-warning">
          <KeyRound className="size-4" aria-hidden /> Console non protégée par la double authentification : activez-la pour que votre mot de passe seul ne suffise jamais.
          <Link href="/securite" className="font-semibold underline-offset-4 hover:underline">
            Activer maintenant
          </Link>
        </div>
      ) : null}
      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}
