import { Skeleton } from "@/components/ui/skeleton";

/** État de chargement du portail famille (cartes empilées, format mobile). */
export default function PortalLoading() {
  return (
    <div className="grid gap-4" role="status" aria-live="polite">
      <span className="sr-only">Chargement…</span>
      <Skeleton className="h-7 w-48" />
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-2xl" />
      ))}
    </div>
  );
}
