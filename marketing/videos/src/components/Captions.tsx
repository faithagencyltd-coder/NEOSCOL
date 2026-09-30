import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { font } from "../theme";

function chunks(text: string, max: number): string[] {
  const parts = text.split(/(?<=[.?!…:;])\s+/);
  const out: string[] = [];
  for (const part of parts) {
    let line = "";
    for (const word of part.split(" ")) {
      if ((line + " " + word).trim().length > max && line) {
        out.push(line.trim());
        line = word;
      } else line += " " + word;
    }
    if (line.trim()) out.push(line.trim());
  }
  return out;
}

/** Sous-titres synchronisés sur la voix (répartis au prorata du texte). */
export function Captions({ text, start, frames }: { text: string; start: number; frames: number }) {
  const frame = useCurrentFrame() - start;
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const list = chunks(text.replace(/neoscool point com/g, "neoscool.com"), vertical ? 34 : 64);
  const total = list.reduce((s, c) => s + c.length, 0);
  let acc = 0;
  const timed = list.map((c) => {
    const from = (acc / total) * frames;
    acc += c.length;
    return { c, from, to: (acc / total) * frames };
  });
  const current = timed.find((t) => frame >= t.from && frame < t.to);
  if (!current || frame < 0) return null;
  const o = interpolate(frame, [current.from, current.from + 5], [0, 1], { extrapolateRight: "clamp" });
  const size = vertical ? 44 : 34;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: vertical ? 150 : 48, display: "flex", justifyContent: "center", opacity: o }}>
      <span style={{ maxWidth: vertical ? width * 0.86 : width * 0.72, textAlign: "center", fontFamily: font, fontWeight: 600, fontSize: size, lineHeight: 1.3, color: "#fff", background: "rgba(3,8,24,0.72)", padding: `${size * 0.3}px ${size * 0.7}px`, borderRadius: size * 0.5, backdropFilter: "blur(6px)" }}>
        {current.c}
      </span>
    </div>
  );
}
