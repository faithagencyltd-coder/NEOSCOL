import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";

/** Champ de formulaire accessible : libellé, aide et erreurs reliés au contrôle. */
export function FormField({
  id,
  label,
  hint,
  errors,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  errors?: string[];
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !errors?.length ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {errors?.length ? (
        <p id={`${id}-error`} className="text-xs font-medium text-danger" role="alert">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}
