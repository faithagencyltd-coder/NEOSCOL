import type { ReactNode, SVGProps } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * STYLE D'ILLUSTRATION NEOSCOOL — une seule famille visuelle :
 * - palette de marque : bleu nuit #0b2559, bleu #1d63ed, cyan #38bdf8, accent ambre #f59e0b,
 *   succès #10b981, fonds très clairs #eef3fb / #f6f8fc ;
 * - formes « interface » arrondies (cartes blanches rayon 10–14, ombres douces), aplats et
 *   dégradés légers bleu nuit → bleu, aucun contour noir ;
 * - personnages simplifiés, sans traits du visage, dans l'uniforme des photos NeoScool
 *   (chemise blanche, bleu marine), tons de peau variés ;
 * - un halo circulaire clair derrière chaque scène, quelques points et étincelles cyan ;
 * - mouvement discret (flottement, pulsation, balayage) en transform/opacity uniquement,
 *   coupé par « prefers-reduced-motion » (règle globale).
 */
export const C = {
  navy: "#0b2559",
  navyDeep: "#07142b",
  blue: "#1d63ed",
  sky: "#38bdf8",
  skySoft: "#bae6fd",
  amber: "#f59e0b",
  green: "#10b981",
  red: "#f43f5e",
  bg: "#eef3fb",
  card: "#ffffff",
  line: "#dbe5f4",
  muted: "#94a3b8",
  skin: ["#8d5524", "#6b3e1f", "#a86b3c", "#c68a5a"],
  hair: "#1f1308",
} as const;

export type IllustrationProps = Omit<SVGProps<SVGSVGElement>, "children"> & { title?: string };

/** Cadre commun : viewBox 320×240, halo, titre accessible (décoratif par défaut). */
export function Frame({ title, className, children, ...props }: IllustrationProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 320 240" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} className={cn("ill h-auto w-full", className)} {...props}>
      {title ? <title>{title}</title> : null}
      <circle cx="160" cy="124" r="104" fill={C.bg} />
      <circle cx="160" cy="124" r="78" fill="#e3ecfa" opacity="0.6" />
      <g className="ill-sparkle">
        <circle cx="52" cy="54" r="3" fill={C.sky} />
        <circle cx="274" cy="70" r="2.5" fill={C.amber} />
        <circle cx="282" cy="186" r="3" fill={C.blue} opacity="0.5" />
        <path d="M60 180l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill={C.sky} opacity="0.7" />
      </g>
      {children}
    </svg>
  );
}

/** Carte d'interface blanche avec ombre douce. */
export function Card({ x, y, w, h, r = 12, children, className }: { x: number; y: number; w: number; h: number; r?: number; children?: ReactNode; className?: string }) {
  return (
    <g className={className}>
      <rect x={x + 2} y={y + 6} width={w} height={h} rx={r} fill={C.navy} opacity="0.08" />
      <rect x={x} y={y} width={w} height={h} rx={r} fill={C.card} />
      {children}
    </g>
  );
}

/** Ligne de texte simulée. */
export function Bar({ x, y, w, h = 6, fill = C.line }: { x: number; y: number; w: number; h?: number; fill?: string }) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} />;
}

/** Pastille « validé ». */
export function Check({ cx, cy, r = 11, fill = C.green }: { cx: number; cy: number; r?: number; fill?: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={fill} />
      <path d={`M${cx - r * 0.42} ${cy}l${r * 0.3} ${r * 0.32} ${r * 0.56}-${r * 0.62}`} fill="none" stroke="#fff" strokeWidth={r * 0.22} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/** QR code stylisé (motif fixe). */
export function Qr({ x, y, s, fill = C.navy }: { x: number; y: number; s: number; fill?: string }) {
  const u = s / 7;
  const cells = ["1110111", "1010101", "1110111", "0001000", "1101011", "0100110", "1110101"];
  return (
    <g>
      <rect x={x - u * 0.5} y={y - u * 0.5} width={s + u} height={s + u} rx={u} fill="#fff" />
      {cells.flatMap((row, j) => [...row].map((c, i) => (c === "1" ? <rect key={`${i}-${j}`} x={x + i * u} y={y + j * u} width={u * 0.92} height={u * 0.92} rx={u * 0.18} fill={fill} /> : null)))}
    </g>
  );
}

/**
 * Personnage simplifié (buste) dans l'uniforme NeoScool : chemise blanche,
 * cravate ou col bleu marine. Aucun trait du visage.
 */
export function Person({
  x,
  y,
  s = 1,
  skin = C.skin[0],
  hair = "short",
  outfit = "uniform",
  className,
}: {
  x: number;
  y: number;
  s?: number;
  skin?: string;
  hair?: "short" | "braids" | "bun" | "cap";
  outfit?: "uniform" | "teacher" | "parent" | "apron";
  className?: string;
}) {
  const shirt = outfit === "teacher" ? C.navy : outfit === "parent" ? "#0e7490" : outfit === "apron" ? "#0f766e" : "#fff";
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} className={className}>
      {/* buste */}
      <path d="M-30 64c0-24 13-36 30-36s30 12 30 36z" fill={shirt} stroke={outfit === "uniform" ? C.line : "none"} strokeWidth="1.5" />
      {outfit === "uniform" ? <path d="M0 30l-5 6 5 22 5-22z" fill={C.blue} /> : null}
      {outfit === "teacher" ? <path d="M-7 30l7 10 7-10" fill="#fff" /> : null}
      {outfit === "apron" ? <rect x="-12" y="38" width="24" height="26" rx="4" fill="#99f6e4" opacity="0.6" /> : null}
      {/* cou et tête */}
      <rect x="-5" y="18" width="10" height="13" rx="4" fill={skin} />
      <circle cx="0" cy="8" r="14" fill={skin} />
      {hair === "short" ? <path d="M-14 6c0-11 7-16 14-16s14 5 14 16c-4-6-9-8-14-8s-10 2-14 8z" fill={C.hair} /> : null}
      {hair === "braids" ? (
        <g fill={C.hair}>
          <path d="M-15 8c0-12 7-18 15-18s15 6 15 18c-3-7-9-10-15-10s-12 3-15 10z" />
          <path d="M9 4c6 6 7 18 4 34l-4-1c2-14 1-24-4-30z" />
        </g>
      ) : null}
      {hair === "bun" ? (
        <g fill={C.hair}>
          <circle cx="0" cy="-10" r="7" />
          <path d="M-14 6c0-11 7-16 14-16s14 5 14 16c-4-6-9-8-14-8s-10 2-14 8z" />
        </g>
      ) : null}
      {hair === "cap" ? (
        <g>
          <path d="M-14 4c0-10 7-15 14-15s14 5 14 15z" fill={C.hair} />
          <path d="M-20 -8l20-9 20 9-20 9z" fill={C.navy} />
          <path d="M14 -5v9" stroke={C.amber} strokeWidth="2" />
        </g>
      ) : null}
    </g>
  );
}
