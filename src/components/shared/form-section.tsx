import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

/** Section de formulaire : titre + description à gauche, champs à droite (empilés sur mobile). */
export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[16rem_1fr]">
      <div className="grid content-start gap-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}
