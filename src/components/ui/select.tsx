import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

/** Liste déroulante native (accessible, adaptée au mobile) avec le style du design system. */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <span className="relative block">
      <select
        className={cn(
          "peer h-12 w-full appearance-none rounded-xl border border-input bg-surface pl-3 pr-10 text-sm text-foreground shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-primary/40",
          "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15 aria-invalid:border-danger disabled:opacity-60",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-transform duration-200 peer-focus-visible:rotate-180 peer-focus-visible:text-primary" aria-hidden />
    </span>
  );
}
