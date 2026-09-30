import { Label as LabelPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { worded } from "@/components/shared/wording-children";
import { cn } from "@/lib/utils/cn";

export function Label({ className, children, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root className={cn("text-sm font-medium text-foreground", className)} {...props}>
      {worded(children)}
    </LabelPrimitive.Root>
  );
}
