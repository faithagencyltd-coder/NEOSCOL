import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { W } from "@/components/shared/wording";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="anim-fade-up flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span className="anim-pop flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-primary-soft to-surface-muted text-primary">
        <Icon className="size-6" aria-hidden />
      </span>
      <div className="grid gap-1">
        <p className="font-medium text-foreground">
          <W text={title} />
        </p>
        {description ? <p className="max-w-sm text-sm text-muted-foreground">
            <W text={description} />
          </p> : null}
      </div>
      {action}
    </div>
  );
}
