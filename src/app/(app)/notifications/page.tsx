import {
  AlertTriangle,
  Bell,
  BellOff,
  CalendarX,
  Check,
  Clock,
  FileText,
  NotebookPen,
  Paperclip,
  ShieldCheck,
  Unlock,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SubmitButton } from "@/components/shared/submit-button";
import { TabNav } from "@/components/shared/tab-nav";
import { Card } from "@/components/ui/card";
import { markAllNotificationsRead, markNotificationRead } from "@/features/notifications/actions";
import { listNotifications } from "@/features/notifications/queries";
import { requireOrganization } from "@/lib/auth/guards";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Notifications" };

const KINDS: { prefix: string; icon: LucideIcon; tone: string; label: string }[] = [
  { prefix: "payment", icon: Wallet, tone: "bg-success-soft text-success", label: "Paiements" },
  { prefix: "invoice", icon: AlertTriangle, tone: "bg-warning-soft text-warning", label: "Factures et impayés" },
  { prefix: "attendance.absent", icon: CalendarX, tone: "bg-danger-soft text-danger", label: "Absences" },
  { prefix: "attendance.late", icon: Clock, tone: "bg-warning-soft text-warning", label: "Retards" },
  { prefix: "justification", icon: Paperclip, tone: "bg-info-soft text-info", label: "Justificatifs" },
  { prefix: "report_card", icon: FileText, tone: "bg-primary-soft text-primary", label: "Bulletins" },
  { prefix: "grades", icon: NotebookPen, tone: "bg-primary-soft text-primary", label: "Notes" },
  { prefix: "lesson", icon: Unlock, tone: "bg-success-soft text-success", label: "Cours déverrouillés" },
  { prefix: "portal", icon: ShieldCheck, tone: "bg-success-soft text-success", label: "Accès portail" },
];

const FILTERS = [
  { key: "toutes", label: "Toutes" },
  { key: "non-lues", label: "Non lues" },
  { key: "payment", label: "Paiements" },
  { key: "attendance", label: "Présences" },
  { key: "invoice", label: "Impayés" },
] as const;

function kindOf(type: string) {
  return KINDS.find((k) => type.startsWith(k.prefix)) ?? { icon: Bell, tone: "bg-surface-muted text-muted-foreground", label: "Information" };
}

/** Centre de notifications : paiements, absences, retards, bulletins, justificatifs, cours déverrouillés… */
export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const context = await requireOrganization();
  const requested = param(await searchParams, "filtre");
  const filter = FILTERS.find((f) => f.key === requested)?.key ?? "toutes";
  const items = await listNotifications(context.organization.id, {
    unread: filter === "non-lues",
    type: filter === "toutes" || filter === "non-lues" ? undefined : filter,
  });
  const unread = items.filter((n) => !n.read_at).length;
  const tz = context.organization.timezone;
  const days = new Map<string, typeof items>();
  for (const n of items) {
    const day = n.created_at.slice(0, 10);
    days.set(day, [...(days.get(day) ?? []), n]);
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Notifications"
        description="Toutes vos alertes : paiements, absences, retards, bulletins, justificatifs, cours déverrouillés."
        actions={
          unread > 0 ? (
            <form action={markAllNotificationsRead}>
              <SubmitButton variant="secondary" pendingLabel="…">
                <Check aria-hidden /> Tout marquer comme lu
              </SubmitButton>
            </form>
          ) : null
        }
      />
      <TabNav
        label="Filtrer les notifications"
        active={filter}
        tabs={FILTERS.map((f) => ({ key: f.key, label: f.label, href: f.key === "toutes" ? "/notifications" : `/notifications?filtre=${f.key}` }))}
      />
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={BellOff} title="Aucune notification" description="Les nouvelles alertes apparaîtront ici en temps réel." />
        </Card>
      ) : (
        <div className="grid gap-5">
          {[...days.entries()].map(([day, list], dayIndex) => (
            <section key={day} className="grid gap-2" aria-label={formatDate(day)}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {formatDate(day, "fr-FR", { weekday: "long", day: "numeric", month: "long" })}
              </h2>
              <Card className="divide-y divide-border overflow-hidden">
                {list.map((n, i) => {
                  const kind = kindOf(n.type);
                  const content = (
                    <>
                      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", kind.tone)}>
                        <kind.icon className="size-5" aria-hidden />
                      </span>
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="flex items-center gap-2 font-semibold">
                          {n.title}
                          {!n.read_at ? <span className="size-2 rounded-full bg-primary" aria-label="Non lue" /> : null}
                        </span>
                        {n.body ? <span className="text-sm text-muted-foreground">{n.body}</span> : null}
                        <span className="text-xs text-muted-foreground">
                          {kind.label} · {formatDateTime(n.created_at, "fr-FR", tz)}
                        </span>
                      </span>
                    </>
                  );
                  return (
                    <div
                      key={n.id}
                      className={cn("rise flex items-center gap-3 px-4 py-3.5", !n.read_at && "bg-primary-soft/40")}
                      style={{ "--delay": `${Math.min(dayIndex * 3 + i, 12) * 30}ms` } as React.CSSProperties}
                    >
                      {n.link ? (
                        <Link href={n.link} className="flex min-w-0 flex-1 items-center gap-3 hover:text-primary">
                          {content}
                        </Link>
                      ) : (
                        <div className="flex min-w-0 flex-1 items-center gap-3">{content}</div>
                      )}
                      {!n.read_at ? (
                        <form action={markNotificationRead}>
                          <input type="hidden" name="id" value={n.id} />
                          <SubmitButton size="sm" variant="ghost" aria-label={`Marquer « ${n.title} » comme lue`} pendingLabel="…">
                            <Check aria-hidden />
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
