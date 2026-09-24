"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils/cn";

export type WizardStep = { key: string; label: string };

/**
 * Barre de progression d'un assistant : la jauge avance en douceur, les étapes
 * validées affichent une coche animée, l'étape courante est mise en évidence.
 */
export function AnimatedWizard({ steps, current, onSelect }: { steps: WizardStep[]; current: number; onSelect?: (index: number) => void }) {
  const progress = steps.length > 1 ? (current / (steps.length - 1)) * 100 : 100;
  return (
    <nav aria-label="Étapes" className="grid gap-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">
          Étape {current + 1} / {steps.length} · {steps[current]?.label}
        </span>
        <span className="tabular-nums text-muted-foreground">{Math.round(progress)} %</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-gradient-to-r from-primary to-[#38bdf8] transition-[width] duration-500 ease-[var(--ease-out)]" style={{ width: `${progress}%` }} />
      </div>
      <ol className="flex gap-1 overflow-x-auto pb-1">
        {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step.key} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect?.(i)}
                disabled={!onSelect || i > current}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all duration-200",
                  active && "bg-primary-soft text-primary",
                  done && "text-foreground hover:bg-surface-muted",
                  !done && !active && "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-all duration-300",
                    done && "border-success bg-success text-white",
                    active && "scale-110 border-primary bg-primary text-primary-foreground",
                    !done && !active && "border-input",
                  )}
                >
                  {done ? <Check className="anim-pop size-3.5" aria-hidden /> : i + 1}
                </span>
                <span className="hidden sm:inline">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
