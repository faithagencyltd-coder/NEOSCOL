"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Compteur animé de 0 à la valeur (ou de l'ancienne à la nouvelle valeur),
 * déclenché quand il devient visible. Accessible : la valeur finale est
 * annoncée ; mouvement réduit → valeur immédiate.
 */
export function AnimatedCounter({
  value,
  format = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n)),
  duration = 900,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const run = () => {
      if (reduce) {
        setDisplay(value);
        from.current = value;
        return;
      }
      const start = performance.now();
      const origin = from.current;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplay(origin + (value - origin) * eased);
        if (t < 1) frame = requestAnimationFrame(tick);
        else from.current = value;
      };
      frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          run();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      <span aria-hidden className="tabular-nums">
        {format(display)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}

/** Montant animé (FCFA par défaut). */
export function AnimatedMoney({ value, currency = "XOF", className }: { value: number; currency?: string; className?: string }) {
  const nf = new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 });
  return <AnimatedCounter value={value} format={(n) => nf.format(Math.round(n))} className={className} />;
}
