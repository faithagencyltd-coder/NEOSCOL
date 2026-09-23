import { Bell, Megaphone, Pin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SubmitButton } from "@/components/shared/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getVisibleAnnouncements } from "@/features/dashboard/queries";
import { markAllNotificationsRead } from "@/features/notifications/actions";
import { requirePortal } from "@/features/portal/context";
import { getMyNotifications } from "@/features/portal/queries";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Annonces et notifications" };

export default async function PortalAnnouncementsPage() {
  const { organization } = await requirePortal();
  const [announcements, notifications] = await Promise.all([getVisibleAnnouncements(organization.id), getMyNotifications(organization.id)]);
  const unread = notifications.filter((n) => !n.read_at).length;
  const tz = organization.timezone;

  return (
    <>
      <h1 className="text-xl font-bold">Annonces et notifications</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="size-4 text-primary" aria-hidden /> Annonces de l&apos;établissement
          </CardTitle>
        </CardHeader>
        <CardContent>
          {announcements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune annonce en cours.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-4">
              {announcements.map((a) => (
                <li key={a.id} className="grid gap-1 text-sm">
                  <span className="flex items-center gap-2 font-semibold">
                    {a.is_pinned ? <Pin className="size-4 text-accent" aria-label="Épinglée" /> : null}
                    {a.title}
                  </span>
                  <p className="whitespace-pre-line text-muted-foreground">{a.body}</p>
                  <span className="text-xs text-muted-foreground">
                    {a.published_at ? formatDateTime(a.published_at, "fr-FR", tz) : ""}
                    {a.author_name ? ` · ${a.author_name}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Bell className="size-4 text-primary" aria-hidden /> Notifications {unread ? `(${unread} non lues)` : ""}
          </CardTitle>
          {unread ? (
            <form action={markAllNotificationsRead}>
              <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                Tout marquer comme lu
              </SubmitButton>
            </form>
          ) : null}
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune notification.</p>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => {
                const body = (
                  <>
                    <span className="flex items-center gap-2 font-semibold">
                      {!n.read_at ? <span className="size-2 rounded-full bg-primary" aria-label="Non lue" /> : null}
                      {n.title}
                    </span>
                    {n.body ? <span className="text-muted-foreground">{n.body}</span> : null}
                    <span className="text-xs text-muted-foreground">{formatDateTime(n.created_at, "fr-FR", tz)}</span>
                  </>
                );
                const portalLink = n.link?.startsWith("/portail") ? n.link : null;
                return (
                  <li key={n.id} className={cn("py-3 text-sm", !n.read_at && "bg-primary-soft/40")}>
                    {portalLink ? (
                      <Link href={portalLink} className="grid gap-0.5 hover:text-primary">
                        {body}
                      </Link>
                    ) : (
                      <div className="grid gap-0.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
