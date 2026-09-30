import type { ReactNode } from "react";

import { W } from "@/components/shared/wording";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          <W text={title} />
        </h1>
        {description ? <p className="text-sm text-muted-foreground">
            <W text={description} />
          </p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
