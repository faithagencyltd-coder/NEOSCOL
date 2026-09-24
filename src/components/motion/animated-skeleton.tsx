import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

/** Bloc de chargement avec reflet (shimmer). */
export function AnimatedSkeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden className={cn("shimmer rounded-lg", className)} {...props} />;
}

/** Squelette de cartes statistiques (structure identique au tableau de bord). */
export function StatCardsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4", className)} role="status" aria-label="Chargement des indicateurs">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-start gap-4 rounded-[14px] border border-border bg-surface p-5">
          <AnimatedSkeleton className="size-11 shrink-0 rounded-xl" />
          <div className="grid flex-1 gap-2">
            <AnimatedSkeleton className="h-4 w-28" />
            <AnimatedSkeleton className="h-7 w-24" />
            <AnimatedSkeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Squelette de tableau : barre de filtres puis lignes. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="grid gap-3 rounded-[14px] border border-border bg-surface p-4" role="status" aria-label="Chargement du tableau">
      <AnimatedSkeleton className="h-11 w-full rounded-xl" />
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 py-1.5">
          <AnimatedSkeleton className="size-9 rounded-full" />
          {Array.from({ length: columns - 1 }, (_, c) => (
            <AnimatedSkeleton key={c} className="h-4 flex-1" style={{ maxWidth: `${160 - c * 18}px` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Squelette d'un panneau (graphique, liste). */
export function PanelSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div className="grid gap-4 rounded-[14px] border border-border bg-surface p-5" role="status" aria-label="Chargement">
      <AnimatedSkeleton className="h-5 w-44" />
      <AnimatedSkeleton className="w-full" style={{ height }} />
    </div>
  );
}
