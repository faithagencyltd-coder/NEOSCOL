import { cn } from "@/lib/utils/cn";

/** Emblème NéoScol : anneau bleu et orange autour d'un écusson. */
export function LogoMark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <svg viewBox="0 0 44 44" className={cn("size-10 shrink-0", className)} aria-hidden>
      <circle cx="22" cy="22" r="20" className={inverted ? "fill-white" : "fill-sidebar"} />
      <path d="M22 4a18 18 0 0 1 18 18" className="stroke-accent" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M22 40A18 18 0 0 1 4 22" className="stroke-primary" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M14 15l8-3 8 3v7c0 5-4 8-8 9.5-4-1.5-8-4.5-8-9.5z" className={inverted ? "fill-sidebar" : "fill-white"} />
      <path
        d="M17.5 18.5h7M17.5 21.5h9M17.5 24.5h6"
        className={inverted ? "stroke-white" : "stroke-sidebar"}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
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
