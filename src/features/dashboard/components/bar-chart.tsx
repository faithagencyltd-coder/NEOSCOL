import { cn } from "@/lib/utils/cn";

export type BarDatum = { label: string; value: number; display: string };

/** Barres horizontales à une série (une teinte, pas de légende) avec tableau accessible. */
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
