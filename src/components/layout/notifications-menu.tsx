import { Bell, BellOff } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markAllNotificationsRead } from "@/features/notifications/actions";
import { formatDateTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type NotificationItem = { id: string; title: string; body: string | null; created_at: string; read_at: string | null; link?: string | null };

export function NotificationsMenu({
  items,
  unread,
  timezone,
  allHref = "/notifications",
}: {
  items: NotificationItem[];
  unread: number;
  timezone: string;
  allHref?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-xl bg-surface-muted hover:bg-border" aria-label={`Notifications (${unread} non lues)`}>
          <Bell className={cn(unread > 0 && "origin-top [animation:ring_1.2s_ease-in-out_2]")} />
          {unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 animate-[fade-in_0.3s_ease-out] flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))]">
        <div className="flex items-center justify-between px-2.5 py-1.5">
          <DropdownMenuLabel className="p-0 text-sm text-foreground">Notifications</DropdownMenuLabel>
          {unread > 0 ? (
            <form action={markAllNotificationsRead}>
              <button type="submit" className="text-xs font-medium text-primary hover:underline">
                Tout marquer comme lu
              </button>
            </form>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
            <BellOff className="size-5" aria-hidden />
            Aucune notification pour le moment.
          </div>
        ) : (
          <ul className="grid max-h-96 gap-1 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id} className={cn("rounded-md px-2.5 py-2", !item.read_at && "bg-primary-soft/60")}>
                {item.link ? (
                  <Link href={item.link} className="grid hover:text-primary">
                    <span className="text-sm font-medium">{item.title}</span>
                    {item.body ? <span className="text-xs text-muted-foreground">{item.body}</span> : null}
                    <span className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(item.created_at, "fr-FR", timezone)}</span>
                  </Link>
                ) : (
                  <>
                    <p className="text-sm font-medium">{item.title}</p>
                    {item.body ? <p className="text-xs text-muted-foreground">{item.body}</p> : null}
                    <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(item.created_at, "fr-FR", timezone)}</p>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <DropdownMenuSeparator />
        <Link href={allHref} className="block rounded-md px-2.5 py-2 text-center text-sm font-semibold text-primary hover:bg-primary-soft">
          Voir toutes les notifications
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
