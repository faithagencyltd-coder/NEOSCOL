import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { ILLUSTRATIONS, type IllustrationName } from "@/components/illustrations/scenes";
import { W } from "@/components/shared/wording";

/**
 * État vide illustré : scène NEOSCOOL (générique par défaut, ou propre au
 * contexte), l'icône de la page en pastille, un message clair et l'action utile.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  illustration = "empty",
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  illustration?: IllustrationName;
}) {
  const Illustration = ILLUSTRATIONS[illustration];
  return (
    <div className="anim-fade-up flex flex-col items-center justify-center gap-3 px-6 py-8 text-center">
      <div className="relative w-36">
        <Illustration />
        <span className="anim-pop absolute bottom-1 right-1 flex size-10 items-center justify-center rounded-full bg-surface text-primary shadow-md ring-1 ring-border">
          <Icon className="size-5" aria-hidden />
        </span>
      </div>
      <div className="grid gap-1">
        <p className="font-medium text-foreground">
          <W text={title} />
        </p>
        {description ? (
          <p className="max-w-sm text-sm text-muted-foreground">
            <W text={description} />
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
