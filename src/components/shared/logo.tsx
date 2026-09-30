import { cn } from "@/lib/utils/cn";

/** Emblème officiel (extrait du logo NeoScool fourni) : toque, « N », carrés numériques, livre ouvert. */
export const LOGO_MARK_SRC = "/assets/neoscool/logo/neoscool-mark.png";
/** Logo complet fourni (emblème, nom et accroche), sur fond blanc. */
export const LOGO_FULL_SRC = "/assets/neoscool/logo/neoscool-logo.webp";

/**
 * Emblème NeoScool. `inverted` : fond sombre, un liseré clair garde la toque
 * bleu nuit lisible.
 */
export function LogoMark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  // Le logo peut être remplacé par le Super Admin (variable CSS --brand-logo, logo d'origine par défaut).
  return (
    <span
      aria-hidden
      className={cn(
        "block size-10 shrink-0 bg-contain bg-center bg-no-repeat [background-image:var(--brand-logo)]",
        inverted && "[filter:drop-shadow(0_0_0.6px_rgba(255,255,255,0.95))_drop-shadow(0_0_6px_rgba(56,189,248,0.35))]",
        className,
      )}
    />
  );
}

/**
 * Nom de marque tel que sur le logo : « .NeoScool » (point orange, « Neo »
 * foncé, « Scool » bleu). Dans les phrases, on écrit simplement « NeoScool ».
 */
export function BrandName({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("font-display font-bold tracking-tight", className)}>
      <span className="text-[#f7931e]">.</span>
      <span className={inverted ? "text-white" : "text-[#0b2e6f] dark:text-white"}>Neo</span>
      <span className={cn("bg-clip-text text-transparent", inverted ? "bg-gradient-to-r from-sky-300 to-cyan-300" : "bg-gradient-to-r from-[#1666e0] to-[#0a9cf5]")}>Scool</span>
    </span>
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
        <BrandName inverted={inverted} className="text-xl" />
        {tagline ? (
          <span className={cn("max-w-44 text-[11px] leading-snug", inverted ? "text-sidebar-foreground" : "text-muted-foreground")}>
            Plus qu&apos;un logiciel, une vision pour l&apos;éducation.
          </span>
        ) : null}
      </span>
    </span>
  );
}

/**
 * Emblème vectoriel d'origine (avant la livraison du logo officiel), conservé
 * pour mémoire : il n'est plus affiché.
 */
export function LogoMarkHistorique({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  const id = inverted ? "nsc-grad-inv" : "nsc-grad";
  return (
    <svg viewBox="0 0 48 48" className={cn("size-10 shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={inverted ? "#7dd3fc" : "#1d63ed"} />
          <stop offset="1" stopColor={inverted ? "#2563eb" : "#0b2559"} />
        </linearGradient>
      </defs>
      <path d="M24 3 40 9.5 24 16 8 9.5z" fill={inverted ? "#ffffff" : "#0b2559"} />
      <path d="M14 12v5c3 2.4 6.3 3.4 10 3.4S31 19.4 34 17v-5l-10 4z" fill={inverted ? "#dbeafe" : "#1d63ed"} />
      <path d="M38 10.5v7" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="38" cy="18.6" r="1.6" fill="#f59e0b" />
      <path d="M13 38V21h5.2l11.6 10.6V21H35v17h-5.1L18.2 27.3V38z" fill={`url(#${id})`} />
      <path d="M6 39.5c6-2.6 12-2.6 18 0 6-2.6 12-2.6 18 0" fill="none" stroke="#f59e0b" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M8 43.5c5.3-2 10.7-2 16 0 5.3-2 10.7-2 16 0" fill="none" stroke={inverted ? "#ffffff" : "#1d63ed"} strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}
