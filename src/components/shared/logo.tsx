import { cn } from "@/lib/utils/cn";

/**
 * Emblème NéoScol : « N » en dégradé bleu coiffé d'une toque, posé sur un
 * livre ouvert (accent orange). `inverted` : version pour fond sombre.
 */
export function LogoMark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  const id = inverted ? "nsc-grad-inv" : "nsc-grad";
  return (
    <svg viewBox="0 0 48 48" className={cn("size-10 shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={inverted ? "#7dd3fc" : "#1d63ed"} />
          <stop offset="1" stopColor={inverted ? "#2563eb" : "#0b2559"} />
        </linearGradient>
      </defs>
      {/* toque */}
      <path d="M24 3 40 9.5 24 16 8 9.5z" fill={inverted ? "#ffffff" : "#0b2559"} />
      <path d="M14 12v5c3 2.4 6.3 3.4 10 3.4S31 19.4 34 17v-5l-10 4z" fill={inverted ? "#dbeafe" : "#1d63ed"} />
      <path d="M38 10.5v7" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="38" cy="18.6" r="1.6" fill="#f59e0b" />
      {/* N */}
      <path d="M13 38V21h5.2l11.6 10.6V21H35v17h-5.1L18.2 27.3V38z" fill={`url(#${id})`} />
      {/* livre ouvert */}
      <path d="M6 39.5c6-2.6 12-2.6 18 0 6-2.6 12-2.6 18 0" fill="none" stroke="#f59e0b" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M8 43.5c5.3-2 10.7-2 16 0 5.3-2 10.7-2 16 0" fill="none" stroke={inverted ? "#ffffff" : "#1d63ed"} strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

export function Logo({
  className,
  inverted = false,
  tagline = false,
}: {
  className?: string;
  inverted?: boolean;
  tagline?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <LogoMark inverted={inverted} />
      <span className="flex flex-col leading-tight">
        <span className={cn("font-display text-xl font-bold", inverted ? "text-white" : "text-foreground")}>NéoScol</span>
        {tagline ? (
          <span className={cn("text-[11px]", inverted ? "text-sidebar-foreground" : "text-muted-foreground")}>
            Éduquer aujourd&apos;hui, bâtir demain
          </span>
        ) : null}
      </span>
    </span>
  );
}
