import { notFound } from "next/navigation";

import { UserMenu } from "@/components/layout/user-menu";
import { Logo } from "@/components/shared/logo";
import { PlatformTabs } from "@/features/platform/components/platform-tabs";
import { requireSession } from "@/lib/auth/guards";
import { displayName } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** Console du Super Administrateur NéoScol (PLATFORM CONSOLE). */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const context = await requireSession();
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) notFound();
  return (
    <div className="min-h-dvh bg-background">
      <header className="bg-gradient-to-br from-[#07142b] via-[#0b2559] to-[#0e4a9a] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <Logo inverted tagline />
          <div className="rounded-xl bg-white text-foreground">
            <UserMenu name={displayName(context)} email={context.user.email} roleLabel="Super administrateur" organizations={context.organizations} activeOrganizationId={context.organization?.id ?? ""} />
          </div>
        </div>
        <div className="mx-auto grid max-w-7xl gap-1 px-4 pt-2 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Platform console</p>
          <h1 className="text-3xl font-bold">Plateforme NéoScol</h1>
          <p className="pb-4 text-white/75">Établissements, abonnements, paiements et formules. Les données de chaque établissement restent strictement séparées.</p>
          <PlatformTabs />
        </div>
      </header>
      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}
