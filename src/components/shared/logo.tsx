import { cn } from "@/lib/utils/cn";

export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="8" className={inverted ? "fill-white" : "fill-primary"} />
        <path
          d="M9 22V10h2.6l7.8 7.7V10H22v12h-2.6l-7.8-7.7V22z"
          className={inverted ? "fill-sidebar" : "fill-primary-foreground"}
        />
      </svg>
      <span className={cn("text-lg", inverted ? "text-white" : "text-foreground")}>NéoScol</span>
    </span>
  );
}
