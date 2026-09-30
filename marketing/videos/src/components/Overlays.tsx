import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import { font } from "../theme";

/** Anneau lumineux qui attire l'œil sur une zone (coordonnées en px dans le cadre). */
export function Highlight({ x, y, w, h, color, delay = 0, radius = 14 }: { x: number; y: number; w: number; h: number; color: string; delay?: number; radius?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 14 } });
  const pulse = 0.6 + 0.4 * Math.sin((frame - delay) / 6);
  return (
    <div
      style={{
        position: "absolute",
        left: x - 6,
        top: y - 6,
        width: w + 12,
        height: h + 12,
        borderRadius: radius,
        border: `3px solid ${color}`,
        boxShadow: `0 0 ${24 * pulse}px ${color}, inset 0 0 ${12 * pulse}px ${color}55`,
        opacity: p,
        transform: `scale(${1.15 - 0.15 * p})`,
      }}
    />
  );
}

/** Curseur qui se déplace puis clique (onde). */
export function Cursor({ from, to, start, travel = 24, color }: { from: [number, number]; to: [number, number]; start: number; travel?: number; color: string }) {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [start, start + travel], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: (t) => 1 - Math.pow(1 - t, 3) });
  const x = from[0] + (to[0] - from[0]) * p;
  const y = from[1] + (to[1] - from[1]) * p;
  const click = frame - (start + travel);
  const ring = interpolate(click, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const visible = interpolate(frame, [start - 6, start], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: visible, pointerEvents: "none" }}>
      {click >= 0 && click < 14 ? (
        <div style={{ position: "absolute", left: -30 * ring, top: -30 * ring, width: 60 * ring, height: 60 * ring, borderRadius: "50%", border: `3px solid ${color}`, opacity: 1 - ring }} />
      ) : null}
      <svg width="34" height="34" viewBox="0 0 24 24" style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))", transform: `scale(${click >= 0 && click < 6 ? 0.85 : 1})` }}>
        <path d="M4 2 L4 20 L9 15 L12.5 22 L15.5 20.5 L12 13.8 L19 13.8 Z" fill="#fff" stroke="#111" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Notification push qui descend en haut d'un téléphone. */
export function PushBanner({ title, body, start, width, accent }: { title: string; body: string; start: number; width: number; accent: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - start, fps, config: { damping: 15 } });
  const s = width / 360;
  return (
    <div style={{ position: "absolute", left: "50%", top: 18 * s, width: width * 0.92, transform: `translate(-50%, ${(1 - p) * -140}%)`, opacity: p, background: "rgba(255,255,255,0.96)", borderRadius: 18 * s, padding: `${10 * s}px ${12 * s}px`, display: "flex", gap: 10 * s, boxShadow: "0 12px 30px rgba(0,0,0,0.35)", fontFamily: font }}>
      <div style={{ width: 34 * s, height: 34 * s, borderRadius: 9 * s, background: accent, flexShrink: 0 }} />
      <div style={{ display: "grid", gap: 2 * s }}>
        <span style={{ fontSize: 12 * s, fontWeight: 700, color: "#0b1f4f" }}>{title}</span>
        <span style={{ fontSize: 11 * s, color: "#475467", lineHeight: 1.3 }}>{body}</span>
      </div>
    </div>
  );
}
