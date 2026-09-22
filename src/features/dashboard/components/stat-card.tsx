import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

const TONES = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
} as const;

export function StatCard({
  label,
  value,
  hint,
  hintTone,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  hint?: string;
  hintTone?: "success" | "danger";
  icon: LucideIcon;
  tone?: keyof typeof TONES;
}) {
  return (
    <Card className="flex items-start gap-4 p-5">
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", TONES[tone])}>
        <Icon className="size-[22px]" aria-hidden />
      </span>
      <div className="grid min-w-0 gap-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="truncate font-display text-2xl font-semibold tabular-nums">{value}</p>
        {hint ? (
          <p
            className={cn(
              "text-xs",
              hintTone === "success" && "font-semibold text-success",
              hintTone === "danger" && "font-semibold text-danger",
              !hintTone && "text-muted-foreground",
            )}
          >
            {hint}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
