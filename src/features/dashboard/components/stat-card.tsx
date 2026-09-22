import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "primary" | "success" | "warning" | "danger" | "info";
}) {
  const toneClass = {
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info",
  }[tone];
  return (
    <Card className="flex items-start gap-4 p-5">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", toneClass)}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="grid min-w-0 gap-0.5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="truncate text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </Card>
  );
}
