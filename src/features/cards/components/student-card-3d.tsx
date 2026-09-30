"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils/cn";

import { CARD_HEIGHT, CARD_WIDTH, CardBack, CardFront } from "../card-faces";
import type { CardData, CardDesign } from "../design";

/**
 * Carte 3D (format paysage CR80) : inclinaison qui suit la souris ou le doigt,
 * reflet, retournement recto / verso au clic ou avec les boutons. Animations
 * coupées si l'utilisateur préfère moins de mouvement.
 */
export function StudentCard3D({ card, design, className }: { card: CardData; design: CardDesign; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.8);
  const [flipped, setFlipped] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => entry && setScale(Math.min(1, entry.contentRect.width / CARD_WIDTH)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onMove = (e: React.PointerEvent) => {
    if (reduced || !tilt.current) return;
    const r = tilt.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    tilt.current.style.setProperty("--rx", `${(0.5 - y) * 12}deg`);
    tilt.current.style.setProperty("--ry", `${(x - 0.5) * 16}deg`);
    tilt.current.style.setProperty("--mx", `${x * 100}%`);
    tilt.current.style.setProperty("--my", `${y * 100}%`);
  };
  const onLeave = () => {
    tilt.current?.style.setProperty("--rx", "0deg");
    tilt.current?.style.setProperty("--ry", "0deg");
  };

  const face = (content: React.ReactNode, back: boolean) => (
    <div
      className="absolute inset-0 overflow-hidden rounded-[22px] shadow-[0_30px_60px_-24px_rgba(11,31,58,0.55),0_0_0_1px_rgba(11,31,58,0.08)] [backface-visibility:hidden]"
      style={back ? { transform: "rotateY(180deg)" } : undefined}
    >
      <div style={{ width: CARD_WIDTH, height: CARD_HEIGHT, transform: `scale(${scale})`, transformOrigin: "top left" }}>{content}</div>
      {!reduced ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-50 mix-blend-soft-light"
          style={{ background: "radial-gradient(circle at var(--mx) var(--my), rgba(255,255,255,0.7), transparent 45%)" }}
        />
      ) : null}
    </div>
  );

  return (
    <div className={cn("grid w-full justify-items-center gap-4", className)}>
      <div ref={box} className="w-full max-w-[680px] [perspective:1600px]">
        <div
          ref={tilt}
          role="button"
          tabIndex={0}
          aria-label={flipped ? "Voir le recto de la carte" : "Voir le verso de la carte"}
          aria-pressed={flipped}
          onClick={() => setFlipped((f) => !f)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setFlipped((f) => !f);
            }
          }}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
          style={{ "--rx": "0deg", "--ry": "0deg", "--mx": "50%", "--my": "30%", height: CARD_HEIGHT * scale } as React.CSSProperties}
          className="relative w-full cursor-pointer rounded-[22px] outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
        >
          <div
            className={cn("absolute inset-0 [transform-style:preserve-3d]", !reduced && "transition-transform duration-700 ease-[var(--ease-out)]")}
            style={{ transform: `rotateX(var(--rx)) rotateY(calc(var(--ry) + ${flipped ? 180 : 0}deg))` }}
          >
            {face(<CardFront card={card} design={design} />, false)}
            {face(<CardBack card={card} design={design} />, true)}
          </div>
        </div>
      </div>
      <div className="inline-flex rounded-xl border border-border bg-muted/60 p-1" role="group" aria-label="Face de la carte">
        {[
          { key: false, label: "RECTO" },
          { key: true, label: "VERSO" },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={() => setFlipped(b.key)}
            aria-pressed={flipped === b.key}
            className={cn("rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors", flipped === b.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {b.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Cliquez sur la carte pour la retourner.</p>
    </div>
  );
}
