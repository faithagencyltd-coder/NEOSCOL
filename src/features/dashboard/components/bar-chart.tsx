import { cn } from "@/lib/utils/cn";

export type BarDatum = { label: string; value: number; display: string };

/**
 * Histogramme simple à une série (une teinte, pas de légende : le titre de la
 * carte nomme la série). Info-bulle au survol / focus et tableau accessible.
 */
export function ColumnChart({ data, caption }: { data: BarDatum[]; caption: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <figure className="grid gap-2">
      <div className="flex h-48 items-end gap-2 border-b border-border" role="img" aria-label={caption}>
        {data.map((d) => (
          <div key={d.label} className="group relative flex h-full flex-1 flex-col items-center justify-end" tabIndex={0}>
            <span className="pointer-events-none absolute -top-1 z-10 hidden -translate-y-full whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground shadow-md group-hover:block group-focus:block">
              {d.label} · {d.display}
            </span>
            <div
              className="w-full max-w-12 rounded-t bg-chart-1 transition-opacity group-hover:opacity-80"
              style={{ height: `${Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {data.map((d) => (
          <span key={d.label} className="flex-1 truncate text-center text-xs text-muted-foreground">
            {d.label}
          </span>
        ))}
      </div>
      <DataTable data={data} caption={caption} />
    </figure>
  );
}

export function HorizontalBars({ data, caption, className }: { data: BarDatum[]; caption: string; className?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <figure className={cn("grid gap-3", className)}>
      <ul className="grid gap-2.5" aria-label={caption}>
        {data.map((d) => (
          <li key={d.label} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate text-muted-foreground">{d.label}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
              <span className="block h-full rounded-full bg-chart-1" style={{ width: `${(d.value / max) * 100}%` }} />
            </span>
            <span className="text-right font-medium tabular-nums">{d.display}</span>
          </li>
        ))}
      </ul>
      <DataTable data={data} caption={caption} />
    </figure>
  );
}

function DataTable({ data, caption }: { data: BarDatum[]; caption: string }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>
        {data.map((d) => (
          <tr key={d.label}>
            <th scope="row">{d.label}</th>
            <td>{d.display}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
