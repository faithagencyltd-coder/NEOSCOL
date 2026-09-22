import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils/cn";

/** Pagination par liens : l'état reste dans l'URL (partageable, compatible SSR). */
export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  searchParams,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== "page") params.set(key, value);
    }
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const linkClass = "flex h-9 items-center gap-1 rounded-lg border border-border bg-surface px-3 text-sm font-medium";
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
      <p className="text-muted-foreground">
        {from}–{to} sur {total}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={cn(linkClass, "hover:bg-surface-muted")} rel="prev">
            <ChevronLeft className="size-4" aria-hidden /> Précédent
          </Link>
        ) : (
          <span className={cn(linkClass, "opacity-50")} aria-disabled>
            <ChevronLeft className="size-4" aria-hidden /> Précédent
          </span>
        )}
        <span className="px-1 text-muted-foreground">
          Page {page} / {pages}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className={cn(linkClass, "hover:bg-surface-muted")} rel="next">
            Suivant <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <span className={cn(linkClass, "opacity-50")} aria-disabled>
            Suivant <ChevronRight className="size-4" aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}
