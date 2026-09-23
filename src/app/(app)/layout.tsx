import { FlaskConical } from "lucide-react";

import { CommandPalette } from "@/components/layout/command-palette";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { Logo } from "@/components/shared/logo";
import { visibleNavigation } from "@/config/navigation";
import { getRecentNotifications } from "@/features/notifications/queries";
import { requireOrganization } from "@/lib/auth/guards";
import { displayName } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo";
import { vocabularyFor } from "@/lib/vocabulary";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await requireOrganization();
  const demo = isDemoMode() && context.organization.is_demo;
  const sections = visibleNavigation(context.permissions, { demo, organizationType: context.organization.type });
  const notifications = await getRecentNotifications(context.organization.id);
  const name = displayName(context);
  const roleLabel = context.roleNames.join(" · ") || "Membre";
  const vocab = vocabularyFor(context.organization.type);
  const searchPlaceholder = `Rechercher un ${vocab.student.toLowerCase()}, un parent, une ${vocab.klass.toLowerCase()}…`;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-7 overflow-y-auto bg-sidebar px-4 py-5 lg:flex">
        <div className="px-1.5">
          <Logo inverted tagline />
        </div>
        <SidebarNav sections={sections} />
        <div className="mt-auto grid gap-1 rounded-xl bg-sidebar-muted p-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/70">Établissement</p>
          <p className="text-sm font-semibold text-white" title={context.organization.name}>
            {context.organization.name}
          </p>
          {context.organization.is_demo ? (
            <p className="text-xs font-medium text-accent">Démonstration · données fictives</p>
          ) : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {context.organization.is_demo ? (
          <div className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-1.5 text-center text-xs font-medium text-warning lg:hidden">
            <FlaskConical className="size-3.5" aria-hidden />
            Établissement de démonstration — données fictives.
          </div>
        ) : null}
        <header className="sticky top-0 z-30 flex h-[72px] items-center gap-2 border-b border-border bg-surface/95 px-3 backdrop-blur sm:gap-3 sm:px-7">
          <MobileNav sections={sections} organizationName={context.organization.name} />
          <div className="min-w-0 flex-1">
            <CommandPalette sections={sections} placeholder={searchPlaceholder} />
          </div>
          <NotificationsMenu
            items={notifications.items}
            unread={notifications.unread}
            timezone={context.organization.timezone}
          />
          <UserMenu
            name={name}
            email={context.user.email}
            roleLabel={roleLabel}
            organizations={context.organizations}
            activeOrganizationId={context.organization.id}
            demo={demo}
          />
        </header>
        <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-6 sm:px-7 lg:py-7">{children}</main>
      </div>
    </div>
  );
}
