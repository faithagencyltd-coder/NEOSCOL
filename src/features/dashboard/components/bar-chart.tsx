import { cn } from "@/lib/utils/cn";

export type BarDatum = { label: string; value: number; display: string };

/**
 * Barres horizontales à une série (une teinte, pas de légende) avec tableau
 * accessible. Les barres croissent en cascade ; au survol, la ligne est mise
 * en avant et une infobulle rappelle la valeur et l'écart au maximum.
 */
export function HorizontalBars({ data, caption, className }: { data: BarDatum[]; caption: string; className?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <figure className={cn("grid gap-3", className)}>
      <ul className="grid gap-1" aria-label={caption}>
        {data.map((d, i) => (
          <li
            key={d.label}
            className="group relative grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 rounded-lg px-1.5 py-1 text-sm transition-colors duration-150 hover:bg-surface-muted/70"
          >
            <span className="truncate text-muted-foreground transition-colors group-hover:text-foreground">{d.label}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
              <span
                className="block h-full origin-left animate-[bar-grow-x_0.7s_var(--ease-out)_both] rounded-full bg-chart-1 transition-[filter] duration-150 group-hover:brightness-110 group-hover:saturate-150"
                style={{ width: `${(d.value / max) * 100}%`, animationDelay: `${Math.min(i, 10) * 50}ms` }}
              />
            </span>
            <span className="text-right font-medium tabular-nums">{d.display}</span>
            <span
              aria-hidden
              className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md bg-sidebar px-2 py-1 text-xs font-medium text-sidebar-foreground opacity-0 shadow-lg transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100"
            >
              {d.label} · {d.display}
              {d.value < max ? ` · ${Math.round((d.value / max) * 100)} % du maximum` : " · maximum"}
            </span>
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
