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

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await requireOrganization();
  const sections = visibleNavigation(context.permissions);
  const notifications = await getRecentNotifications(context.organization.id);
  const name = displayName(context);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-8 overflow-y-auto bg-sidebar p-4 lg:flex">
        <div className="px-2 pt-1">
          <Logo inverted />
        </div>
        <div className="rounded-lg bg-sidebar-active/60 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wider text-sidebar-foreground/70">Établissement</p>
          <p className="truncate text-sm font-medium text-white" title={context.organization.name}>
            {context.organization.short_name ?? context.organization.name}
          </p>
        </div>
        <SidebarNav sections={sections} />
      </aside>

      <div className="flex min-w-0 flex-col">
        {context.organization.is_demo ? (
          <div className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-1.5 text-center text-xs font-medium text-warning">
            <FlaskConical className="size-3.5" aria-hidden />
            Établissement de démonstration — toutes les données affichées sont fictives.
          </div>
        ) : null}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-surface/90 px-3 backdrop-blur sm:gap-4 sm:px-6">
          <MobileNav sections={sections} organizationName={context.organization.name} />
          <div className="min-w-0 flex-1">
            <CommandPalette sections={sections} />
          </div>
          <NotificationsMenu
            items={notifications.items}
            unread={notifications.unread}
            timezone={context.organization.timezone}
          />
          <UserMenu
            name={name}
            email={context.user.email}
            organizations={context.organizations}
            activeOrganizationId={context.organization.id}
          />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
