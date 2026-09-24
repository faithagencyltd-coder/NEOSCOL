import { cn } from "@/lib/utils/cn";

/** Coche dessinée (succès) : cercle puis trait, 650 ms. */
export function AnimatedSuccess({ className, label = "Succès" }: { className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 52 52" className={cn("size-14 text-success", className)} role="img" aria-label={label}>
      <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="151" strokeDashoffset="151"
        style={{ animation: "draw 420ms var(--ease-out) forwards" }} />
      <path d="M15 27l7 7 15-16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="36" strokeDashoffset="36" style={{ animation: "draw 260ms var(--ease-out) 380ms forwards" }} />
    </svg>
  );
}

/** Croix avec secousse (erreur). */
export function AnimatedError({ className, label = "Erreur" }: { className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 52 52" className={cn("anim-shake size-14 text-danger", className)} role="img" aria-label={label}>
      <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M18 18l16 16M34 18L18 34" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
        strokeDasharray="23" strokeDashoffset="23" style={{ animation: "draw 240ms var(--ease-out) 120ms forwards" }} />
    </svg>
  );
}
