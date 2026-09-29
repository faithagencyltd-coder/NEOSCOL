"use client";

import { RotateCw } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export type BadgeCardData = {
  role: string;
  first_name: string;
  last_name: string;
  subtitle?: string | null;
  identifier?: string | null;
  number: string;
  organization: { name: string; color?: string | null; is_demo?: boolean };
  photoUrl?: string | null;
  validity?: string | null;
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * Carte / badge en 3D (écran) : inclinaison qui suit le doigt ou la souris,
 * reflet holographique, recto / verso (touchez la carte). Format carte bancaire
 * (CR80). Si l'utilisateur demande moins d'animations : carte fixe, bascule
 * instantanée, aucun reflet animé.
 */
export function Badge3D({ data, back, className, defaultFlipped = false }: { data: BadgeCardData; back?: ReactNode; className?: string; defaultFlipped?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState(defaultFlipped);
  const reduced = usePrefersReducedMotion();
  const color = data.organization.color || "#1d63ed";
  const initials = `${data.first_name[0] ?? ""}${data.last_name[0] ?? ""}`.toUpperCase();

  const onMove = (e: React.PointerEvent) => {
    if (reduced || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    ref.current.style.setProperty("--rx", `${(0.5 - y) * 16}deg`);
    ref.current.style.setProperty("--ry", `${(x - 0.5) * 20}deg`);
    ref.current.style.setProperty("--mx", `${x * 100}%`);
    ref.current.style.setProperty("--my", `${y * 100}%`);
  };
  const onLeave = () => {
    if (!ref.current) return;
    ref.current.style.setProperty("--rx", "0deg");
    ref.current.style.setProperty("--ry", "0deg");
    ref.current.style.setProperty("--mx", "50%");
    ref.current.style.setProperty("--my", "30%");
  };

  return (
    <div className={cn("grid w-full justify-items-center gap-3", className)}>
      <div className="w-full max-w-[320px] [perspective:1400px]">
        <div
          ref={ref}
          role="button"
          tabIndex={0}
          aria-pressed={flipped}
          aria-label={flipped ? "Voir le recto du badge" : "Voir le verso du badge"}
          onClick={() => back && setFlipped((f) => !f)}
          onKeyDown={(e) => {
            if (back && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              setFlipped((f) => !f);
            }
          }}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
          style={{ "--rx": "0deg", "--ry": "0deg", "--mx": "50%", "--my": "30%" } as React.CSSProperties}
          className={cn("relative aspect-[54/85.6] w-full cursor-pointer outline-none focus-visible:ring-4 focus-visible:ring-primary/40 rounded-[22px]", !reduced && "badge3d-float")}
        >
          <div
            className={cn("absolute inset-0 [transform-style:preserve-3d]", !reduced && "transition-transform duration-700 ease-[var(--ease-out)]")}
            style={{ transform: `rotateX(var(--rx)) rotateY(calc(var(--ry) + ${flipped ? 180 : 0}deg))` }}
          >
            {/* RECTO */}
            <div className="absolute inset-0 overflow-hidden rounded-[22px] bg-white shadow-[0_30px_60px_-20px_rgba(11,37,89,0.55),0_0_0_1px_rgba(11,37,89,0.08)] [backface-visibility:hidden] dark:bg-slate-900">
              <div className="relative h-[42%] overflow-hidden text-white" style={{ background: `linear-gradient(135deg, #07142b 0%, ${color} 70%, #0ea5e9 130%)` }}>
                <div aria-hidden className="absolute -right-10 -top-10 size-40 rounded-full bg-white/10" />
                <div aria-hidden className="absolute -bottom-16 -left-10 size-44 rounded-full bg-white/5" />
                <div className="relative grid gap-1 p-4 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-200">NéoScol</p>
                  <p className="line-clamp-2 text-sm font-bold leading-tight">{data.organization.name}</p>
                  <span className="mx-auto mt-1 rounded-full bg-white/15 px-3 py-0.5 text-[10px] font-bold tracking-[0.2em] backdrop-blur">{data.role}</span>
                  {data.organization.is_demo ? <span className="text-[10px] font-bold text-amber-200">DÉMONSTRATION</span> : null}
                </div>
              </div>
              <div className="-mt-12 grid justify-items-center gap-1 px-4 text-center">
                <div className="relative size-24 overflow-hidden rounded-2xl border-4 border-white bg-slate-100 shadow-lg dark:border-slate-900">
                  {data.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={data.photoUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-2xl font-bold text-slate-400">{initials}</span>
                  )}
                </div>
                <p className="mt-1 text-lg font-extrabold uppercase leading-tight text-[#0b1f4d] dark:text-white">{data.last_name}</p>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{data.first_name}</p>
                {data.subtitle ? <p className="text-xs font-semibold" style={{ color }}>{data.subtitle}</p> : null}
                {data.identifier ? <p className="mt-1 font-mono text-[11px] text-slate-500">{data.identifier}</p> : null}
              </div>
              {/* Bande holographique + puce */}
              <div className="absolute inset-x-4 bottom-4 flex items-center justify-between">
                <span aria-hidden className="h-6 w-8 rounded-md bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 shadow-inner" />
                <span className="font-mono text-[10px] text-slate-400">{data.number}</span>
              </div>
              <div
                aria-hidden
                className={cn("pointer-events-none absolute inset-0 rounded-[22px] opacity-60 mix-blend-soft-light", reduced && "hidden")}
                style={{
                  background:
                    "radial-gradient(circle at var(--mx) var(--my), rgba(255,255,255,0.75), transparent 45%), linear-gradient(115deg, transparent 30%, rgba(125,211,252,0.35) 45%, rgba(244,114,182,0.3) 55%, rgba(253,224,71,0.3) 65%, transparent 80%)",
                  backgroundSize: "100% 100%, 250% 250%",
                  backgroundPosition: "center, var(--mx) var(--my)",
                }}
              />
            </div>
            {/* VERSO */}
            {back ? (
              <div className="absolute inset-0 overflow-hidden rounded-[22px] bg-white shadow-[0_30px_60px_-20px_rgba(11,37,89,0.55),0_0_0_1px_rgba(11,37,89,0.08)] [backface-visibility:hidden] [transform:rotateY(180deg)] dark:bg-slate-900">
                <div className="h-2" style={{ background: `linear-gradient(90deg, #07142b, ${color}, #0ea5e9)` }} />
                <div className="grid h-[calc(100%-0.5rem)] content-center justify-items-center gap-3 p-5 text-center">{back}</div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {back ? (
        <button type="button" onClick={() => setFlipped((f) => !f)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
          <RotateCw className="size-3.5" aria-hidden /> {flipped ? "Voir le recto" : "Voir le QR code (verso)"}
        </button>
      ) : null}
    </div>
  );
}
