import { Clock, CloudOff, Wifi, RefreshCw, CheckCircle2, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, random, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { Background } from "../components/Background";
import { Captions } from "../components/Captions";
import { BrowserFrame, PhoneFrame, Shot, TabletFrame } from "../components/Devices";
import { Mark, Tagline, Wordmark } from "../components/Logo";
import { PushBanner } from "../components/Overlays";
import { Chips, KineticTitle } from "../components/Text";
import { brand, font } from "../theme";
import { FILM, type FilmFx, type FilmShot, type FilmSpec } from "./scenes";
import script from "./script.json";
import { filmFrames, filmTimeline, VOICE_LEAD, type Cut } from "./timing";

const ACCENT = "#2f7bff";
const ease = Easing.bezier(0.45, 0, 0.2, 1);
const text = Object.fromEntries((script as { id: string; text: string }[]).map((s) => [s.id, s.text]));

function useLayout() {
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  return { width, height, vertical, u: vertical ? width / 1080 : width / 1920 };
}

/** Entrée et sortie de scène : « plongée » douce (zoom + fondu). */
function Dive({ frames, children }: { frames: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  const inP = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp", easing: ease });
  const outP = interpolate(frame, [frames - 12, frames], [0, 1], { extrapolateLeft: "clamp", easing: ease });
  return (
    <AbsoluteFill style={{ opacity: inP * (1 - outP), transform: `scale(${1.06 - 0.06 * inP + 0.08 * outP})`, filter: `blur(${(1 - inP) * 8 + outP * 6}px)` }}>{children}</AbsoluteFill>
  );
}

/** Le « fil NeoScool » : une ligne lumineuse traverse la scène, une étincelle orange la parcourt. */
function Thread({ frames, target }: { frames: number; target: [number, number] }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const p0: [number, number] = [-40, height * 0.82];
  const p3: [number, number] = [width + 40, height * 0.18];
  const c1: [number, number] = [target[0] - width * 0.25, target[1] + height * 0.3];
  const c2: [number, number] = [target[0] + width * 0.15, target[1] - height * 0.35];
  const d = `M${p0[0]},${p0[1]} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p3[0]},${p3[1]}`;
  const draw = interpolate(frame, [4, frames * 0.55], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const tt = interpolate(frame, [4, frames - 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bez = (a: number, b: number, c: number, e: number, t: number) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * e;
  const sx = bez(p0[0], c1[0], c2[0], p3[0], tt);
  const sy = bez(p0[1], c1[1], c2[1], p3[1], tt);
  const len = width * 2.2;
  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <defs>
        <linearGradient id="thread" x1="0" x2="1">
          <stop offset="0" stopColor={ACCENT} stopOpacity="0" />
          <stop offset="0.5" stopColor="#6fb4ff" stopOpacity="0.9" />
          <stop offset="1" stopColor={ACCENT} stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke="url(#thread)" strokeWidth={4} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - draw)} style={{ filter: `drop-shadow(0 0 10px ${ACCENT})` }} />
      <circle cx={sx} cy={sy} r={9} fill={brand.orange} style={{ filter: `drop-shadow(0 0 14px ${brand.orange})` }} opacity={tt > 0 && tt < 1 ? 1 : 0} />
    </svg>
  );
}

function Device({ shot, frames, vertical, u }: { shot: FilmShot; frames: number; vertical: boolean; u: number }) {
  if (shot.device === "phone") {
    const w = (vertical ? 560 : 360) * u;
    const inner = w * 0.93;
    return (
      <PhoneFrame width={w}>
        <Shot src={shot.src} w={inner} h={inner * 2.164} move={shot.move} duration={frames} />
      </PhoneFrame>
    );
  }
  if (shot.device === "tablet") {
    const w = (vertical ? 1000 : 800) * u;
    const inner = w * 0.95;
    return (
      <TabletFrame width={w}>
        <Shot src={shot.src} w={inner} h={inner * 0.695} move={shot.move} duration={frames} />
      </TabletFrame>
    );
  }
  const w = (vertical ? 1000 : 920) * u;
  return (
    <BrowserFrame width={w} url="NeoScool">
      <Shot src={shot.src} w={w} h={w * 0.625} move={shot.move} duration={frames} />
    </BrowserFrame>
  );
}

/** Plusieurs écrans dans la scène : fondu enchaîné, chacun avec son mouvement de caméra. */
function Shots({ shots, frames }: { shots: FilmShot[]; frames: number }) {
  const frame = useCurrentFrame();
  const { vertical, u } = useLayout();
  const part = frames / shots.length;
  return (
    <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
      {shots.map((shot, i) => {
        const start = i * part;
        const o = i === 0 ? interpolate(frame, [part - 8, part + 6], [1, shots.length > 1 ? 0 : 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : interpolate(frame, [start - 8, start + 6, start + part - 8, start + part + 6], [0, 1, 1, i === shots.length - 1 ? 1 : 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const lift = spring({ frame: frame - start, fps: 30, config: { damping: 18 } });
        return (
          <div key={shot.src + i} style={{ gridArea: "1 / 1", opacity: o, transform: `translateY(${(1 - lift) * 40 * u}px) perspective(1800px) rotateY(${vertical ? 0 : -6 + 4 * lift}deg)` }}>
            <Sequence from={Math.round(start)} layout="none">
              <Device shot={shot} frames={Math.round(part)} vertical={vertical} u={u} />
            </Sequence>
          </div>
        );
      })}
    </div>
  );
}

function TimeCard({ time, place, u }: { time?: string; place: string; u: number }) {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [2, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 * u, opacity: p, transform: `translateX(${(1 - p) * -30 * u}px)`, fontFamily: font }}>
      {time ? (
        <span style={{ display: "flex", alignItems: "center", gap: 10 * u, padding: `${8 * u}px ${16 * u}px`, borderRadius: 999, background: "rgba(247,147,30,0.14)", border: `1.5px solid ${brand.orange}`, color: brand.orange, fontWeight: 700, fontSize: 30 * u }}>
          <Clock size={28 * u} /> {time}
        </span>
      ) : null}
      <span style={{ display: "flex", alignItems: "center", gap: 8 * u, color: brand.mist, fontWeight: 500, fontSize: 30 * u }}>
        <MapPin size={26 * u} /> {place}
      </span>
    </div>
  );
}

function VoiceWave({ u }: { u: number }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 * u, height: 60 * u }}>
      {new Array(18).fill(0).map((_, i) => {
        const h = 10 + Math.abs(Math.sin(frame / 4 + i * 0.7)) * 44 * (0.5 + random(`w${i}`) * 0.5);
        return <span key={i} style={{ width: 7 * u, height: h * u, borderRadius: 6, background: i % 4 === 0 ? brand.orange : "#6fb4ff" }} />;
      })}
      <span style={{ marginLeft: 16 * u, fontFamily: font, fontSize: 30 * u, fontWeight: 600, color: brand.white }}>« Bonjour Ibrahim, bienvenue. »</span>
    </div>
  );
}

function Checks({ count, frames, u }: { count: number; frames: number; u: number }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", gap: 12 * u }}>
      {new Array(count).fill(0).map((_, i) => {
        const at = frames * 0.25 + i * 8;
        const p = spring({ frame: frame - at, fps: 30, config: { damping: 12 } });
        return <CheckCircle2 key={i} size={46 * u} color="#34d399" style={{ transform: `scale(${p})`, opacity: p }} />;
      })}
    </div>
  );
}

function OfflineStatus({ frames, u }: { frames: number; u: number }) {
  const frame = useCurrentFrame();
  const steps = [
    { at: 0, label: "En ligne", icon: Wifi, color: "#34d399" },
    { at: 0.18, label: "Hors ligne — l'appel continue", icon: CloudOff, color: "#fbbf24" },
    { at: 0.45, label: "3 opérations en attente", icon: CloudOff, color: "#fbbf24" },
    { at: 0.65, label: "Réseau revenu — synchronisation", icon: RefreshCw, color: "#6fb4ff" },
    { at: 0.82, label: "Tout est synchronisé", icon: CheckCircle2, color: "#34d399" },
  ];
  const current = [...steps].reverse().find((s) => frame >= s.at * frames) ?? steps[0]!;
  const Icon = current.icon;
  return (
    <div key={current.label} style={{ display: "flex", alignItems: "center", gap: 14 * u, padding: `${12 * u}px ${22 * u}px`, borderRadius: 999, background: "rgba(3,8,24,0.7)", border: `2px solid ${current.color}`, color: current.color, fontFamily: font, fontWeight: 700, fontSize: 32 * u, width: "fit-content" }}>
      <Icon size={34 * u} style={{ transform: current.icon === RefreshCw ? `rotate(${frame * 8}deg)` : undefined }} /> {current.label}
    </div>
  );
}

function Stamp({ label, frames, u }: { label: string; frames: number; u: number }) {
  const frame = useCurrentFrame();
  const p = spring({ frame: frame - frames * 0.35, fps: 30, config: { damping: 9, stiffness: 140 } });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 * u, padding: `${12 * u}px ${24 * u}px`, borderRadius: 16 * u, border: "3px solid #34d399", color: "#34d399", fontFamily: font, fontWeight: 800, fontSize: 36 * u, transform: `scale(${2 - p}) rotate(-6deg)`, opacity: p, width: "fit-content", boxShadow: "0 0 30px rgba(52,211,153,0.5)" }}>
      <CheckCircle2 size={38 * u} /> {label}
    </div>
  );
}

function Moment({ spec, frames }: { spec: Extract<FilmSpec, { kind: "moment" }>; frames: number }) {
  const { width, height, vertical, u } = useLayout();
  const fx = spec.fx ?? [];
  const push = fx.find((f): f is Extract<FilmFx, { kind: "push" }> => f.kind === "push");
  const phoneScene = spec.shots.every((s) => s.device === "phone");
  const textBlock = (
    <div style={{ display: "grid", gap: 26 * u, maxWidth: vertical ? width * 0.86 : width * 0.33, flexShrink: 0 }}>
      <TimeCard time={spec.time} place={spec.place} u={u} />
      <KineticTitle text={spec.title} size={(vertical ? 76 : 70) * u} delay={8} accentWords={spec.accentWords} accent="#6fb4ff" align={vertical ? "center" : "left"} />
      {spec.chips ? <Chips items={spec.chips} accent={ACCENT} size={(vertical ? 30 : 26) * u} delay={20} align={vertical ? "center" : "left"} /> : null}
      {fx.some((f) => f.kind === "voice") ? <Sequence from={Math.round(frames * 0.5)} layout="none"><VoiceWave u={u} /></Sequence> : null}
      {fx.map((f, i) => (f.kind === "checks" ? <Checks key={i} count={f.count} frames={frames} u={u} /> : null))}
      {fx.some((f) => f.kind === "offline") ? <OfflineStatus frames={frames} u={u} /> : null}
      {fx.map((f, i) => (f.kind === "stamp" ? <Stamp key={i} label={f.text} frames={frames} u={u} /> : null))}
    </div>
  );
  const device = (
    <div style={{ position: "relative" }}>
      <Shots shots={spec.shots} frames={frames} />
      {push ? (
        <Sequence from={Math.round(frames * push.at)} layout="none">
          <div style={{ position: "absolute", left: phoneScene ? 0 : "50%", right: phoneScene ? 0 : undefined, top: 0, width: phoneScene ? undefined : 420 * u, transform: phoneScene ? undefined : "translateX(-50%)", height: 200 * u }}>
            <PushBanner title={push.title} body={push.body} start={0} width={phoneScene ? (vertical ? 560 : 360) * u : 420 * u} accent={ACCENT} />
          </div>
        </Sequence>
      ) : null}
    </div>
  );
  const target: [number, number] = vertical ? [width * 0.5, height * 0.62] : [width * 0.7, height * 0.5];
  return (
    <AbsoluteFill>
      <Thread frames={frames} target={target} />
      {vertical ? (
        <AbsoluteFill style={{ padding: `${150 * u}px ${70 * u}px ${260 * u}px`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", gap: 40 * u }}>
          {textBlock}
          {device}
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ padding: `0 ${110 * u}px 110px`, display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 60 * u }}>
          {textBlock}
          {device}
        </AbsoluteFill>
      )}
      {fx.some((f) => f.kind === "layers") ? <Layers frames={frames} /> : null}
    </AbsoluteFill>
  );
}

/** Les années s'empilent : rien ne se perd. */
function Layers({ frames }: { frames: number }) {
  const frame = useCurrentFrame();
  const { u, vertical } = useLayout();
  const years = ["2023-2024", "2024-2025", "2025-2026", "2026-2027"];
  return (
    <div style={{ position: "absolute", left: vertical ? "50%" : 110 * u, bottom: vertical ? 1200 * u : 150 * u, transform: vertical ? "translateX(-50%)" : undefined, display: "flex", gap: 10 * u }}>
      {years.map((y, i) => {
        const p = spring({ frame: frame - frames * 0.3 - i * 8, fps: 30, config: { damping: 14 } });
        return (
          <span key={y} style={{ fontFamily: font, fontSize: 22 * u, fontWeight: 600, color: "#fff", padding: `${6 * u}px ${12 * u}px`, borderRadius: 10 * u, background: `rgba(47,123,255,${0.15 + i * 0.12})`, border: "1px solid rgba(255,255,255,0.2)", opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
            {y}
          </span>
        );
      })}
    </div>
  );
}

function LogoScene({ frames, line }: { frames: number; line?: string }) {
  const frame = useCurrentFrame();
  const { width, height, u } = useLayout();
  const dots = new Array(26).fill(0).map((_, i) => ({ x: random(`lx${i}`) * width, y: random(`ly${i}`) * height }));
  const converge = interpolate(frame, [0, frames * 0.45], [0, 1], { extrapolateRight: "clamp", easing: ease });
  const cx = width / 2;
  const cy = height * 0.42;
  return (
    <AbsoluteFill>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        {dots.map((d, i) => {
          const x = d.x + (cx - d.x) * converge;
          const y = d.y + (cy - d.y) * converge;
          const n = dots[(i + 3) % dots.length]!;
          const nx = n.x + (cx - n.x) * converge;
          const ny = n.y + (cy - n.y) * converge;
          return (
            <g key={i} opacity={1 - converge * 0.85}>
              <line x1={x} y1={y} x2={nx} y2={ny} stroke="#6fb4ff" strokeOpacity={0.35} strokeWidth={1.5} />
              <circle cx={x} cy={y} r={4} fill={i % 7 === 0 ? brand.orange : "#bcd9ff"} />
            </g>
          );
        })}
      </svg>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30 * u }}>
        <Mark size={220 * u} delay={Math.round(frames * 0.35)} />
        <Wordmark size={120 * u} delay={Math.round(frames * 0.5)} />
        {line ? <Tagline text={line} size={40 * u} delay={Math.round(frames * 0.65)} /> : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Mosaic({ spec, frames }: { spec: Extract<FilmSpec, { kind: "mosaic" }>; frames: number }) {
  const frame = useCurrentFrame();
  const { width, height, vertical, u } = useLayout();
  const cols = vertical ? 2 : 4;
  const tileW = vertical ? 440 * u : 380 * u;
  const tileH = tileW * 0.625;
  const gap = 36 * u;
  const rows = Math.ceil(spec.tiles.length / cols);
  const gridW = cols * tileW + (cols - 1) * gap;
  const gridH = rows * tileH + (rows - 1) * gap;
  const ox = (width - gridW) / 2;
  const oy = (height - gridH) / 2 + (vertical ? 60 * u : 30 * u);
  const back = interpolate(frame, [0, frames], [1.08, 0.96]);
  const centers = spec.tiles.map((_, i) => [ox + (i % cols) * (tileW + gap) + tileW / 2, oy + Math.floor(i / cols) * (tileH + gap) + tileH / 2]);
  const draw = interpolate(frame, [frames * 0.25, frames * 0.8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ transform: `scale(${back})` }}>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        {centers.map(([x, y], i) => (
          <line key={i} x1={x} y1={y} x2={width / 2} y2={height / 2 + 30 * u} stroke="#6fb4ff" strokeWidth={3} strokeOpacity={0.6 * draw} strokeDasharray="8 8" style={{ filter: `drop-shadow(0 0 8px ${ACCENT})` }} />
        ))}
      </svg>
      {spec.tiles.map((src, i) => {
        const p = spring({ frame: frame - i * 4, fps: 30, config: { damping: 16 } });
        const [x, y] = centers[i]!;
        return (
          <div key={src} style={{ position: "absolute", left: x! - tileW / 2, top: y! - tileH / 2, width: tileW, height: tileH, borderRadius: 14 * u, overflow: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,0.5)", border: "2px solid rgba(111,180,255,0.35)", opacity: p, transform: `scale(${0.8 + 0.2 * p})` }}>
            <Img src={staticFile(`captures/${src}.png`)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
          </div>
        );
      })}
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", top: 30 * u }}>
        <div style={{ padding: `${18 * u}px ${36 * u}px`, borderRadius: 999, background: "linear-gradient(135deg,#0b1f4f,#1f6bff)", boxShadow: `0 0 60px ${ACCENT}`, opacity: draw }}>
          <KineticTitle text={spec.title} size={64 * u} delay={Math.round(frames * 0.3)} align="center" />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Evening({ spec, frames }: { spec: Extract<FilmSpec, { kind: "evening" }>; frames: number }) {
  const frame = useCurrentFrame();
  const { u } = useLayout();
  const warm = interpolate(frame, [0, frames], [0, 1]);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 80% at 50% 100%, rgba(247,147,30,${0.35 * warm}), transparent 60%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30 * u }}>
      <TimeCard time={spec.time} place="Fin de journée" u={u} />
      <KineticTitle text={spec.line} size={72 * u} delay={6} align="center" accentWords={["connecté."]} accent={brand.orange} />
    </AbsoluteFill>
  );
}

function Cta({ frames }: { frames: number }) {
  const frame = useCurrentFrame();
  const { u } = useLayout();
  const o = interpolate(frame, [frames * 0.45, frames * 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <LogoScene frames={Math.min(frames, 150)} />
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", paddingBottom: 190 * u, gap: 14 * u, opacity: o }}>
        <span style={{ fontFamily: font, fontSize: 46 * u, fontWeight: 600, color: brand.white }}>La gestion scolaire, autrement.</span>
        <span style={{ fontFamily: font, fontSize: 34 * u, fontWeight: 500, color: brand.sky, letterSpacing: 2 }}>www.Neoscool.com</span>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function SceneBody({ id, frames }: { id: string; frames: number }) {
  const spec = FILM[id];
  if (!spec) throw new Error(`Scène inconnue : ${id}`);
  switch (spec.kind) {
    case "logo":
      return <LogoScene frames={frames} line={spec.line} />;
    case "moment":
      return <Moment spec={spec} frames={frames} />;
    case "mosaic":
      return <Mosaic spec={spec} frames={frames} />;
    case "evening":
      return <Evening spec={spec} frames={frames} />;
    case "cta":
      return <Cta frames={frames} />;
  }
}

/** Effets sonores liés aux scènes (bip de scan, voix de la tablette, notifications…). */
function SceneSfx({ id, frames }: { id: string; frames: number }) {
  const spec = FILM[id];
  const fx = spec && spec.kind === "moment" ? (spec.fx ?? []) : [];
  const sfx: { at: number; src: string; volume: number }[] = [{ at: 0, src: "musique/film/thread.wav", volume: 0.25 }];
  for (const f of fx) {
    if (f.kind === "voice") {
      sfx.push({ at: Math.round(frames * 0.45), src: "musique/film/scan.wav", volume: 0.5 }, { at: Math.round(frames * 0.5), src: "voix/film/tablette.wav", volume: 0.45 });
    }
    if (f.kind === "push") sfx.push({ at: Math.round(frames * f.at), src: "musique/film/notif.wav", volume: 0.5 });
    if (f.kind === "checks") for (let i = 0; i < f.count; i++) sfx.push({ at: Math.round(frames * 0.25 + i * 8), src: "musique/film/tick.wav", volume: 0.35 });
    if (f.kind === "stamp") sfx.push({ at: Math.round(frames * 0.35), src: "musique/film/chime.wav", volume: 0.5 });
    if (f.kind === "print") sfx.push({ at: Math.round(frames * 0.55), src: "musique/film/print.wav", volume: 0.35 });
    if (f.kind === "offline") sfx.push({ at: Math.round(frames * 0.65), src: "musique/film/sync.wav", volume: 0.5 }, { at: Math.round(frames * 0.82), src: "musique/film/chime.wav", volume: 0.4 });
  }
  if (id === "s09") sfx.push({ at: Math.round(frames * 0.7), src: "musique/film/chime.wav", volume: 0.4 });
  return (
    <>
      {sfx.map((s, i) => (
        <Sequence key={i} from={s.at} durationInFrames={Math.max(1, frames - s.at)} layout="none">
          <Audio src={staticFile(s.src)} volume={s.volume} />
        </Sequence>
      ))}
    </>
  );
}

/** Film officiel du module scolaire : montage complet (3 min) ou versions courtes. */
export function Film({ cut }: { cut: Cut }) {
  const scenes = filmTimeline(cut);
  const total = filmFrames(cut);
  return (
    <AbsoluteFill style={{ backgroundColor: brand.night }}>
      <Background accent={ACCENT} glow="rgba(47,123,255,0.5)" />
      <Audio src={staticFile(`musique/film/${cut}.wav`)} volume={(f) => interpolate(f, [0, 20, total - 30, total], [0, 0.2, 0.2, 0.12], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
      {scenes.map((s) => (
        <Sequence key={s.id} from={s.from} durationInFrames={s.frames}>
          <Dive frames={s.frames}>
            <SceneBody id={s.id} frames={s.frames} />
          </Dive>
          <SceneSfx id={s.id} frames={s.frames} />
          <Sequence from={VOICE_LEAD} durationInFrames={s.voiceFrames + 6} layout="none">
            <Audio src={staticFile(`voix/film/${s.id}.wav`)} volume={1} />
          </Sequence>
          {FILM[s.id]?.kind === "cta" ? null : <Captions text={text[s.id] ?? ""} start={VOICE_LEAD} frames={s.voiceFrames} />}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

/** Signature logo réutilisable (6 s ou 2 s). */
export function LogoSignature({ seconds }: { seconds: 6 | 2 }) {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: brand.night }}>
      <Background accent={ACCENT} glow="rgba(47,123,255,0.5)" />
      <Audio src={staticFile(`musique/film/logo-${seconds}s.wav`)} volume={0.5} />
      <LogoScene frames={seconds * fps} line={seconds === 6 ? "La gestion scolaire, autrement." : undefined} />
    </AbsoluteFill>
  );
}
