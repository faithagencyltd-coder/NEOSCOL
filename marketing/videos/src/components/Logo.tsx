import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { brand, font } from "../theme";

/** Mot-symbole « .NeoScool » (orthographe officielle) : point orange, Neo foncé, Scool bleu. */
export function Wordmark({ size, delay = 0, dark = false }: { size: number; delay?: number; dark?: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const letters = ["N", "e", "o", "S", "c", "o", "o", "l"];
  return (
    <div style={{ display: "flex", alignItems: "baseline", fontFamily: font, fontWeight: 700, fontSize: size, letterSpacing: -size * 0.03 }}>
      <span style={{ color: brand.orange, transform: `scale(${spring({ frame: frame - delay, fps, config: { damping: 9 } })})`, display: "inline-block" }}>.</span>
      {letters.map((l, i) => {
        const p = spring({ frame: frame - delay - 4 - i * 2, fps, config: { damping: 16 } });
        return (
          <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${(1 - p) * size * 0.4}px)`, color: i < 3 ? (dark ? brand.navy : "#ffffff") : brand.sky }}>
            {l}
          </span>
        );
      })}
    </div>
  );
}

export function Mark({ size, delay = 0 }: { size: number; delay?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 12, stiffness: 90 } });
  const glow = 0.5 + 0.5 * Math.sin(frame / 12);
  return (
    <div style={{ position: "relative", width: size, height: size, transform: `scale(${p}) rotate(${(1 - p) * -25}deg)` }}>
      <div style={{ position: "absolute", inset: -size * 0.25, borderRadius: "50%", background: `radial-gradient(circle, rgba(58,160,255,${0.25 + glow * 0.15}), transparent 65%)` }} />
      <Img src={staticFile("brand/neoscool-mark.png")} style={{ width: size, height: size, position: "relative" }} />
    </div>
  );
}

export function Tagline({ text, size, delay = 0 }: { text: string; size: number; delay?: number }) {
  const frame = useCurrentFrame();
  const o = interpolate(frame - delay, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div style={{ fontFamily: font, fontWeight: 500, fontSize: size, color: brand.mist, opacity: o, letterSpacing: size * 0.02 }}>{text}</div>;
}
