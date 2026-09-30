import { FlaskConical, Landmark } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";

import { CommandPalette } from "@/components/layout/command-palette";
import { AppShell } from "@/components/layout/app-shell";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NotificationWatcher } from "@/components/layout/notification-watcher";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { UserMenu } from "@/components/layout/user-menu";
import { WordingProvider } from "@/components/shared/wording";
import { visibleNavigation } from "@/config/navigation";
import { schoolConfigOf } from "@/features/academic/school";
import { universityConfigOf } from "@/features/university/config";
import { EmailVerificationBanner } from "@/features/auth/components/email-verification-banner";
import { Module4SpaceBar } from "@/features/billing/components/module4-space-bar";
import { SubscriptionBanner } from "@/features/billing/components/subscription-banner";
import { SIDEBAR_COOKIE } from "@/config/ui";
import { getRecentNotifications } from "@/features/notifications/queries";
import { requireOrganization } from "@/lib/auth/guards";
import { can, displayName } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo";
import { featureEnabled } from "@/lib/features";
import { vocabularyFor } from "@/lib/vocabulary";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await requireOrganization();
  const demo = isDemoMode() && context.organization.is_demo;
  const sections = visibleNavigation(context.permissions, {
    demo,
    organizationType: context.organization.type,
    school: schoolConfigOf(context.organization.settings),
    university: universityConfigOf(context.organization.type, context.organization.settings),
    hidden: [
      ...(featureEnabled(context.organization, "messaging") ? [] : ["/messages"]),
      ...(featureEnabled(context.organization, "assistant") ? [] : ["/assistant"]),
    ],
  });
  const notifications = await getRecentNotifications(context.organization.id);
  const name = displayName(context);
  const roleLabel = context.roleNames.join(" · ") || "Membre";
  const vocab = vocabularyFor(context.organization.type);
  const searchPlaceholder = `Rechercher un ${vocab.student.toLowerCase()}, un parent, une ${vocab.klass.toLowerCase()}…`;

  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";

  return (
    <WordingProvider organizationType={context.organization.type}>
    <AppShell sections={sections} initialCollapsed={collapsed} organization={{ name: context.organization.name, isDemo: context.organization.is_demo }}>
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
            establishmentsHref="/mes-etablissements"
            pendingAccess={context.accessNotices.invitations + context.accessNotices.restricted}
            demo={demo}
          />
        </header>
        {context.accessNotices.invitations + context.accessNotices.restricted > 0 ? (
          <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-info-soft px-4 py-2 text-center text-sm font-medium text-info">
            <Landmark className="size-4" aria-hidden />
            {context.accessNotices.invitations > 0
              ? `${context.accessNotices.invitations} invitation(s) d'un autre établissement NeoScool à accepter avec votre compte actuel.`
              : `${context.accessNotices.restricted} établissement(s) en attente de l'abonnement multi-établissements.`}
            <Link href="/mes-etablissements" className="font-semibold underline-offset-4 hover:underline">
              Voir mes établissements
            </Link>
          </div>
        ) : null}
        <Module4SpaceBar organizationId={context.organization.id} />
        <EmailVerificationBanner organizationId={context.organization.id} />
        <SubscriptionBanner organizationId={context.organization.id} canBill={can(context, "billing.read")} />
        <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-6 sm:px-7 lg:py-7">{children}</main>
        <NotificationWatcher />
    </AppShell>
    </WordingProvider>
  );
}
