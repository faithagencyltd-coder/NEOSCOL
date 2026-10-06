import { Lock } from "lucide-react";

import { cn } from "@/lib/utils/cn";

export type ThreadMessage = { id: string; body: string; author_side: string; internal: boolean; created_at: string; author?: string | null };

/** Fil d'une demande : messages de l'établissement et de la plateforme (notes internes signalées). */
export function SupportThread({ description, createdAt, author, messages }: { description: string; createdAt: string; author?: string | null; messages: ThreadMessage[] }) {
  return (
    <ol className="grid gap-3" data-testid="support-thread">
      <li className="rounded-2xl border border-border bg-surface-muted/50 p-3 text-sm">
        <p className="mb-1 text-xs text-muted-foreground">
          {author ?? "Établissement"} · {new Date(createdAt).toLocaleString("fr-FR")}
        </p>
        <p className="whitespace-pre-line">{description}</p>
      </li>
      {messages.map((m) => (
        <li
          key={m.id}
          className={cn(
            "rounded-2xl border p-3 text-sm",
            m.internal ? "border-warning/40 bg-warning-soft/40" : m.author_side === "platform" ? "ml-6 border-primary/30 bg-primary-soft/40" : "mr-6 border-border",
          )}
        >
          <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            {m.internal ? <Lock className="size-3" aria-hidden /> : null}
            {m.internal ? "Note interne (invisible pour l'établissement)" : m.author_side === "platform" ? "Équipe NeoScool" : (m.author ?? "Établissement")} · {new Date(m.created_at).toLocaleString("fr-FR")}
          </p>
          <p className="whitespace-pre-line">{m.body}</p>
        </li>
      ))}
    </ol>
  );
}
