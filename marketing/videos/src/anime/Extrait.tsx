import { BellRing, ChartColumn, ClipboardCheck, GraduationCap, QrCode, Wallet, type LucideIcon } from "lucide-react";
import { AbsoluteFill, Audio, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";

import { brand, font } from "../theme";
import { Character, DIRECTOR, mixPose, POSES, type Look } from "./Character";

/**
 * Film animé (motion design) — extrait de validation : scène 1 « le problème »
 * (bureau débordé, papiers, file d'attente) puis scène 2 « NeoScool arrive »
 * (les papiers deviennent des fonctions, le directeur respire). 100 % illustré.
 */
export const EXTRAIT_FPS = 30;
export const EXTRAIT_FRAMES = 465;
const S2 = 246; // début de la scène 2
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const MOTHER: Look = { skin: "#5c3820", skinShade: "#4a2c18", hair: "#1a1410", outfit: "#1e9e6a", outfitShade: "#177d54", headwrap: "#f7931e" };
const FATHER: Look = { skin: "#8a5a36", skinShade: "#714528", hair: "#16110d", outfit: "#3a7bd5", outfitShade: "#2e63ad", shirt: "#e9f1ff" };
const YOUNG: Look = { skin: "#6e4428", skinShade: "#5a361f", hair: "#120d0a", outfit: "#8a63d2", outfitShade: "#6d4cb0" };

// ---------------------------------------------------------------------------
// Décor scène 1
// ---------------------------------------------------------------------------
function Office({ frame }: { frame: number }) {
  const handFast = frame * 9;
  return (
    <g>
      <defs>
        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3f6fc" />
          <stop offset="1" stopColor="#dde6f5" />
        </linearGradient>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fd0ff" />
          <stop offset="1" stopColor="#d7efff" />
        </linearGradient>
      </defs>
      <rect width={1920} height={1080} fill="url(#wall)" />
      <rect y={860} width={1920} height={220} fill="#c7d3e8" />
      <rect y={856} width={1920} height={10} fill="#b3c1db" />
      {/* Calendrier surchargé (croix rouges) */}
      <g transform="translate(240 300)">
        <rect width={250} height={230} rx={14} fill="#fff" />
        <rect width={250} height={52} rx={14} fill="#e4572e" />
        <rect y={38} width={250} height={14} fill="#e4572e" />
        {Array.from({ length: 15 }, (_, i) => {
          const cx = 34 + (i % 5) * 46;
          const cy = 84 + Math.floor(i / 5) * 46;
          const on = frame > 20 + i * 8;
          return (
            <g key={i}>
              <rect x={cx - 16} y={cy - 16} width={32} height={32} rx={6} fill="#eef2f9" />
              {on ? (
                <g stroke="#e4572e" strokeWidth={5} strokeLinecap="round">
                  <line x1={cx - 9} y1={cy - 9} x2={cx + 9} y2={cy + 9} />
                  <line x1={cx + 9} y1={cy - 9} x2={cx - 9} y2={cy + 9} />
                </g>
              ) : null}
            </g>
          );
        })}
      </g>
      {/* Plante */}
      <g transform="translate(180 860)">
        <path d="M 0 -40 Q -70 -150 -30 -230 Q 0 -150 0 -40 Z" fill="#1e9e6a" />
        <path d="M 0 -40 Q 70 -170 40 -250 Q 10 -160 0 -40 Z" fill="#23b47a" />
        <path d="M 0 -40 Q -20 -190 0 -270 Q 20 -190 0 -40 Z" fill="#178a5b" />
        <path d="M -46 -60 L 46 -60 L 36 0 L -36 0 Z" fill="#f7931e" />
      </g>
      {/* Étagère et classeurs */}
      <g transform="translate(1390 250)">
        <rect width={360} height={16} rx={6} fill="#a8b6cf" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x={20 + i * 52} y={-120 + (i % 2) * 14} width={42} height={120 - (i % 2) * 14} rx={6} fill={["#f7931e", "#1f6bff", "#22346e", "#3aa0ff", "#e4572e", "#1e9e6a"][i]} />
        ))}
      </g>
      {/* Horloge qui tourne trop vite */}
      <g transform="translate(1200 160)">
        <circle r={62} fill="#fff" stroke="#22346e" strokeWidth={8} />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1={0} y1={-48} x2={0} y2={-40} stroke="#9fb0cc" strokeWidth={4} transform={`rotate(${i * 30})`} />
        ))}
        <line x1={0} y1={0} x2={0} y2={-30} stroke="#22346e" strokeWidth={7} strokeLinecap="round" transform={`rotate(${handFast / 12})`} />
        <line x1={0} y1={0} x2={0} y2={-44} stroke="#e4572e" strokeWidth={4} strokeLinecap="round" transform={`rotate(${handFast})`} />
        <circle r={6} fill="#22346e" />
      </g>
    </g>
  );
}

function Sheet({ x, y, r, s = 1, opacity = 1 }: { x: number; y: number; r: number; s?: number; opacity?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} opacity={opacity}>
      <rect x={-46} y={-60} width={92} height={120} rx={6} fill="#000" opacity={0.08} transform="translate(4 6)" />
      <rect x={-46} y={-60} width={92} height={120} rx={6} fill="#fff" />
      {[-36, -20, -4, 12, 28].map((ly, i) => (
        <rect key={ly} x={-32} y={ly} width={i === 0 ? 44 : 64} height={6} rx={3} fill={i === 0 ? "#1f6bff" : "#d5deec"} />
      ))}
    </g>
  );
}

/** Pile qui grandit : feuilles et registres qui tombent un à un. */
function Pile({ x, frame, fps, start, items }: { x: number; frame: number; fps: number; start: number; items: number }) {
  return (
    <g>
      {Array.from({ length: items }, (_, i) => {
        const t = spring({ frame: frame - start - i * 9, fps, config: { damping: 13, stiffness: 140 } });
        const book = i % 3 === 2;
        const h = book ? 26 : 12;
        const yTop = 640 - i * 16;
        const y = interpolate(t, [0, 1], [yTop - 320, yTop]);
        const rot = ((i * 37) % 9) - 4;
        return t > 0.001 ? (
          <g key={i} transform={`translate(${x} ${y}) rotate(${rot})`} opacity={Math.min(1, t * 3)}>
            {book ? (
              <g>
                <rect x={-78} y={-h} width={156} height={h} rx={5} fill={["#e4572e", "#22346e", "#1e9e6a"][i % 3]} />
                <rect x={-78} y={-h + 4} width={10} height={h - 8} rx={2} fill="#000" opacity={0.18} />
              </g>
            ) : (
              <g>
                <rect x={-74} y={-h} width={148} height={h} rx={3} fill="#fff" stroke="#d5deec" strokeWidth={2} />
                <rect x={-60} y={-h + 4} width={70} height={3} rx={1.5} fill="#c4cfe2" />
              </g>
            )}
          </g>
        ) : null;
      })}
    </g>
  );
}

function Desk({ clean }: { clean: boolean }) {
  return (
    <g>
      <rect x={380} y={640} width={1160} height={34} rx={12} fill={clean ? "#2a3f86" : "#8d6748"} />
      <rect x={430} y={674} width={1060} height={200} rx={10} fill={clean ? "#1d2f6a" : "#74533a"} />
      {clean ? (
        <rect x={430} y={674} width={1060} height={6} fill="#3aa0ff" opacity={0.5} />
      ) : (
        <g>
          <rect x={470} y={704} width={300} height={70} rx={8} fill="#000" opacity={0.12} />
          <rect x={1150} y={704} width={300} height={70} rx={8} fill="#000" opacity={0.12} />
          <rect x={600} y={734} width={60} height={10} rx={5} fill="#000" opacity={0.2} />
          <rect x={1270} y={734} width={60} height={10} rx={5} fill="#000" opacity={0.2} />
        </g>
      )}
    </g>
  );
}

function Phone({ frame }: { frame: number }) {
  const ringing = Math.floor(frame / 20) % 3 !== 2;
  const shake = ringing ? Math.sin(frame * 2.4) * 4 : 0;
  return (
    <g transform={`translate(1130 636) rotate(${-8 + shake})`}>
      <rect x={-36} y={-128} width={72} height={128} rx={14} fill="#16224a" />
      <rect x={-30} y={-120} width={60} height={110} rx={9} fill="#2b3f86" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={-24} y={-110 + i * 30} width={48} height={22} rx={6} fill="#fff" opacity={0.9} />
      ))}
      {ringing ? (
        <g stroke="#e4572e" strokeWidth={5} strokeLinecap="round" fill="none" opacity={0.85}>
          <path d="M -52 -110 Q -64 -70 -52 -30" />
          <path d="M 52 -110 Q 64 -70 52 -30" />
        </g>
      ) : null}
      <g transform="translate(34 -128)">
        <circle r={22} fill="#e4572e" />
        <text y={8} textAnchor="middle" fontFamily={font} fontWeight={700} fontSize={22} fill="#fff">
          12
        </text>
      </g>
    </g>
  );
}

/** File d'attente des parents à la porte (ils s'impatientent). */
function Queue({ frame, fps }: { frame: number; fps: number }) {
  const enter = spring({ frame: frame - 40, fps, config: { damping: 16 } });
  const people: { look: Look; x: number; s: number; phase: number }[] = [
    { look: YOUNG, x: 1790, s: 0.5, phase: 2 },
    { look: FATHER, x: 1700, s: 0.56, phase: 1 },
    { look: MOTHER, x: 1600, s: 0.62, phase: 0 },
  ];
  return (
    <g>
      <rect x={1560} y={420} width={330} height={440} fill="#c9d5ea" />
      <rect x={1548} y={408} width={354} height={20} rx={6} fill="#a8b6cf" />
      {people.map((p) => {
        const bob = Math.sin((frame + p.phase * 11) / 6) * 6;
        return (
          <g key={p.x} transform={`translate(${p.x + (1 - enter) * 300} ${720 + bob}) scale(${p.s})`}>
            <Character look={p.look} pose={{ armL: [10, -20], armR: [-10, 20], head: Math.sin((frame + p.phase * 7) / 9) * 6 }} expression="worried" blink={Math.abs(((frame + p.phase * 40) % 90) - 4) < 3 ? 1 : 0} />
          </g>
        );
      })}
      {/* Bulle « Mon reçu ?! » */}
      <g opacity={interpolate(frame, [110, 124], [0, 1], clamp)} transform={`translate(1560 470) scale(${spring({ frame: frame - 110, fps, config: { damping: 9 } })})`}>
        <path d="M -110 -50 H 110 Q 130 -50 130 -30 V 20 Q 130 40 110 40 H 0 L -20 66 L -24 40 H -110 Q -130 40 -130 20 V -30 Q -130 -50 -110 -50 Z" fill="#fff" stroke="#e4572e" strokeWidth={4} />
        <text y={4} textAnchor="middle" fontFamily={font} fontWeight={700} fontSize={34} fill="#22346e">
          Mon reçu ?!
        </text>
      </g>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Scène 2
// ---------------------------------------------------------------------------
const FEATURES: { icon: LucideIcon; label: string; color: string }[] = [
  { icon: ClipboardCheck, label: "Présences", color: "#1e9e6a" },
  { icon: Wallet, label: "Paiements", color: "#f7931e" },
  { icon: GraduationCap, label: "Bulletins", color: "#8b5cf6" },
  { icon: BellRing, label: "Parents", color: "#e4572e" },
  { icon: QrCode, label: "Cartes QR", color: "#1f6bff" },
  { icon: ChartColumn, label: "Statistiques", color: "#0ea5e9" },
];

function NightBackground({ frame }: { frame: number }) {
  return (
    <g>
      <defs>
        <radialGradient id="night" cx="0.5" cy="0.45" r="0.8">
          <stop offset="0" stopColor="#123a8f" />
          <stop offset="0.55" stopColor={brand.navy} />
          <stop offset="1" stopColor={brand.night} />
        </radialGradient>
      </defs>
      <rect width={1920} height={1080} fill="url(#night)" />
      {[
        [300, 260, 180, "#1f6bff"],
        [1640, 300, 220, "#3aa0ff"],
        [1500, 900, 160, "#f7931e"],
        [380, 880, 200, "#8b5cf6"],
      ].map(([x, y, r, c], i) => (
        <circle key={i} cx={(x as number) + Math.sin(frame / 40 + i) * 30} cy={(y as number) + Math.cos(frame / 50 + i) * 24} r={r as number} fill={c as string} opacity={0.16} />
      ))}
      {Array.from({ length: 40 }, (_, i) => (
        <circle key={i} cx={(i * 397) % 1920} cy={((i * 263) % 1080) - ((frame * (0.4 + (i % 5) * 0.15)) % 1080) + 1080 * (((i * 263) % 1080) - ((frame * (0.4 + (i % 5) * 0.15)) % 1080) < 0 ? 1 : 0)} r={1.5 + (i % 3)} fill="#fff" opacity={0.25} />
      ))}
    </g>
  );
}

function Laptop({ frame, fps }: { frame: number; fps: number }) {
  const open = spring({ frame, fps, config: { damping: 14 } });
  return (
    <g transform="translate(1180 640)">
      <g transform={`scale(1 ${open})`} style={{ transformOrigin: "0px 0px" }}>
        <rect x={-150} y={-190} width={300} height={190} rx={14} fill="#e9eef8" />
        <rect x={-138} y={-178} width={276} height={160} rx={8} fill="#0b1f4f" />
        {[0, 1, 2, 3, 4].map((i) => {
          const h = spring({ frame: frame - 10 - i * 5, fps, config: { damping: 12 } }) * [50, 80, 64, 104, 124][i]!;
          return <rect key={i} x={-112 + i * 46} y={-34 - h} width={30} height={h} rx={6} fill={i === 4 ? "#f7931e" : "#3aa0ff"} />;
        })}
      </g>
      <rect x={-180} y={-4} width={360} height={16} rx={8} fill="#c9d3e6" />
    </g>
  );
}

function FeatureBadge({ i, frame, fps }: { i: number; frame: number; fps: number }) {
  const f = FEATURES[i]!;
  // Départ : les piles de papiers (scène 1), arrivée : un arc autour du directeur.
  const from = i % 2 === 0 ? { x: 620, y: 560 } : { x: 1300, y: 560 };
  const angle = ((200 + i * 28) * Math.PI) / 180;
  const to = { x: 960 + Math.cos(angle) * 600, y: 560 + Math.sin(angle) * 380 };
  const t = spring({ frame: frame - 6 - i * 5, fps, config: { damping: 15, stiffness: 90 } });
  const x = interpolate(t, [0, 1], [from.x, to.x]);
  const y = interpolate(t, [0, 1], [from.y, to.y]) - Math.sin(t * Math.PI) * 120 + Math.sin(frame / 14 + i) * 6;
  // La feuille se transforme en pastille.
  const morph = interpolate(t, [0.25, 0.6], [0, 1], clamp);
  const Icon = f.icon;
  return (
    <g transform={`translate(${x} ${y})`}>
      <g opacity={1 - morph}>
        <Sheet x={0} y={0} r={(1 - t) * 40 - 20} s={0.8} />
      </g>
      <g opacity={morph} transform={`scale(${0.4 + morph * 0.6})`}>
        <circle r={74} fill={f.color} opacity={0.25} />
        <circle r={60} fill="#fff" />
        <circle r={60} fill="none" stroke={f.color} strokeWidth={5} />
        <Icon x={-30} y={-30} width={60} height={60} color={f.color} strokeWidth={2.2} />
        <text y={104} textAnchor="middle" fontFamily={font} fontWeight={600} fontSize={28} fill="#fff">
          {f.label}
        </text>
      </g>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Textes animés (HTML, police Poppins)
// ---------------------------------------------------------------------------
function Word({ text, at, frame, fps, color = brand.navy, size = 76 }: { text: string; at: number; frame: number; fps: number; color?: string; size?: number }) {
  const t = spring({ frame: frame - at, fps, config: { damping: 12, stiffness: 160 } });
  return (
    <span style={{ display: "inline-block", marginRight: 22, transform: `translateY(${(1 - t) * 40}px) scale(${0.85 + t * 0.15})`, opacity: Math.min(1, t * 1.5), color, fontSize: size, fontWeight: 800, letterSpacing: -1 }}>
      {text}
    </span>
  );
}

function Scene1Text({ frame, fps }: { frame: number; fps: number }) {
  const out = interpolate(frame, [218, 236], [1, 0], clamp);
  const line2 = spring({ frame: frame - 128, fps, config: { damping: 14 } });
  return (
    <div style={{ position: "absolute", left: 110, top: 64, fontFamily: font, opacity: out, width: 900 }}>
      <div style={{ lineHeight: 1.05 }}>
        <Word text="Registres." at={46} frame={frame} fps={fps} />
        <Word text="Reçus." at={70} frame={frame} fps={fps} color="#e4572e" />
        <Word text="Cahiers." at={94} frame={frame} fps={fps} />
      </div>
      <div style={{ marginTop: 18, fontSize: 40, fontWeight: 600, color: "#33466f", opacity: line2, transform: `translateX(${(1 - line2) * -30}px)` }}>
        Tout prend du temps…{" "}
        <span style={{ color: "#e4572e", opacity: interpolate(frame, [172, 186], [0, 1], clamp) }}>et tout se perd.</span>
      </div>
    </div>
  );
}

function Scene2Text({ frame, fps }: { frame: number; fps: number }) {
  // frame relatif au début de la scène 2.
  const logo = spring({ frame: frame - 70, fps, config: { damping: 13 } });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 690, fontFamily: font, textAlign: "center" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 18, transform: `scale(${0.7 + logo * 0.3})`, opacity: logo }}>
        <Img src={staticFile("brand/neoscool-mark.png")} style={{ width: 92, height: 92 }} />
        <span style={{ fontSize: 84, fontWeight: 800, color: "#fff", letterSpacing: -2 }}>
          <span style={{ color: brand.orange }}>.</span>Neo<span style={{ color: brand.sky }}>Scool</span>
        </span>
      </div>
      <div style={{ marginTop: 6 }}>
        <Word text="Simple." at={86} frame={frame} fps={fps} color="#fff" size={54} />
        <Word text="Rapide." at={106} frame={frame} fps={fps} color={brand.sky} size={54} />
        <Word text="Sécurisé." at={126} frame={frame} fps={fps} color={brand.orange} size={54} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------
export function Extrait() {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const blink = (period: number, offset: number) => (Math.abs(((frame + offset) % period) - 3) < 3 ? 1 - Math.abs(((frame + offset) % period) - 3) / 3 : 0);

  // Scène 1 : léger zoom caméra + petit tremblement de stress.
  const zoom1 = interpolate(frame, [0, S2], [1, 1.07]);
  const shake = frame > 150 && frame < S2 ? Math.sin(frame * 1.7) * 2 : 0;
  // Transition : cercle bleu qui grandit depuis le centre.
  const burst = interpolate(frame, [226, 252], [0, 1], { ...clamp, easing: Easing.bezier(0.6, 0, 0.3, 1) });
  const s2 = frame - S2;
  const relax = spring({ frame: s2 - 20, fps, config: { damping: 11 } });
  const cheer = spring({ frame: s2 - 44, fps, config: { damping: 9, stiffness: 120 } });
  const pose2 = mixPose(mixPose(POSES.overwhelmed, POSES.rest, relax), POSES.celebrate, cheer);
  const fadeOut = interpolate(frame, [EXTRAIT_FRAMES - 16, EXTRAIT_FRAMES], [1, 0], clamp);

  // Mise à l'échelle 16:9 → n'importe quel format (centrage).
  const scale = Math.min(width / 1920, height / 1080);

  return (
    <AbsoluteFill style={{ backgroundColor: brand.night, opacity: fadeOut }}>
      <Audio src={staticFile("musique/anime/extrait.wav")} volume={0.55} />
      <Sequence from={14}>
        <Audio src={staticFile("voix/anime/probleme.wav")} />
      </Sequence>
      <Sequence from={S2 + 10}>
        <Audio src={staticFile("voix/anime/arrivee.wav")} />
      </Sequence>

      <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: "center", left: (width - 1920) / 2, top: (height - 1080) / 2, width: 1920, height: 1080 }}>
        {frame < S2 + 4 ? (
          <AbsoluteFill style={{ transform: `scale(${zoom1}) translate(${shake}px, 0)`, transformOrigin: "50% 60%" }}>
            <svg viewBox="0 0 1920 1080" width={1920} height={1080}>
              <Office frame={frame} />
              <Queue frame={frame} fps={fps} />
              <g transform="translate(960 470)">
                <Character look={DIRECTOR} pose={mixPose(POSES.rest, POSES.overwhelmed, spring({ frame: frame - 60, fps, config: { damping: 12 } }))} expression="worried" blink={blink(75, 10)} sweat={((frame - 70) % 50) / 50} />
              </g>
              <Desk clean={false} />
              <Pile x={640} frame={frame} fps={fps} start={8} items={12} />
              <Pile x={830} frame={frame} fps={fps} start={30} items={8} />
              <Phone frame={frame} />
              {[
                [1500, 0, 80],
                [1080, 10, 120],
                [1320, 22, 140],
                [760, 40, 60],
                [1650, 50, 90],
                [420, 70, 50],
              ].map(([x, start, drift], i) => {
                const t = Math.max(0, frame - (start as number) - 20);
                const y = -140 + t * 6.5;
                return y < 1200 ? <Sheet key={i} x={(x as number) + Math.sin(t / 10 + i) * (drift as number)} y={y} r={Math.sin(t / 8 + i) * 40} s={0.9} /> : null;
              })}
            </svg>
            <Scene1Text frame={frame} fps={fps} />
          </AbsoluteFill>
        ) : null}

        {/* Transition puis scène 2 */}
        {frame >= 226 ? (
          <AbsoluteFill style={{ clipPath: `circle(${burst * 1250}px at 50% 52%)` }}>
            <svg viewBox="0 0 1920 1080" width={1920} height={1080}>
              <NightBackground frame={frame} />
              <g transform={`translate(960 ${640 - 170})`}>
                <Character look={DIRECTOR} pose={pose2} expression={relax > 0.5 ? "happy" : "neutral"} blink={blink(90, 30)} />
              </g>
              <Desk clean />
              <Laptop frame={s2 - 30} fps={fps} />
              {/* Tasse de café posée : le calme revient */}
              <g transform="translate(720 640)" opacity={interpolate(s2, [40, 52], [0, 1], clamp)}>
                <rect x={-26} y={-52} width={52} height={52} rx={10} fill="#fff" />
                <path d="M 26 -40 Q 46 -36 26 -14" fill="none" stroke="#fff" strokeWidth={8} />
                <path d={`M -8 -64 Q 0 ${-80 - Math.sin(frame / 6) * 6} 8 -96`} fill="none" stroke="#fff" strokeOpacity={0.5} strokeWidth={5} strokeLinecap="round" />
              </g>
              {s2 >= 0 ? FEATURES.map((_, i) => <FeatureBadge key={i} i={i} frame={s2} fps={fps} />) : null}
              {/* Éclats de joie */}
              {cheer > 0.1
                ? Array.from({ length: 10 }, (_, i) => {
                    const a = (i / 10) * Math.PI * 2;
                    const d = 120 + cheer * 90;
                    return <circle key={i} cx={960 + Math.cos(a) * d} cy={330 + Math.sin(a) * d * 0.6} r={6 * (1 - Math.min(1, (s2 - 44) / 40))} fill={i % 2 ? brand.orange : brand.sky} />;
                  })
                : null}
            </svg>
            {s2 >= 0 ? <Scene2Text frame={s2} fps={fps} /> : null}
          </AbsoluteFill>
        ) : null}

        {/* Logo qui « surgit » au moment de la transition */}
        {frame >= 230 && frame < S2 + 40 ? (
          <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Img
              src={staticFile("brand/neoscool-mark.png")}
              style={{
                width: 260,
                height: 260,
                opacity: interpolate(frame, [230, 240, S2 + 22, S2 + 40], [0, 1, 1, 0], clamp),
                transform: `scale(${spring({ frame: frame - 230, fps, config: { damping: 9 } }) * interpolate(frame, [S2 + 18, S2 + 40], [1, 0.4], clamp)}) rotate(${interpolate(frame, [230, 252], [-30, 0], clamp)}deg)`,
                filter: "drop-shadow(0 20px 60px rgba(31,107,255,0.6))",
              }}
            />
          </AbsoluteFill>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
