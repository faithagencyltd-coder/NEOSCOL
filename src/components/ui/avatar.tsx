import Image from "next/image";

import { initials } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

/** Initiales, ou photo stockée en base (fichier servi par /api/fichiers, RLS appliquée). */
export function Avatar({ name, className, photoId }: { name: string; className?: string; photoId?: string | null }) {
  if (photoId) {
    return (
      <Image
        src={`/api/fichiers/${photoId}`}
        alt={`Photo de ${name}`}
        width={160}
        height={160}
        unoptimized
        className={cn("size-9 shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary",
        className,
      )}
    >
      {initials(name) || "?"}
    </span>
  );
}
