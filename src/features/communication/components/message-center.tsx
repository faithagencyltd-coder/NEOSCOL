import { ArrowLeft, Inbox, MessagesSquare } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { ReplyForm } from "@/features/communication/components/thread-ui";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/format";

type Thread = { id: string; subject: string; last_message_at: string; participants: string; last_message: string; unread: boolean };
type Message = { id: string; body: string; created_at: string; sender: string; mine: boolean };

/**
 * Messagerie en deux volets (liste des conversations + conversation ouverte).
 * Sur téléphone, un seul volet est affiché à la fois.
 */
export function MessageCenter({
  threads,
  selected,
  messages,
  basePath,
  timezone,
  emptyAction,
}: {
  threads: Thread[];
  selected: Thread | null;
  messages: Message[] | null;
  basePath: string;
  timezone: string;
  emptyAction?: ReactNode;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,20rem)_1fr]">
      <Card className={cn("overflow-hidden", selected && "hidden md:block")}>
        {threads.length === 0 ? (
          <EmptyState icon={Inbox} title="Aucune conversation" description="Les messages échangés avec l'établissement apparaissent ici." action={emptyAction} />
        ) : (
          <ul className="max-h-[70dvh] divide-y divide-border overflow-y-auto" aria-label="Conversations">
            {threads.map((t) => (
              <li key={t.id}>
                <Link
                  href={`${basePath}?fil=${t.id}`}
                  aria-current={selected?.id === t.id ? "true" : undefined}
                  className="grid gap-0.5 px-4 py-3 text-sm transition-colors hover:bg-surface-muted aria-[current=true]:bg-primary-soft"
                >
                  <span className="flex items-center gap-2">
                    {t.unread ? <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Non lu" /> : null}
                    <span className={cn("flex-1 truncate", t.unread ? "font-semibold" : "font-medium")}>{t.subject}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(t.last_message_at, "fr-FR", timezone)}</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{t.participants}</span>
                  <span className="truncate text-muted-foreground">{t.last_message}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className={cn("flex min-h-80 flex-col overflow-hidden", !selected && "hidden md:flex")}>
        {selected && messages ? (
          <>
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Link href={basePath} className="rounded-lg p-1 hover:bg-surface-muted md:hidden" aria-label="Retour aux conversations">
                <ArrowLeft className="size-5" aria-hidden />
              </Link>
              <div className="grid min-w-0">
                <h2 className="truncate font-semibold">{selected.subject}</h2>
                <p className="truncate text-xs text-muted-foreground">{selected.participants}</p>
              </div>
            </header>
            <ol className="grid flex-1 content-start gap-3 overflow-y-auto p-4" aria-label="Messages">
              {messages.map((m) => (
                <li key={m.id} className={cn("flex items-end gap-2", m.mine && "flex-row-reverse")}>
                  {m.mine ? null : <Avatar name={m.sender} className="size-8 text-xs" />}
                  <div className={cn("grid max-w-[80%] gap-1 rounded-2xl px-3.5 py-2 text-sm", m.mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-surface-muted")}>
                    {m.mine ? null : <span className="text-xs font-semibold">{m.sender}</span>}
                    <p className="whitespace-pre-line break-words">{m.body}</p>
                    <span className={cn("text-[11px]", m.mine ? "text-primary-foreground/75" : "text-muted-foreground")}>{formatDateTime(m.created_at, "fr-FR", timezone)}</span>
                  </div>
                </li>
              ))}
            </ol>
            <div className="border-t border-border p-3">
              <ReplyForm threadId={selected.id} />
            </div>
          </>
        ) : (
          <EmptyState icon={MessagesSquare} title="Sélectionnez une conversation" description="Choisissez une conversation dans la liste pour la lire et y répondre." />
        )}
      </Card>
    </div>
  );
}
