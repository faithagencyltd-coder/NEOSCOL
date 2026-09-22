import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

export function Checkbox({ className, label, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 text-sm", className)}>
      <input type="checkbox" className="size-4.5 shrink-0 rounded border-input accent-[var(--primary)]" {...props} />
      <span>{label}</span>
    </label>
  );
}
