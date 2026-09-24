import { AvatarPhoto } from "@/components/ui/avatar-photo";
import { initials } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

/** Initiales, ou photo stockée en base (fichier servi par /api/fichiers, RLS appliquée). */
export function Avatar({ name, className, photoId }: { name: string; className?: string; photoId?: string | null }) {
  if (photoId) {
    return (
      <AvatarPhoto src={`/api/fichiers/${photoId}`} alt={`Photo de ${name}`} className={className} />
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
