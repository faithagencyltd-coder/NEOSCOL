import type { LucideIcon } from "lucide-react";

import { AnimatedCounter, AnimatedMoney } from "@/components/motion/animated-counter";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

const TONES = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
} as const;

/** Valeur d'indicateur : texte déjà formaté, nombre ou montant (animés à l'apparition). */
export type StatValue = string | { count: number } | { amount: number; currency: string };

export function StatCard({
  label,
  value,
  hint,
  hintTone,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: StatValue;
  hint?: string;
  hintTone?: "success" | "danger";
  icon: LucideIcon;
  tone?: keyof typeof TONES;
}) {
  return (
    <Card interactive className="group flex items-start gap-4 p-5">
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-3",
          TONES[tone],
        )}
      >
        <Icon className="size-[22px]" aria-hidden />
      </span>
      <div className="grid min-w-0 gap-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="truncate font-display text-2xl font-semibold tabular-nums">
          {typeof value === "string" ? value : "amount" in value ? <AnimatedMoney value={value.amount} currency={value.currency} /> : <AnimatedCounter value={value.count} />}
        </p>
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
