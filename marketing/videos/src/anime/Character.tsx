/**
 * Personnages du film animé (illustration plate NeoScool, aucun visage réel) :
 * buste articulé (bras en deux segments), expressions, clignement des yeux.
 * Origine (0, 0) = milieu des épaules ; la tête est au-dessus, le torse en dessous.
 */
export type Expression = "worried" | "neutral" | "happy";
export type Pose = { armL: [number, number]; armR: [number, number]; head: number };
export type Look = {
  skin: string;
  skinShade: string;
  hair: string;
  outfit: string;
  outfitShade: string;
  shirt?: string;
  tie?: string;
  headwrap?: string;
  glasses?: boolean;
  greyTemples?: boolean;
};

export const DIRECTOR: Look = {
  skin: "#7a4a2b",
  skinShade: "#653a20",
  hair: "#1d1612",
  outfit: "#22346e",
  outfitShade: "#18264f",
  shirt: "#ffffff",
  tie: "#f7931e",
  glasses: true,
  greyTemples: true,
};

const ARM_W = 46;
const UPPER = 118;
const FORE = 108;

/** Bras : épaule → coude → main. a1 : angle de l'épaule (0 = vers le bas), a2 : angle du coude (relatif). */
function Arm({ x, a1, a2, look }: { x: number; a1: number; a2: number; look: Look }) {
  return (
    <g transform={`translate(${x} 18) rotate(${a1})`}>
      <rect x={-ARM_W / 2} y={-10} width={ARM_W} height={UPPER + 20} rx={ARM_W / 2} fill={look.outfitShade} />
      <g transform={`translate(0 ${UPPER}) rotate(${a2})`}>
        <rect x={-ARM_W / 2 + 2} y={-12} width={ARM_W - 4} height={FORE + 12} rx={(ARM_W - 4) / 2} fill={look.outfit} />
        {look.shirt ? <rect x={-ARM_W / 2 + 3} y={FORE - 14} width={ARM_W - 6} height={12} rx={4} fill={look.shirt} /> : null}
        <circle cx={0} cy={FORE + 8} r={25} fill={look.skin} />
        <ellipse cx={-9} cy={FORE + 16} rx={9} ry={12} fill={look.skinShade} opacity={0.5} />
      </g>
    </g>
  );
}

function Face({ expression, blink, look }: { expression: Expression; blink: number; look: Look }) {
  const brow = expression === "worried" ? 14 : expression === "happy" ? -6 : 0;
  const eyeH = Math.max(0.08, 1 - blink) * (expression === "happy" ? 0.75 : 1);
  return (
    <g>
      {/* Yeux */}
      {[-25, 25].map((ex) => (
        <g key={ex} transform={`translate(${ex} -118)`}>
          <ellipse rx={11} ry={13 * eyeH} fill="#fff" />
          <circle cx={1} cy={1} r={6.5 * Math.min(1, eyeH + 0.2)} fill="#20140c" />
          <circle cx={3} cy={-2} r={2} fill="#fff" opacity={eyeH > 0.5 ? 1 : 0} />
        </g>
      ))}
      {/* Sourcils (inquiets : intérieur relevé) */}
      <g stroke={look.hair} strokeWidth={7} strokeLinecap="round">
        <line x1={-40} y1={-140 + (expression === "worried" ? 4 : 0)} x2={-12} y2={-142 - brow * 0.6} />
        <line x1={40} y1={-140 + (expression === "worried" ? 4 : 0)} x2={12} y2={-142 - brow * 0.6} />
      </g>
      {look.glasses ? (
        <g fill="none" stroke="#141414" strokeWidth={4.5}>
          <rect x={-46} y={-134} width={40} height={30} rx={11} />
          <rect x={6} y={-134} width={40} height={30} rx={11} />
          <line x1={-6} y1={-122} x2={6} y2={-122} />
        </g>
      ) : null}
      {/* Nez */}
      <path d="M -6 -96 Q 0 -86 8 -96" fill="none" stroke={look.skinShade} strokeWidth={5} strokeLinecap="round" />
      {/* Bouche */}
      {expression === "happy" ? (
        <g>
          <path d="M -30 -74 Q 0 -42 30 -74 Z" fill="#5a1f17" />
          <path d="M -24 -72 Q 0 -64 24 -72 L 22 -68 Q 0 -60 -22 -68 Z" fill="#fff" />
        </g>
      ) : expression === "worried" ? (
        <path d="M -24 -66 Q -12 -76 0 -68 Q 12 -60 24 -70" fill="none" stroke="#4a1a12" strokeWidth={6} strokeLinecap="round" />
      ) : (
        <path d="M -18 -70 Q 0 -62 18 -70" fill="none" stroke="#4a1a12" strokeWidth={6} strokeLinecap="round" />
      )}
    </g>
  );
}

export function Character({
  look,
  pose,
  expression,
  blink = 0,
  sweat = -1,
}: {
  look: Look;
  pose: Pose;
  expression: Expression;
  /** 0 = yeux ouverts, 1 = fermés. */
  blink?: number;
  /** Goutte de sueur : progression 0 → 1 (négatif = absente). */
  sweat?: number;
}) {
  return (
    <g>
      {/* Torse */}
      <path d="M -112 30 Q -112 0 -80 -4 L 80 -4 Q 112 0 112 30 L 122 300 L -122 300 Z" fill={look.outfit} />
      {look.shirt ? (
        <g>
          <path d="M -34 -4 L 0 70 L 34 -4 Z" fill={look.shirt} />
          {look.tie ? <path d="M -9 8 L 9 8 L 14 80 L 0 98 L -14 80 Z" fill={look.tie} /> : null}
          <path d="M -36 -4 L -6 74 L -48 30 Z" fill={look.outfitShade} />
          <path d="M 36 -4 L 6 74 L 48 30 Z" fill={look.outfitShade} />
        </g>
      ) : null}
      {/* Cou + tête */}
      <g transform={`rotate(${pose.head} 0 -40)`}>
        <rect x={-22} y={-52} width={44} height={56} rx={14} fill={look.skinShade} />
        <ellipse cx={-62} cy={-110} rx={12} ry={18} fill={look.skinShade} />
        <ellipse cx={62} cy={-110} rx={12} ry={18} fill={look.skinShade} />
        <ellipse cx={0} cy={-112} rx={62} ry={72} fill={look.skin} />
        {look.headwrap ? (
          <g>
            <path d="M -70 -128 Q -76 -206 0 -214 Q 80 -206 70 -128 Q 0 -150 -70 -128 Z" fill={look.headwrap} />
            <path d="M 30 -206 Q 92 -236 74 -176 Q 64 -196 30 -206 Z" fill={look.headwrap} opacity={0.85} />
            <path d="M -60 -150 Q 0 -168 60 -150" fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={6} />
          </g>
        ) : (
          <g>
            <path d="M -62 -122 Q -66 -186 0 -190 Q 66 -186 62 -122 Q 50 -160 0 -162 Q -50 -160 -62 -122 Z" fill={look.hair} />
            {look.greyTemples ? (
              <g fill="#b9b2a8">
                <path d="M -62 -122 Q -64 -142 -56 -152 L -52 -124 Z" />
                <path d="M 62 -122 Q 64 -142 56 -152 L 52 -124 Z" />
              </g>
            ) : null}
          </g>
        )}
        <Face expression={expression} blink={blink} look={look} />
        {sweat >= 0 ? (
          <path
            transform={`translate(64 ${-150 + sweat * 60})`}
            d="M 0 -14 Q 10 2 0 10 Q -10 2 0 -14 Z"
            fill="#7cc4ff"
            opacity={1 - sweat}
          />
        ) : null}
      </g>
      <Arm x={-96} a1={pose.armL[0]} a2={pose.armL[1]} look={look} />
      <Arm x={96} a1={pose.armR[0]} a2={pose.armR[1]} look={look} />
    </g>
  );
}

/** Interpolation linéaire entre deux poses (t de 0 à 1). */
export function mixPose(a: Pose, b: Pose, t: number): Pose {
  const m = (x: number, y: number) => x + (y - x) * t;
  return { armL: [m(a.armL[0], b.armL[0]), m(a.armL[1], b.armL[1])], armR: [m(a.armR[0], b.armR[0]), m(a.armR[1], b.armR[1])], head: m(a.head, b.head) };
}

export const POSES = {
  /** Main sur le front (débordé), l'autre posée sur le bureau. */
  overwhelmed: { armL: [-25, -62], armR: [-150, -92], head: -6 } as Pose,
  /** Les deux mains sur le bureau. */
  rest: { armL: [-20, -64], armR: [20, 64], head: 0 } as Pose,
  /** Bras levés (victoire). */
  cheer: { armL: [150, 14], armR: [-150, -14], head: 4 } as Pose,
  /** Bras écartés, avant-bras levés (« Yes ! »). */
  celebrate: { armL: [100, 60], armR: [-100, -60], head: 0 } as Pose,
  /** Bras ouverts, accueillant. */
  open: { armL: [62, 40], armR: [-62, -40], head: 0 } as Pose,
};
