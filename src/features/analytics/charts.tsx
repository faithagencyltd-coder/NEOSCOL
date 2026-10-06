import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WORLD_PATHS, WORLD_VIEWBOX } from "@/features/analytics/world-map";

/** Graphiques de la rubrique Analytics : rendus côté serveur (SVG / CSS), sans bibliothèque. */

export function Panel({ title, description, children, testId, action }: { title: string; description?: string; children: ReactNode; testId?: string; action?: ReactNode }) {
  return (
    <Card data-testid={testId} className="min-w-0">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  );
}

export function Empty({ children = "Aucune donnée enregistrée sur la période." }: { children?: ReactNode }) {
  return <p className="py-4 text-center text-sm text-muted-foreground">{children}</p>;
}

/** Barres horizontales (classement). */
export function Bars({ rows, empty }: { rows: { label: string; value: number; text?: string; hint?: string }[]; empty?: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="grid gap-1.5" role="list">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(6rem,11rem)_minmax(0,1fr)_auto] items-center gap-2 text-xs" title={r.hint ?? `${r.label} : ${r.text ?? r.value}`}>
          <span className="truncate text-muted-foreground">{r.label}</span>
          <span className="h-3 rounded-r-[4px] bg-primary" style={{ width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100)}%` }} aria-hidden />
          <span className="tabular-nums text-foreground">{r.text ?? r.value.toLocaleString("fr-FR")}</span>
        </li>
      ))}
    </ul>
  );
}

/** Courbes journalières (plusieurs séries) avec axe des dates. */
export function DailyChart({ days, series }: { days: string[]; series: { label: string; color: string; values: number[] }[] }) {
  if (!days.length) return <Empty />;
  const W = 720;
  const H = 200;
  const pad = { l: 34, r: 8, t: 10, b: 24 };
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const x = (i: number) => pad.l + (days.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (days.length - 1));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const step = Math.max(1, Math.ceil(days.length / 8));
  const label = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  return (
    <figure className="grid gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Évolution journalière">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * t)} y2={y(max * t)} stroke="currentColor" className="text-border" strokeDasharray="3 3" />
            <text x={pad.l - 6} y={y(max * t) + 3} textAnchor="end" className="fill-muted-foreground" fontSize="10">
              {Math.round(max * t)}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <polyline key={s.label} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
        ))}
        {days.map((d, i) =>
          i % step === 0 || i === days.length - 1 ? (
            <text key={d} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground" fontSize="10">
              {label(d)}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ background: s.color }} aria-hidden /> {s.label} ({s.values.reduce((a, b) => a + b, 0).toLocaleString("fr-FR")})
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** Carte du monde : intensité de couleur selon le nombre de visiteurs par pays. */
export function WorldMap({ values, names }: { values: Record<string, number>; names: Record<string, string> }) {
  const max = Math.max(1, ...Object.values(values));
  return (
    <figure className="grid gap-2" data-testid="world-map">
      <svg viewBox={WORLD_VIEWBOX} className="h-auto w-full" role="img" aria-label="Carte des visiteurs par pays">
        {Object.entries(WORLD_PATHS).map(([code, d]) => {
          const v = values[code] ?? 0;
          const opacity = v ? 0.25 + 0.75 * (v / max) : 0;
          return (
            <path key={code} d={d} fill={v ? `rgba(29, 99, 237, ${opacity.toFixed(2)})` : "#dfe6f1"} stroke="#ffffff" strokeWidth="0.4" data-country={code}>
              <title>{`${names[code] ?? code} : ${v.toLocaleString("fr-FR")} visiteur(s)`}</title>
            </path>
          );
        })}
      </svg>
      <figcaption className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-block h-2.5 w-24 rounded-full bg-gradient-to-r from-[rgba(29,99,237,0.25)] to-[rgba(29,99,237,1)]" aria-hidden /> moins → plus de visiteurs
      </figcaption>
    </figure>
  );
}

/** Indicateur avec évolution par rapport à la période précédente. */
export function Kpi({ label, value, deltaPct, hint, testId }: { label: string; value: string; deltaPct?: number | null; hint?: string; testId?: string }) {
  return (
    <Card className="grid gap-1 p-4" data-testid={testId}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      {deltaPct !== undefined ? (
        <span className={`text-xs ${deltaPct === null ? "text-muted-foreground" : deltaPct >= 0 ? "text-success" : "text-danger"}`}>
          {deltaPct === null ? "pas de comparaison possible" : `${deltaPct >= 0 ? "+" : ""}${deltaPct.toLocaleString("fr-FR")} % vs période précédente`}
        </span>
      ) : null}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </Card>
  );
}
