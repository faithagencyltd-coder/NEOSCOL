"use client";

import { useState } from "react";

import { cn } from "@/lib/utils/cn";

export type DonutSegment = { label: string; value: number; color: string };

/**
 * Anneau de répartition. Les couleurs sont celles des statuts (soldé, partiel,
 * impayé) et chaque segment est aussi nommé dans la légende : l'information
 * ne repose jamais sur la couleur seule. Au survol (ou au focus clavier) d'un
 * segment ou d'une ligne de légende, le centre affiche sa valeur et sa part.
 */
export function DonutChart({ segments, total, unit, caption }: { segments: DonutSegment[]; total: number; unit: string; caption: string }) {
  const [active, setActive] = useState<string | null>(null);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const sum = segments.reduce((acc, s) => acc + s.value, 0) || 1;
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 2 : 0;

  const arcs = segments.map((segment, index) => {
    const before = segments.slice(0, index).reduce((acc, s) => acc + s.value, 0);
    const length = (segment.value / sum) * circumference;
    return { ...segment, dash: Math.max(length - gap, 0), offset: (before / sum) * circumference };
  });
  const current = segments.find((s) => s.label === active);
  const share = (value: number) => `${Math.round((value / sum) * 100)} %`;

  return (
    <figure className="flex flex-col items-center gap-5 sm:flex-row" onMouseLeave={() => setActive(null)}>
      <svg viewBox="0 0 136 136" className="size-36 shrink-0 overflow-visible" role="img" aria-label={caption}>
        <circle cx="68" cy="68" r={radius} fill="none" className="stroke-surface-muted" strokeWidth="18" />
        <g transform="rotate(-90 68 68)">
          {arcs.map((arc, index) =>
            arc.value > 0 ? (
              <circle
                key={arc.label}
                cx="68"
                cy="68"
                r={radius}
                fill="none"
                className="donut-arc cursor-pointer"
                style={{
                  stroke: arc.color,
                  opacity: active && active !== arc.label ? 0.35 : 1,
                  animationDelay: `${index * 120}ms`,
                  ["--arc" as string]: `${arc.dash}`,
                }}
                strokeWidth={active === arc.label ? 22 : 18}
                strokeDasharray={`${arc.dash} ${circumference}`}
                strokeDashoffset={-arc.offset}
                onMouseEnter={() => setActive(arc.label)}
              >
                <title>{`${arc.label} : ${arc.value} (${share(arc.value)})`}</title>
              </circle>
            ) : null,
          )}
        </g>
        <text key={current?.label ?? "total"} x="68" y="66" textAnchor="middle" className="anim-fade fill-foreground font-display text-[24px] font-semibold">
          {current ? current.value : total}
        </text>
        <text x="68" y="86" textAnchor="middle" className="fill-muted-foreground text-[12px]">
          {current ? `${current.label.toLowerCase()} · ${share(current.value)}` : unit}
        </text>
      </svg>
      <ul className="grid w-full gap-1 text-sm">
        {segments.map((segment) => (
          <li key={segment.label}>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150",
                active === segment.label ? "bg-surface-muted" : "hover:bg-surface-muted/60",
              )}
              onMouseEnter={() => setActive(segment.label)}
              onFocus={() => setActive(segment.label)}
              onBlur={() => setActive(null)}
              aria-label={`${segment.label} : ${segment.value} (${share(segment.value)})`}
            >
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: segment.color }} aria-hidden />
              <span className="flex-1 text-muted-foreground">{segment.label}</span>
              <span className="font-semibold tabular-nums">{segment.value}</span>
              <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{share(segment.value)}</span>
            </button>
          </li>
        ))}
      </ul>
    </figure>
  );
}
