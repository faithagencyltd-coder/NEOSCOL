import type { CSSProperties, ReactNode } from "react";
import { Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";

import { brand, font } from "../theme";

/** Mouvement de caméra dans une capture : point visé (0–1) et zoom, du début à la fin. */
export type Cam = { x: number; y: number; s: number };
export type Move = { from: Cam; to: Cam; start?: number; end?: number };

const ease = Easing.bezier(0.45, 0, 0.2, 1);

function camAt(move: Move | undefined, frame: number, duration: number): Cam {
  if (!move) return { x: 0.5, y: 0.5, s: 1 };
  const start = move.start ?? 0;
  const end = move.end ?? duration;
  const p = interpolate(frame, [start, end], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  return { x: move.from.x + (move.to.x - move.from.x) * p, y: move.from.y + (move.to.y - move.from.y) * p, s: move.from.s + (move.to.s - move.from.s) * p };
}

/** Capture réelle cadrée par la caméra (jamais de bord vide visible). */
export function Shot({ src, w, h, move, duration, style }: { src: string; w: number; h: number; move?: Move; duration: number; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const c = camAt(move, frame, duration);
  const half = 0.5 / c.s;
  const x = Math.min(Math.max(c.x, half), 1 - half);
  const y = Math.min(Math.max(c.y, half), 1 - half);
  return (
    <div style={{ width: w, height: h, overflow: "hidden", position: "relative", background: "#f5f7fb", ...style }}>
      <Img
        src={staticFile(`captures/${src}.png`)}
        style={{
          position: "absolute",
          width: w,
          height: h,
          objectFit: "cover",
          objectPosition: "top",
          transformOrigin: "0 0",
          transform: `translate(${w / 2 - x * w * c.s}px, ${h / 2 - y * h * c.s}px) scale(${c.s})`,
        }}
      />
    </div>
  );
}

export function BrowserFrame({ width, url = "app.neoscool.com", children }: { width: number; url?: string; children: ReactNode }) {
  const bar = Math.round(width * 0.028);
  return (
    <div style={{ width, borderRadius: width * 0.012, overflow: "hidden", boxShadow: "0 40px 120px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)", background: "#fff" }}>
      <div style={{ height: bar, background: "#eef1f7", display: "flex", alignItems: "center", gap: bar * 0.3, padding: `0 ${bar * 0.5}px` }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span key={c} style={{ width: bar * 0.32, height: bar * 0.32, borderRadius: "50%", background: c }} />
        ))}
        <span
          style={{
            marginLeft: bar * 0.6,
            flex: 1,
            maxWidth: width * 0.4,
            height: bar * 0.58,
            borderRadius: bar,
            background: "#fff",
            color: "#667085",
            fontFamily: font,
            fontSize: bar * 0.34,
            display: "flex",
            alignItems: "center",
            paddingLeft: bar * 0.5,
          }}
        >
          🔒 {url}
        </span>
      </div>
      {children}
    </div>
  );
}

export function PhoneFrame({ width, children }: { width: number; children: ReactNode }) {
  const pad = width * 0.035;
  return (
    <div style={{ width, padding: pad, borderRadius: width * 0.16, background: "linear-gradient(145deg,#1d2433,#0a0e17)", boxShadow: "0 40px 100px rgba(0,0,0,0.6), inset 0 0 0 2px rgba(255,255,255,0.08)", position: "relative" }}>
      <div style={{ borderRadius: width * 0.13, overflow: "hidden", position: "relative" }}>{children}</div>
      <div style={{ position: "absolute", top: pad + width * 0.025, left: "50%", transform: "translateX(-50%)", width: width * 0.3, height: width * 0.075, borderRadius: width, background: "#000" }} />
    </div>
  );
}

export function TabletFrame({ width, children }: { width: number; children: ReactNode }) {
  const pad = width * 0.025;
  return (
    <div style={{ width, padding: pad, borderRadius: width * 0.045, background: "linear-gradient(145deg,#232a3a,#0b0f18)", boxShadow: "0 40px 110px rgba(0,0,0,0.6), inset 0 0 0 2px rgba(255,255,255,0.07)" }}>
      <div style={{ borderRadius: width * 0.022, overflow: "hidden" }}>{children}</div>
    </div>
  );
}

/** Document officiel (PDF réel rendu en image) posé comme une feuille. */
export function Paper({ src, width, rotate = 0, style }: { src: string; width: number; rotate?: number; style?: CSSProperties }) {
  return (
    <Img
      src={staticFile(`captures/${src}.png`)}
      style={{ width, borderRadius: 6, boxShadow: "0 30px 80px rgba(0,0,0,0.5)", transform: `rotate(${rotate}deg)`, background: "#fff", ...style }}
    />
  );
}

export const deviceColors = { bar: brand.navy };
