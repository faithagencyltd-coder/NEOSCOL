/**
 * Drapeaux dessinés en SVG (rendu identique sur tous les appareils, contrairement
 * aux émojis). Pays sans dessin : pastille avec le code du pays.
 */
const STAR = "M0,-1 L0.2245,-0.309 L0.951,-0.309 L0.363,0.118 L0.588,0.809 L0,0.382 L-0.588,0.809 L-0.363,0.118 L-0.951,-0.309 L-0.2245,-0.309 Z";

function Star({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  return <path d={STAR} transform={`translate(${x} ${y}) scale(${r})`} fill={fill} />;
}
const vertical = (a: string, b: string, c: string) => (
  <>
    <rect width="10" height="20" fill={a} />
    <rect x="10" width="10" height="20" fill={b} />
    <rect x="20" width="10" height="20" fill={c} />
  </>
);
const horizontal = (a: string, b: string, c: string) => (
  <>
    <rect width="30" height="6.67" fill={a} />
    <rect y="6.67" width="30" height="6.67" fill={b} />
    <rect y="13.33" width="30" height="6.67" fill={c} />
  </>
);

const FLAGS: Record<string, React.ReactNode> = {
  BJ: (
    <>
      <rect width="30" height="20" fill="#e8112d" />
      <rect width="30" height="10" fill="#fcd116" />
      <rect width="12" height="20" fill="#008751" />
    </>
  ),
  CI: vertical("#f77f00", "#ffffff", "#009e60"),
  BF: (
    <>
      <rect width="30" height="10" fill="#ef2b2d" />
      <rect y="10" width="30" height="10" fill="#009e49" />
      <Star x={15} y={10} r={3.2} fill="#fcd116" />
    </>
  ),
  TG: (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} y={i * 4} width="30" height="4" fill={i % 2 === 0 ? "#006a4e" : "#ffce00"} />
      ))}
      <rect width="12" height="12" fill="#d21034" />
      <Star x={6} y={6} r={3.4} fill="#ffffff" />
    </>
  ),
  NE: (
    <>
      {horizontal("#e05206", "#ffffff", "#0db02b")}
      <circle cx="15" cy="10" r="2.4" fill="#e05206" />
    </>
  ),
  GA: horizontal("#009e60", "#fcd116", "#3a75c4"),
  SN: (
    <>
      {vertical("#00853f", "#fdef42", "#e31b23")}
      <Star x={15} y={10} r={3} fill="#00853f" />
    </>
  ),
  CM: (
    <>
      {vertical("#007a5e", "#ce1126", "#fcd116")}
      <Star x={15} y={10} r={3} fill="#fcd116" />
    </>
  ),
  ML: vertical("#14b53a", "#fcd116", "#ce1126"),
  GN: vertical("#ce1126", "#fcd116", "#009460"),
  CG: (
    <>
      <rect width="30" height="20" fill="#fbde4a" />
      <path d="M0,0 H18 L0,20 Z" fill="#009543" />
      <path d="M30,20 H12 L30,0 Z" fill="#dc241f" />
    </>
  ),
  CD: (
    <>
      <rect width="30" height="20" fill="#007fff" />
      <path d="M0,17 L26,0 H30 V3 L4,20 H0 Z" fill="#f7d618" />
      <path d="M0,18.2 L27.8,0 H30 V1.8 L2.2,20 H0 Z" fill="#ce1021" />
      <Star x={5} y={4.5} r={3} fill="#f7d618" />
    </>
  ),
  FR: vertical("#002395", "#ffffff", "#ed2939"),
};

export function Flag({ code, className, title }: { code: string; className?: string; title?: string }) {
  const art = FLAGS[code];
  return (
    <svg viewBox="0 0 30 20" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {art ?? (
        <>
          <rect width="30" height="20" fill="#e8eef9" />
          <text x="15" y="13.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#0b2559">
            {code}
          </text>
        </>
      )}
    </svg>
  );
}
