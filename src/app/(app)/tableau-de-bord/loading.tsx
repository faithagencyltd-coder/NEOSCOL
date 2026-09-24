import { AnimatedSkeleton, PanelSkeleton, StatCardsSkeleton } from "@/components/motion/animated-skeleton";

/** Squelette calqué sur le tableau de bord : en-tête, indicateurs, finances, activité. */
export default function DashboardLoading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Chargement du tableau de bord">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-2">
          <AnimatedSkeleton className="h-4 w-44" />
          <AnimatedSkeleton className="h-8 w-60" />
        </div>
        <AnimatedSkeleton className="h-10 w-56 rounded-xl" />
      </div>
      <StatCardsSkeleton count={6} className="xl:grid-cols-3" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PanelSkeleton height={240} />
        </div>
        <PanelSkeleton height={240} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PanelSkeleton height={200} />
        </div>
        <PanelSkeleton height={200} />
      </div>
    </div>
  );
}
