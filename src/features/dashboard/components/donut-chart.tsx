export type DonutSegment = { label: string; value: number; color: string };

/**
 * Anneau de répartition. Les couleurs sont celles des statuts (soldé, partiel,
 * impayé) et chaque segment est aussi nommé dans la légende : l'information
 * ne repose jamais sur la couleur seule.
 */
export function DonutChart({ segments, total, unit, caption }: { segments: DonutSegment[]; total: number; unit: string; caption: string }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const sum = segments.reduce((acc, s) => acc + s.value, 0) || 1;
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 2 : 0;

  const arcs = segments.map((segment, index) => {
    const before = segments.slice(0, index).reduce((acc, s) => acc + s.value, 0);
    const length = (segment.value / sum) * circumference;
    return { ...segment, dash: Math.max(length - gap, 0), offset: (before / sum) * circumference };
  });

  return (
    <figure className="flex flex-col items-center gap-5 sm:flex-row">
      <svg viewBox="0 0 136 136" className="size-36 shrink-0" role="img" aria-label={caption}>
        <circle cx="68" cy="68" r={radius} fill="none" className="stroke-surface-muted" strokeWidth="18" />
        <g transform="rotate(-90 68 68)">
          {arcs.map((arc) =>
            arc.value > 0 ? (
              <circle
                key={arc.label}
                cx="68"
                cy="68"
                r={radius}
                fill="none"
                style={{ stroke: arc.color }}
                strokeWidth="18"
                strokeDasharray={`${arc.dash} ${circumference}`}
                strokeDashoffset={-arc.offset}
              >
                <title>{`${arc.label} : ${arc.value}`}</title>
              </circle>
            ) : null,
          )}
        </g>
        <text x="68" y="66" textAnchor="middle" className="fill-foreground font-display text-[24px] font-semibold">
          {total}
        </text>
        <text x="68" y="86" textAnchor="middle" className="fill-muted-foreground text-[12px]">
          {unit}
        </text>
      </svg>
      <ul className="grid w-full gap-3 text-sm">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2.5">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: segment.color }} aria-hidden />
            <span className="flex-1 text-muted-foreground">{segment.label}</span>
            <span className="font-semibold tabular-nums">{segment.value}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
