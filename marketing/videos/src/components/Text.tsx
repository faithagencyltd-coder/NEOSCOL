import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import { brand, font } from "../theme";

/** Titre cinétique : mots révélés par masque, légère montée. */
export function KineticTitle({ text, size, delay = 0, color = brand.white, accentWords = [], accent, align = "left", weight = 700 }: {
  text: string; size: number; delay?: number; color?: string; accentWords?: string[]; accent?: string; align?: "left" | "center"; weight?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  return (
    <div style={{ fontFamily: font, fontWeight: weight, fontSize: size, lineHeight: 1.12, color, textAlign: align, letterSpacing: -size * 0.02, display: "flex", flexWrap: "wrap", justifyContent: align === "center" ? "center" : "flex-start", columnGap: size * 0.26 }}>
      {words.map((w, i) => {
        const p = spring({ frame: frame - delay - i * 3, fps, config: { damping: 18, stiffness: 120 } });
        const hot = accentWords.some((a) => w.toLowerCase().replace(/[.,!?:]/g, "") === a.toLowerCase());
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingBottom: size * 0.08 }}>
            <span style={{ display: "inline-block", transform: `translateY(${(1 - p) * 110}%)`, opacity: p, color: hot && accent ? accent : undefined }}>{w}</span>
          </span>
        );
      })}
    </div>
  );
}

export function Eyebrow({ text, accent, size, delay = 0 }: { text: string; accent: string; size: number; delay?: number }) {
  const frame = useCurrentFrame();
  const o = interpolate(frame - delay, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const w = interpolate(frame - delay, [0, 18], [0, size * 2.2], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.6, opacity: o, fontFamily: font, fontWeight: 600, fontSize: size, letterSpacing: size * 0.18, textTransform: "uppercase", color: accent }}>
      <span style={{ width: w, height: 3, borderRadius: 3, background: accent }} />
      {text}
    </div>
  );
}

/** Pastilles de mots-clés qui apparaissent l'une après l'autre. */
export function Chips({ items, accent, size, delay = 0, align = "left" }: { items: string[]; accent: string; size: number; delay?: number; align?: "left" | "center" }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: size * 0.6, justifyContent: align === "center" ? "center" : "flex-start" }}>
      {items.map((item, i) => {
        const p = spring({ frame: frame - delay - i * 7, fps, config: { damping: 14 } });
        return (
          <span
            key={item}
            style={{
              fontFamily: font,
              fontWeight: 600,
              fontSize: size,
              color: brand.white,
              padding: `${size * 0.45}px ${size * 0.9}px`,
              borderRadius: size * 2,
              background: "rgba(255,255,255,0.08)",
              border: `1.5px solid ${accent}`,
              boxShadow: `0 0 ${size}px ${accent}55`,
              transform: `scale(${0.6 + 0.4 * p})`,
              opacity: p,
            }}
          >
            {item}
          </span>
        );
      })}
    </div>
  );
}
