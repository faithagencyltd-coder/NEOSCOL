import type { ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";

import { BrowserFrame, Paper, PhoneFrame, Shot, TabletFrame, type Move } from "../components/Devices";
import { Mark, Tagline, Wordmark } from "../components/Logo";
import { PushBanner } from "../components/Overlays";
import { Chips, Eyebrow, KineticTitle } from "../components/Text";
import { brand, font } from "../theme";
import { LEAD } from "../timing";
import { ICONS } from "./icons";
import type { SceneSpec, ShotSpec } from "./types";

export type SceneProps = { frames: number; voiceFrames: number; accent: { main: string; soft: string; glow: string; label: string } };

function useLayout() {
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  return { width, height, vertical, u: vertical ? width / 1080 : width / 1920 };
}

/** Entrée 3D douce + flottement de l'appareil. */
function Float({ children, delay = 0, frames }: { children: ReactNode; delay?: number; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 70 } });
  const out = interpolate(frame, [frames - 12, frames], [1, 0.96], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bob = Math.sin(frame / 28) * 6;
  return (
    <div style={{ perspective: 2200 }}>
      <div style={{ transform: `translateY(${(1 - p) * 90 + bob}px) rotateX(${(1 - p) * 16}deg) rotateY(${(1 - p) * -10}deg) scale(${(0.9 + 0.1 * p) * out})`, opacity: p, transformStyle: "preserve-3d" }}>{children}</div>
    </div>
  );
}

function deviceWidth(device: ShotSpec["device"], vertical: boolean, u: number) {
  if (device === "phone") return (vertical ? 470 : 400) * u;
  if (device === "tablet") return (vertical ? 1000 : 1060) * u;
  return (vertical ? 1000 : 1120) * u;
}

function DeviceShot({ shot, width, duration }: { shot: ShotSpec; width: number; duration: number }) {
  const move: Move | undefined = shot.move;
  if (shot.device === "phone") {
    const inner = width * 0.93;
    return (
      <PhoneFrame width={width}>
        <Shot src={shot.src} w={inner} h={inner * (844 / 390)} move={move} duration={duration} />
      </PhoneFrame>
    );
  }
  if (shot.device === "tablet") {
    const inner = width * 0.95;
    return (
      <TabletFrame width={width}>
        <Shot src={shot.src} w={inner} h={inner * (820 / 1180)} move={move} duration={duration} />
      </TabletFrame>
    );
  }
  return (
    <BrowserFrame width={width}>
      <Shot src={shot.src} w={width} h={width * (900 / 1440)} move={move} duration={duration} />
    </BrowserFrame>
  );
}

/** Suite de captures dans la scène : fondu enchaîné + léger zoom traversant. */
function ShotSequence({ shots, frames, vertical, u }: { shots: ShotSpec[]; frames: number; vertical: boolean; u: number }) {
  const frame = useCurrentFrame();
  const slice = frames / shots.length;
  return (
    <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
      {shots.map((shot, i) => {
        const start = i * slice;
        const end = start + slice;
        const fadeIn = i === 0 ? 1 : interpolate(frame, [start - 6, start + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
        const fadeOut = i === shots.length - 1 ? 1 : interpolate(frame, [end - 6, end + 10], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const o = Math.min(fadeIn, fadeOut);
        if (o <= 0) return null;
        const zoom = i === 0 ? 1 : interpolate(frame, [start - 6, start + 14], [1.08, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
        return (
          <div key={i} style={{ gridArea: "1 / 1", opacity: o, transform: `scale(${zoom})` }}>
            <LocalFrame offset={start}>
              <DeviceShot shot={shot} width={deviceWidth(shot.device, vertical, u)} duration={Math.max(slice + 10, 30)} />
            </LocalFrame>
          </div>
        );
      })}
    </div>
  );
}

/** Décale le temps pour les enfants (caméra propre à chaque capture). */
function LocalFrame({ offset, children }: { offset: number; children: ReactNode }) {
  return (
    <Sequence from={Math.round(offset)} layout="none">
      {children}
    </Sequence>
  );
}

function TextBlock({ eyebrow, title, accentWords, chips, accent, vertical, u }: { eyebrow?: string; title: string; accentWords?: string[]; chips?: string[]; accent: SceneProps["accent"]; vertical: boolean; u: number }) {
  return (
    <div style={{ display: "grid", gap: 28 * u, justifyItems: vertical ? "center" : "start", textAlign: vertical ? "center" : "left" }}>
      {eyebrow ? <Eyebrow text={eyebrow} accent={accent.soft} size={(vertical ? 30 : 24) * u} delay={4} /> : null}
      <KineticTitle text={title} size={(vertical ? 78 : 66) * u} delay={8} accentWords={accentWords} accent={accent.soft} align={vertical ? "center" : "left"} />
      {chips ? <Chips items={chips} accent={accent.main} size={(vertical ? 30 : 24) * u} delay={24} align={vertical ? "center" : "left"} /> : null}
    </div>
  );
}

function Split({ text, visual, vertical, u }: { text: ReactNode; visual: ReactNode; vertical: boolean; u: number }) {
  if (vertical) {
    return (
      <AbsoluteFill style={{ padding: `${170 * u}px ${60 * u}px ${330 * u}px`, display: "flex", flexDirection: "column", alignItems: "center", gap: 70 * u }}>
        <div style={{ minHeight: 400 * u, display: "flex", alignItems: "center" }}>{text}</div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>{visual}</div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ padding: `${90 * u}px ${100 * u}px ${150 * u}px`, display: "grid", gridTemplateColumns: `${560 * u}px 1fr`, alignItems: "center", gap: 60 * u }}>
      <div>{text}</div>
      <div style={{ display: "flex", justifyContent: "center" }}>{visual}</div>
    </AbsoluteFill>
  );
}

function VoiceWave({ accent, u }: { accent: string; u: number }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 * u, padding: `${14 * u}px ${22 * u}px`, borderRadius: 40 * u, background: "rgba(255,255,255,0.1)", border: `1px solid ${accent}` }}>
      <span style={{ fontFamily: font, color: "#fff", fontWeight: 600, fontSize: 22 * u, marginRight: 8 * u }}>« Bonjour Ibrahim, bienvenue ! »</span>
      {new Array(9).fill(0).map((_, i) => (
        <span key={i} style={{ width: 6 * u, borderRadius: 4, background: accent, height: (10 + 26 * Math.abs(Math.sin(frame / 4 + i * 0.9))) * u }} />
      ))}
    </div>
  );
}

export function Scene({ spec, frames, voiceFrames, accent }: SceneProps & { spec: SceneSpec }) {
  const { vertical, u, width, height } = useLayout();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (spec.kind === "hero") {
    const orbit = spec.icons;
    return (
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        {orbit.map((name, i) => {
          const I = ICONS[name];
          const a = (i / orbit.length) * Math.PI * 2 + frame / 90;
          const r = (vertical ? 470 : 470) * u;
          const p = spring({ frame: frame - 10 - i * 4, fps, config: { damping: 14 } });
          return (
            <div key={name} style={{ position: "absolute", left: width / 2 + Math.cos(a) * r * (vertical ? 0.95 : 1.75) - 40 * u, top: height / 2 + Math.sin(a) * r * (vertical ? 1.55 : 0.95) - 40 * u - 40 * u, width: 80 * u, height: 80 * u, borderRadius: 22 * u, display: "grid", placeItems: "center", background: "rgba(255,255,255,0.07)", border: `1px solid ${accent.main}88`, opacity: p * 0.9, transform: `scale(${p})` }}>
              <I color={accent.soft} size={38 * u} />
            </div>
          );
        })}
        <div style={{ display: "grid", justifyItems: "center", gap: 34 * u, marginTop: -40 * u }}>
          <Mark size={(vertical ? 220 : 190) * u} delay={2} />
          <Eyebrow text={accent.label} accent={accent.soft} size={(vertical ? 30 : 26) * u} delay={14} />
          <div style={{ maxWidth: (vertical ? 920 : 1300) * u }}>
            <KineticTitle text={spec.title} size={(vertical ? 92 : 96) * u} delay={20} accentWords={spec.accentWords} accent={accent.soft} align="center" />
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  if (spec.kind === "problem") {
    const suck = interpolate(frame, [frames - 26, frames - 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
    return (
      <AbsoluteFill>
        <div style={{ position: "absolute", top: (vertical ? 190 : 110) * u, left: 0, right: 0, display: "flex", justifyContent: "center", padding: `0 ${80 * u}px` }}>
          <div style={{ maxWidth: (vertical ? 940 : 1400) * u }}>
            <KineticTitle text={spec.title} size={(vertical ? 76 : 70) * u} delay={6} align="center" accentWords={["temps", "mieux", "mesure"]} accent={accent.soft} />
          </div>
        </div>
        {spec.items.map((item, i) => {
          const I = ICONS[item.icon];
          const cols = vertical ? 2 : 3;
          const col = i % cols;
          const row = Math.floor(i / cols);
          const cw = (vertical ? 440 : 470) * u;
          const ch = (vertical ? 250 : 190) * u;
          const gx = (vertical ? 40 : 50) * u;
          const totalW = cols * cw + (cols - 1) * gx;
          const baseX = (width - totalW) / 2 + col * (cw + gx);
          const baseY = (vertical ? 620 : 380) * u + row * (ch + (vertical ? 50 : 40) * u);
          const p = spring({ frame: frame - 18 - i * 6, fps, config: { damping: 12 } });
          const shake = Math.sin(frame / 2.5 + i) * 3 * u * (frame > 40 ? 1 : 0);
          const rot = (random2(i) - 0.5) * 10 + Math.sin(frame / 9 + i) * 2;
          const cx = width / 2 - cw / 2;
          const cy = height / 2 - ch / 2;
          const x = baseX + (cx - baseX) * suck + shake;
          const y = baseY + (cy - baseY) * suck;
          return (
            <div key={item.label} style={{ position: "absolute", left: x, top: y, width: cw, height: ch, transform: `rotate(${rot * (1 - suck)}deg) scale(${p * (1 - suck * 0.85)})`, opacity: p * (1 - suck), borderRadius: 22 * u, background: "linear-gradient(160deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04))", border: "1px solid rgba(255,255,255,0.16)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 * u, boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}>
              <div style={{ width: 70 * u, height: 70 * u, borderRadius: 18 * u, display: "grid", placeItems: "center", background: "rgba(255,80,80,0.15)", border: "1px solid rgba(255,120,120,0.45)" }}>
                <I color="#ff9b9b" size={36 * u} />
              </div>
              <span style={{ fontFamily: font, fontWeight: 600, fontSize: (vertical ? 34 : 30) * u, color: "#fff", textAlign: "center", padding: `0 ${14 * u}px` }}>{item.label}</span>
            </div>
          );
        })}
      </AbsoluteFill>
    );
  }

  if (spec.kind === "screen") {
    return (
      <Split
        vertical={vertical}
        u={u}
        text={
          <div style={{ display: "grid", gap: 30 * u, justifyItems: vertical ? "center" : "start" }}>
            <TextBlock eyebrow={spec.eyebrow} title={spec.title} accentWords={spec.accentWords} chips={spec.chips} accent={accent} vertical={vertical} u={u} />
            {spec.voice ? <VoiceWave accent={accent.main} u={u} /> : null}
          </div>
        }
        visual={
          <Float delay={6} frames={frames}>
            <div style={{ position: "relative" }}>
              <ShotSequence shots={spec.shots} frames={frames} vertical={vertical} u={u} />
              {spec.push ? (
                <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "center" }}>
                  <div style={{ position: "relative", width: deviceWidth("phone", vertical, u) * 0.93, marginTop: deviceWidth("phone", vertical, u) * 0.06 }}>
                    <PushBanner title={spec.push.title} body={spec.push.body} start={LEAD + Math.round(voiceFrames * 0.55)} width={deviceWidth("phone", vertical, u) * 0.93} accent={accent.main} />
                  </div>
                </div>
              ) : null}
            </div>
          </Float>
        }
      />
    );
  }

  if (spec.kind === "mosaic") {
    const tiles = spec.tiles;
    const n = tiles.length;
    const active = Math.min(n - 1, Math.max(0, Math.floor(((frame - LEAD) / Math.max(voiceFrames, 1)) * n)));
    return (
      <AbsoluteFill>
        <div style={{ position: "absolute", top: (vertical ? 170 : 80) * u, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <TextBlock eyebrow={spec.eyebrow} title={spec.title} accentWords={spec.accentWords} accent={accent} vertical u={u} />
        </div>
        {tiles.map((t, i) => {
          const p = spring({ frame: frame - 20 - i * 9, fps, config: { damping: 14 } });
          const on = spring({ frame: frame - (LEAD + (voiceFrames / n) * i), fps, config: { damping: 16 } });
          const isActive = i === active && frame >= LEAD;
          const w = t.device === "phone" ? (vertical ? 290 : 280) * u : (vertical ? 700 : 720) * u;
          const cx = vertical ? width / 2 + (i % 2 ? 110 : -110) * u : width / 2 + (i - (n - 1) / 2) * 300 * u;
          const cy = vertical ? (800 + i * 190) * u : height / 2 + 70 * u + (i % 2 ? 30 : -20) * u;
          const scale = (0.85 + 0.15 * p) * (isActive ? 1.08 : 0.94);
          return (
            <div key={t.src} style={{ position: "absolute", left: cx, top: cy, zIndex: isActive ? 20 : i, transform: `translate(-50%, -50%) translateY(${(1 - p) * 80}px) scale(${scale}) rotate(${(i % 2 ? 1 : -1) * (isActive ? 0 : 4)}deg)`, opacity: p * (isActive || frame < LEAD ? 1 : 0.75 + 0.25 * on), filter: isActive ? `drop-shadow(0 0 30px ${accent.glow})` : "none" }}>
              <DeviceShot shot={t} width={w} duration={frames} />
            </div>
          );
        })}
      </AbsoluteFill>
    );
  }

  if (spec.kind === "docs") {
    const papers = spec.papers;
    return (
      <Split
        vertical={vertical}
        u={u}
        text={<TextBlock eyebrow={spec.eyebrow} title={spec.title} accentWords={spec.accentWords} chips={spec.chips} accent={accent} vertical={vertical} u={u} />}
        visual={
          <div style={{ position: "relative", width: (vertical ? 900 : 1000) * u, height: (vertical ? 950 : 760) * u }}>
            {papers.map((src, i) => {
              const p = spring({ frame: frame - 10 - i * 10, fps, config: { damping: 15, stiffness: 80 } });
              const landscape = src.includes("diplome");
              const w = (landscape ? (vertical ? 660 : 820) : vertical ? 420 : 440) * u;
              const spread = (i - (papers.length - 1) / 2) * (vertical ? 170 : 230) * u;
              const rot = (i - (papers.length - 1) / 2) * 7;
              return (
                <div key={src} style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(calc(-50% + ${spread * p}px), calc(-50% + ${(1 - p) * 300}px)) rotate(${rot * p}deg)`, opacity: p, zIndex: landscape ? 10 : i }}>
                  <Paper src={src} width={w} />
                </div>
              );
            })}
            <div style={{ position: "absolute", right: 10 * u, bottom: 0, display: "flex", alignItems: "center", gap: 12 * u, padding: `${14 * u}px ${22 * u}px`, borderRadius: 40 * u, background: "rgba(22,163,74,0.18)", border: "1px solid #22c55e", fontFamily: font, fontWeight: 600, fontSize: 26 * u, color: "#dcfce7", opacity: interpolate(frame, [LEAD + voiceFrames * 0.5, LEAD + voiceFrames * 0.5 + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), zIndex: 20 }}>
              ✓ Document authentique — vérifié par QR code
            </div>
          </div>
        }
      />
    );
  }

  if (spec.kind === "benefits") {
    const n = spec.items.length;
    return (
      <AbsoluteFill style={{ alignItems: "center", padding: `${(vertical ? 180 : 100) * u}px ${70 * u}px ${(vertical ? 330 : 160) * u}px`, display: "flex", flexDirection: "column", gap: 60 * u }}>
        <KineticTitle text={spec.title} size={(vertical ? 76 : 66) * u} delay={4} align="center" />
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: vertical ? "1fr" : `repeat(${n}, 1fr)`, gap: (vertical ? 28 : 30) * u, width: "100%", alignContent: "center" }}>
          {spec.items.map((b, i) => {
            const I = ICONS[b.icon];
            const at = LEAD + (voiceFrames / n) * i;
            const p = spring({ frame: frame - at + 6, fps, config: { damping: 14 } });
            const lit = interpolate(frame, [at, at + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <div key={b.who} style={{ opacity: 0.25 + 0.75 * p, transform: `translateY(${(1 - p) * 40}px)`, borderRadius: 28 * u, padding: `${(vertical ? 30 : 44) * u}px ${34 * u}px`, background: `linear-gradient(170deg, rgba(255,255,255,${0.06 + 0.08 * lit}), rgba(255,255,255,0.02))`, border: `1.5px solid ${lit > 0.5 ? accent.main : "rgba(255,255,255,0.12)"}`, boxShadow: lit > 0.5 ? `0 0 40px ${accent.glow}` : "none", display: "flex", flexDirection: vertical ? "row" : "column", alignItems: vertical ? "center" : "flex-start", gap: 26 * u }}>
                <div style={{ width: 92 * u, height: 92 * u, flexShrink: 0, borderRadius: 24 * u, display: "grid", placeItems: "center", background: `${accent.main}33` }}>
                  <I color={accent.soft} size={48 * u} />
                </div>
                <div style={{ display: "grid", gap: 10 * u }}>
                  <span style={{ fontFamily: font, fontWeight: 700, fontSize: 38 * u, color: "#fff" }}>{b.who}</span>
                  <span style={{ fontFamily: font, fontWeight: 500, fontSize: (vertical ? 30 : 28) * u, color: brand.mist, lineHeight: 1.35 }}>{b.text}</span>
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    );
  }

  // cta
  const btn = spring({ frame: frame - 40, fps, config: { damping: 10 } });
  const press = frame > 90 && frame < 98 ? 0.94 : 1;
  const fadeOut = interpolate(frame, [frames - 20, frames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: fadeOut }}>
      <div style={{ display: "grid", justifyItems: "center", gap: 30 * u, textAlign: "center", padding: `0 ${60 * u}px` }}>
        <Mark size={(vertical ? 230 : 170) * u} />
        <Wordmark size={(vertical ? 120 : 110) * u} delay={8} />
        <Eyebrow text={accent.label} accent={accent.soft} size={(vertical ? 30 : 26) * u} delay={18} />
        <Tagline text={spec.slogan} size={(vertical ? 40 : 38) * u} delay={24} />
        <div style={{ marginTop: 20 * u, transform: `scale(${btn * press})`, opacity: btn, padding: `${26 * u}px ${56 * u}px`, borderRadius: 60 * u, background: `linear-gradient(135deg, ${brand.orange}, #ff6a00)`, fontFamily: font, fontWeight: 700, fontSize: (vertical ? 44 : 38) * u, color: "#fff", boxShadow: `0 16px 50px rgba(247,147,30,0.5)` }}>
          Essai gratuit 20 jours
        </div>
        <div style={{ fontFamily: font, fontWeight: 600, fontSize: (vertical ? 46 : 40) * u, color: "#fff", opacity: interpolate(frame, [55, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), letterSpacing: 1 }}>
          neoscool.com
        </div>
      </div>
    </AbsoluteFill>
  );
}

function random2(i: number) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
