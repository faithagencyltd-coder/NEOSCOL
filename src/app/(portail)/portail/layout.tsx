import { FlaskConical } from "lucide-react";

import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { UserMenu } from "@/components/layout/user-menu";
import { Logo } from "@/components/shared/logo";
import { getRecentNotifications } from "@/features/notifications/queries";
import { ChildSwitcher } from "@/features/portal/components/child-switcher";
import { PortalNav } from "@/features/portal/components/portal-nav";
import { requirePortal } from "@/features/portal/context";
import { displayName } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo";
import { vocabularyFor } from "@/lib/vocabulary";

/** Portail parent / élève : interface mobile (bleu nuit, blanc, cyan), navigation en bas d'écran. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { context, organization, parent, students, student } = await requirePortal();
  const notifications = await getRecentNotifications(organization.id);
  const name = displayName(context);

  return (
    <div className="min-h-dvh bg-background pb-20 md:pb-8">
      {organization.is_demo ? (
        <div className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-1.5 text-center text-xs font-medium text-warning">
          <FlaskConical className="size-3.5" aria-hidden />
          Établissement de démonstration — données fictives.
        </div>
      ) : null}
      <header className="bg-gradient-to-br from-[#07142b] via-[#0b2559] to-[#0e4a9a] text-white">
        <div className="mx-auto grid max-w-4xl gap-4 px-4 pb-4 pt-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Logo inverted />
            </div>
            <div className="rounded-xl bg-white text-foreground">
              <NotificationsMenu items={notifications.items} unread={notifications.unread} timezone={organization.timezone} allHref="/portail/annonces" />
            </div>
            <div className="rounded-xl bg-white text-foreground">
              <UserMenu
                name={name}
                email={context.user.email ?? context.user.phone}
                roleLabel={parent ? "Espace parent" : vocabularyFor(organization.type).studentSpace}
                organizations={context.organizations}
                activeOrganizationId={organization.id}
                accountHref="/portail/plus"
                demo={isDemoMode() && organization.is_demo}
              />
            </div>
          </div>
          <div className="grid gap-0.5">
            <p className="text-xs font-medium uppercase tracking-wider text-cyan-300">{parent ? "Espace parent" : vocabularyFor(organization.type).studentSpace}</p>
            <p className="truncate text-sm text-white/80">{organization.name}</p>
          </div>
          {parent && student && students.length > 1 ? <ChildSwitcher students={students} selectedId={student.id} /> : null}
        </div>
      </header>
      <PortalNav parent={parent} />
      <main className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-5 px-4 py-5">{children}</main>
    </div>
  );
}
