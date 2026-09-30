import type { ComponentProps } from "react";

import { worded } from "@/components/shared/wording-children";
import { cn } from "@/lib/utils/cn";

/** Carte du design system ; `interactive` ajoute l'élévation au survol (AnimatedCard). */
export function Card({ className, interactive, ...props }: ComponentProps<"section"> & { interactive?: boolean }) {
  return (
    <section
      className={cn("rounded-[14px] border border-border bg-surface shadow-[0_1px_2px_rgba(15,27,61,0.04)]", interactive && "hover-lift", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...props} />;
}

export function CardTitle({ className, children, ...props }: ComponentProps<"h2">) {
  return (
    <h2 className={cn("text-base font-semibold text-foreground", className)} {...props}>
      {worded(children)}
    </h2>
  );
}

export function CardDescription({ className, children, ...props }: ComponentProps<"p">) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props}>
      {worded(children)}
    </p>
  );
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}
