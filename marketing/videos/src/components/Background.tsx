import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";

import { brand } from "../theme";

/** Fond bleu nuit animé : halos colorés lents, grille fine, particules. */
export function Background({ accent, glow }: { accent: string; glow: string }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / 30;
  const blobs = [
    { x: 0.18 + 0.06 * Math.sin(t * 0.21), y: 0.25 + 0.05 * Math.cos(t * 0.17), r: 0.55, c: glow },
    { x: 0.85 + 0.05 * Math.cos(t * 0.15), y: 0.8 + 0.06 * Math.sin(t * 0.19), r: 0.6, c: "rgba(31,107,255,0.35)" },
    { x: 0.7 + 0.04 * Math.sin(t * 0.12), y: 0.1, r: 0.35, c: "rgba(247,147,30,0.12)" },
  ];
  const particles = new Array(38).fill(0).map((_, i) => {
    const speed = 0.2 + random(`s${i}`) * 0.6;
    const y = (random(`y${i}`) * height - frame * speed * 1.4 + height * 4) % (height + 40);
    return { x: random(`x${i}`) * width, y, size: 1.5 + random(`r${i}`) * 2.5, o: 0.15 + random(`o${i}`) * 0.35 };
  });
  const grid = Math.max(width, height) / 18;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 0%, ${brand.navy2} 0%, ${brand.navy} 40%, ${brand.night} 100%)` }}>
      {blobs.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: b.x * width - (b.r * width) / 2,
            top: b.y * height - (b.r * width) / 2,
            width: b.r * width,
            height: b.r * width,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${b.c} 0%, transparent 65%)`,
            filter: "blur(20px)",
          }}
        />
      ))}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${brand.faint} 1px, transparent 1px), linear-gradient(90deg, ${brand.faint} 1px, transparent 1px)`,
          backgroundSize: `${grid}px ${grid}px`,
          backgroundPosition: `${(-frame * 0.3) % grid}px ${(-frame * 0.2) % grid}px`,
          opacity: 0.18,
          maskImage: "radial-gradient(80% 70% at 50% 40%, black, transparent)",
        }}
      />
      {particles.map((p, i) => (
        <div key={i} style={{ position: "absolute", left: p.x, top: p.y, width: p.size, height: p.size, borderRadius: "50%", background: i % 5 === 0 ? accent : "#fff", opacity: p.o }} />
      ))}
      <AbsoluteFill style={{ background: "radial-gradient(100% 100% at 50% 50%, transparent 60%, rgba(0,0,0,0.45) 100%)", opacity: interpolate(frame, [0, 20], [0.6, 1], { extrapolateRight: "clamp" }) }} />
    </AbsoluteFill>
  );
}
