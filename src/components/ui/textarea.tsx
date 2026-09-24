import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-xl border border-input bg-surface px-3 py-2.5 text-sm text-foreground shadow-sm transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-muted-foreground hover:border-primary/40",
        "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15 aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}
