import { FlaskConical, KeyRound, LogOut } from "lucide-react";

import { NotificationWatcher } from "@/components/layout/notification-watcher";
import { signOut, switchOrganization } from "@/features/auth/actions";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { UserMenu } from "@/components/layout/user-menu";
import { Logo } from "@/components/shared/logo";
import { WordingProvider } from "@/components/shared/wording";
import { getRecentNotifications } from "@/features/notifications/queries";
import { ChildSwitcher } from "@/features/portal/components/child-switcher";
import { PortalNav } from "@/features/portal/components/portal-nav";
import { requirePortal } from "@/features/portal/context";
import { isHigherOrg } from "@/features/university/config";
import { displayName } from "@/lib/auth/session";
import { MaintenanceScreen } from "@/components/shared/maintenance-screen";
import { SupportChatMount } from "@/features/support/components/support-chat-mount";
import { isDemoMode } from "@/lib/demo";
import { maintenanceBlocks } from "@/lib/maintenance";
import { vocabularyFor } from "@/lib/vocabulary";

/** Portail parent / élève : interface mobile (bleu nuit, blanc, cyan), navigation en bas d'écran. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { context, organization, parent, students, student, shows } = await requirePortal();
  const maintenance = await maintenanceBlocks();
  if (maintenance) return <MaintenanceScreen state={maintenance} />;
  // Mot de passe provisoire remis par l'établissement (NOM@1234) : à remplacer avant tout accès.
  if (parent && context.user.mustChangePassword) return <FirstPasswordScreen />;
  const hidden = (["results", "grades", "attendance", "finances", "documents", "timetable"] as const).filter((s) => !shows(s));
  const notifications = await getRecentNotifications(organization.id);
  const name = displayName(context);

  return (
    <WordingProvider organizationType={organization.type}>
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
          {context.organizations.length > 1 ? (
            <nav aria-label="Établissements" className="-mx-4 flex gap-2 overflow-x-auto px-4" data-testid="portal-org-switcher">
              {context.organizations.map((o) =>
                o.id === organization.id ? (
                  <span key={o.id} className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#0b2559]">
                    {o.short_name ?? o.name}
                  </span>
                ) : (
                  <form key={o.id} action={switchOrganization}>
                    <input type="hidden" name="organizationId" value={o.id} />
                    <button type="submit" className="shrink-0 rounded-full border border-white/25 px-3 py-1 text-xs font-medium text-white/85 hover:bg-white/10">
                      {o.short_name ?? o.name}
                    </button>
                  </form>
                ),
              )}
            </nav>
          ) : null}
          {parent && student && students.length > 1 ? <ChildSwitcher students={students} selectedId={student.id} /> : null}
        </div>
      </header>
      <PortalNav parent={parent} university={isHigherOrg(organization.type)} hidden={hidden} />
      <main className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-5 px-4 py-5">{children}</main>
      <SupportChatMount placement="portal" />
      <NotificationWatcher />
    </div>
    </WordingProvider>
  );
}

function FirstPasswordScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="grid w-full max-w-md gap-5 rounded-3xl border border-border bg-surface p-6 shadow-sm" data-testid="first-password">
        <Logo />
        <div className="grid gap-1.5">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <KeyRound className="size-5 text-primary" aria-hidden /> Choisissez votre mot de passe
          </h1>
          <p className="text-sm text-muted-foreground">
            Le mot de passe remis par l&apos;établissement est provisoire. Choisissez-en un que vous seul connaissez : vous vous connecterez ensuite avec votre
            numéro de téléphone et ce mot de passe.
          </p>
        </div>
        <ResetPasswordForm redirectTo="/portail" reload />
        <form action={signOut}>
          <SubmitButton variant="secondary" className="w-full" pendingLabel="Déconnexion…">
            <LogOut aria-hidden /> Se déconnecter
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
