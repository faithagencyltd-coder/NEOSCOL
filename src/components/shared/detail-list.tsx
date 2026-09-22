import type { ReactNode } from "react";

/** Liste « libellé / valeur » en grille (2 colonnes à partir de sm). */
export function DetailList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="grid gap-0.5 border-b border-border pb-2.5">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="text-sm font-semibold">{item.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
