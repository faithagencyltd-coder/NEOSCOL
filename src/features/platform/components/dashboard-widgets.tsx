import { ArrowRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  AnimatedCounter,
  AnimatedMoney,
} from "@/components/motion/animated-counter";
import { cn } from "@/lib/utils/cn";

/** Briques du tableau de bord Super Admin (présentation seulement, données fournies par la page). */

const TONES = {
  blue: "from-[#1d63ed] to-[#3b82f6] shadow-[#1d63ed]/30",
  orange: "from-[#f59e0b] to-[#fb923c] shadow-[#f59e0b]/30",
  sky: "from-[#0ea5e9] to-[#38bdf8] shadow-[#0ea5e9]/30",
  violet: "from-[#7c3aed] to-[#a855f7] shadow-[#7c3aed]/30",
  green: "from-[#16a34a] to-[#22c55e] shadow-[#16a34a]/30",
  red: "from-[#dc2626] to-[#f87171] shadow-[#dc2626]/30",
} as const;
export type WidgetTone = keyof typeof TONES;

export function KpiTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "blue",
  href,
  testId,
}: {
  label: string;
  value: { count: number } | { amount: number; currency: string };
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: WidgetTone;
  href?: string;
  testId?: string;
}) {
  const body = (
    <>
      <span
        className={cn(
          "flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg",
          TONES[tone],
        )}
      >
        <Icon className="size-7" aria-hidden />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="text-sm font-medium text-muted-foreground">
          {label}
        </span>
        <span className="text-[1.65rem] font-bold leading-tight tracking-tight text-foreground tabular-nums">
          {"count" in value ? (
            <AnimatedCounter value={value.count} />
          ) : (
            <AnimatedMoney value={value.amount} currency={value.currency} />
          )}
        </span>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </span>
    </>
  );
  const cls =
    "flex items-center gap-4 rounded-2xl border border-border/70 bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.12)] transition-all";
  return href ? (
    <Link
      href={href}
      className={cn(
        cls,
        "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg",
      )}
      data-testid={testId}
    >
      {body}
    </Link>
  ) : (
    <div className={cls} data-testid={testId}>
      {body}
    </div>
  );
}

/** Petite statistique sur une ligne (indicateurs secondaires). */
export function MiniStat({
  label,
  value,
  tone = "neutral",
  href,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "danger";
  href?: string;
}) {
  const dot = {
    neutral: "bg-slate-400",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  }[tone];
  const content = (
    <>
      <span className={cn("size-2 shrink-0 rounded-full", dot)} aria-hidden />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </>
  );
  const cls =
    "flex items-center gap-2 rounded-xl border border-border/70 bg-surface px-3.5 py-2.5 text-sm";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-primary/30")}>
      {content}
    </Link>
  ) : (
    <div className={cls}>{content}</div>
  );
}

/** Bloc de section du tableau de bord : titre, sous-titre, lien « Voir tout ». */
export function DashPanel({
  title,
  subtitle,
  action,
  children,
  className,
  testId,
}: {
  title: string;
  subtitle?: string;
  action?: { href: string; label: string };
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      className={cn(
        "grid content-start gap-4 rounded-2xl border border-border/70 bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
        className,
      )}
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {subtitle ? (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {action ? (
          <Link
            href={action.href}
            className="shrink-0 text-xs font-semibold text-primary hover:underline"
          >
            {action.label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Carte d'un module (état réel lu en base) avec accès à sa configuration et à ses statistiques. */
export function ModuleCard({
  title,
  description,
  icon: Icon,
  tone,
  state,
  stateLabel,
  isNew,
  configureHref,
  statsHref,
  testId,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: WidgetTone;
  state: "on" | "partial" | "off";
  stateLabel: string;
  isNew?: boolean;
  configureHref: string;
  statsHref: string;
  testId?: string;
}) {
  const pill = {
    on: "bg-success-soft text-success",
    partial: "bg-warning-soft text-warning",
    off: "bg-surface-muted text-muted-foreground",
  }[state];
  const dot = { on: "bg-success", partial: "bg-warning", off: "bg-slate-400" }[
    state
  ];
  return (
    <article
      className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-surface p-4"
      data-testid={testId}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md",
            TONES[tone],
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <h3 className="text-sm font-semibold leading-snug text-foreground">
          {title}
          {isNew ? (
            <span className="ml-1.5 inline-block rounded-full bg-[#fff4e0] px-1.5 py-0.5 align-middle text-[10px] font-bold text-[#b45309]">
              Nouveau
            </span>
          ) : null}
        </h3>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
      <span
        className={cn(
          "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
          pill,
        )}
      >
        <span className={cn("size-1.5 rounded-full", dot)} aria-hidden />{" "}
        {stateLabel}
      </span>
      <div className="mt-auto grid grid-cols-2 gap-2">
        <Link
          href={configureHref}
          className="rounded-xl border border-primary/30 bg-primary-soft/60 px-3 py-2 text-center text-xs font-semibold text-primary hover:bg-primary-soft"
        >
          Configurer
        </Link>
        <Link
          href={statsHref}
          className="rounded-xl border border-border px-3 py-2 text-center text-xs font-semibold text-foreground hover:bg-surface-muted"
        >
          Voir les statistiques
        </Link>
      </div>
    </article>
  );
}

/** Raccourci des actions rapides. */
export function QuickAction({
  href,
  label,
  icon: Icon,
  tone,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  tone: WidgetTone;
}) {
  return (
    <Link
      href={href}
      className="group grid justify-items-center gap-2 rounded-xl border border-border/70 bg-surface p-3 text-center text-xs font-semibold text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
    >
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md",
          TONES[tone],
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      {label}
    </Link>
  );
}

export function QuickActionButton({
  label,
  icon: Icon,
  tone,
}: {
  label: string;
  icon: LucideIcon;
  tone: WidgetTone;
}) {
  return (
    <button
      type="button"
      className="group grid w-full justify-items-center gap-2 rounded-xl border border-border/70 bg-surface p-3 text-center text-xs font-semibold text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
    >
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md",
          TONES[tone],
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      {label}
    </button>
  );
}

export function SeeMore({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-xl bg-[#f59e0b] px-4 py-2 text-sm font-semibold text-[#07142b] shadow-md hover:bg-[#fbbf24]"
    >
      {children} <ArrowRight className="size-4" aria-hidden />
    </Link>
  );
}
