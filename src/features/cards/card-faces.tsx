/**
 * Recto et verso de la carte, en styles en ligne uniquement (flexbox, SVG) :
 * le même rendu sert à l'écran (carte 3D) et à l'image PNG téléchargeable
 * (next/og). Taille de référence : 680 × 428 px (format carte bancaire CR80).
 */
import type { CSSProperties, ReactNode } from "react";

import { code128Bars } from "@/lib/barcode/code128";

import type { CardData, CardDesign } from "./design";

export const CARD_WIDTH = 680;
export const CARD_HEIGHT = 428;

/** Mélange une couleur hexadécimale avec du blanc (amount > 0) ou du noir (amount < 0). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const target = amount > 0 ? 255 : 0;
  const a = Math.min(1, Math.abs(amount));
  const mix = (c: number) => Math.round(c + (target - c) * a);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const row = (style: CSSProperties = {}): CSSProperties => ({ display: "flex", flexDirection: "row", ...style });
const col = (style: CSSProperties = {}): CSSProperties => ({ display: "flex", flexDirection: "column", ...style });

type FaceProps = { card: CardData; design: CardDesign; fontFamily?: string };

function Frame({ children, fontFamily, background }: { children: ReactNode; fontFamily?: string; background: string }) {
  return (
    <div
      style={col({
        position: "relative",
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        borderRadius: 28,
        overflow: "hidden",
        background,
        fontFamily: fontFamily ?? "inherit",
        color: "#0f172a",
      })}
    >
      {children}
    </div>
  );
}

function Logo({ card, design, size }: FaceProps & { size: number }) {
  const initials = card.organization.name
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div
      style={row({
        width: size,
        height: size,
        borderRadius: size,
        background: "#ffffff",
        border: `3px solid ${design.accent}`,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
      })}
    >
      {card.organization.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.organization.logo} alt="" width={size - 14} height={size - 14} style={{ objectFit: "contain" }} />
      ) : (
        <span style={{ fontSize: size * 0.34, fontWeight: 800, color: design.primary }}>{initials || "É"}</span>
      )}
    </div>
  );
}

/** Quadrillage léger et silhouette de bâtiments (décor, sans texte). */
function Decor({ color, opacity, skyline = true }: { color: string; opacity: number; skyline?: boolean }) {
  const lines = [];
  for (let x = 24; x < CARD_WIDTH; x += 34) lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={CARD_HEIGHT} stroke={color} strokeWidth={1} />);
  for (let y = 24; y < CARD_HEIGHT; y += 34) lines.push(<line key={`h${y}`} x1={0} y1={y} x2={CARD_WIDTH} y2={y} stroke={color} strokeWidth={1} />);
  const buildings = [
    [430, 60, 38], [472, 96, 30], [506, 74, 44], [554, 120, 34], [592, 88, 28], [624, 110, 40],
  ];
  return (
    <svg width={CARD_WIDTH} height={CARD_HEIGHT} viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`} style={{ position: "absolute", left: 0, top: 0, opacity }}>
      {lines}
      {skyline
        ? buildings.map(([x = 0, h = 0, w = 0]) => (
            <rect key={x} x={x} y={CARD_HEIGHT - 44 - h} width={w} height={h} fill="none" stroke={color} strokeWidth={2} />
          ))
        : null}
    </svg>
  );
}

function Rings({ color }: { color: string }) {
  return (
    <svg width={320} height={320} viewBox="0 0 320 320" style={{ position: "absolute", right: -80, top: -90, opacity: 0.18 }}>
      <circle cx={160} cy={160} r={70} fill="none" stroke={color} strokeWidth={2} />
      <circle cx={160} cy={160} r={110} fill="none" stroke={color} strokeWidth={2} />
      <circle cx={160} cy={160} r={150} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  );
}

function Field({ label, value, color, accent }: { label: string; value: string; color: string; accent?: boolean }) {
  return (
    <div style={col({ gap: 2, minWidth: 0, maxWidth: 260 })}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: "#64748b" }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: accent ? shade(color, -0.05) : color, lineHeight: 1.2 }}>{value}</span>
    </div>
  );
}

export function CardFront({ card, design, fontFamily }: FaceProps) {
  const initials = `${card.holder.firstName[0] ?? ""}${card.holder.lastName[0] ?? ""}`.toUpperCase();
  const [first, second] = card.fields;
  return (
    <Frame fontFamily={fontFamily} background="#ffffff">
      {/* En-tête */}
      <div
        style={row({
          position: "relative",
          height: 104,
          padding: "0 28px",
          alignItems: "center",
          justifyContent: "space-between",
          background: `linear-gradient(115deg, ${shade(design.primary, -0.25)} 0%, ${design.primary} 55%, ${shade(design.primary, 0.18)} 100%)`,
          overflow: "hidden",
        })}
      >
        <Rings color="#ffffff" />
        <div style={row({ alignItems: "center", gap: 14 })}>
          <Logo card={card} design={design} size={70} />
          <div style={col({ gap: 3, maxWidth: 300 })}>
            <span style={{ fontSize: card.organization.name.length > 30 ? 19 : 24, fontWeight: 800, color: "#ffffff", lineHeight: 1.05 }}>{card.organization.name}</span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, color: design.accent }}>{card.organization.kind.toUpperCase()}</span>
          </div>
        </div>
        <div style={col({ alignItems: "flex-end", gap: 4 })}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, color: design.accent }}>{card.title}</span>
          {card.yearLabel ? <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "rgba(255,255,255,0.85)" }}>{card.yearLabel}</span> : null}
        </div>
      </div>
      <div style={{ display: "flex", height: 5, background: design.accent }} />

      {/* Corps */}
      <div style={row({ position: "relative", flex: 1, padding: "22px 28px 16px", gap: 24 })}>
        <Decor color={design.primary} opacity={0.06} />
        {design.show_photo ? (
          <div style={col({ alignItems: "center", gap: 12 })}>
            <div
              style={row({
                width: 132,
                height: 160,
                borderRadius: 18,
                border: `4px solid ${design.accent}`,
                background: design.primary,
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              })}
            >
              {card.holder.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.holder.photo} alt="" width={124} height={152} style={{ objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 46, fontWeight: 800, color: design.accent }}>{initials}</span>
              )}
            </div>
            <span style={{ display: "flex", padding: "6px 12px", borderRadius: 8, background: design.primary, color: "#ffffff", fontSize: 13, fontWeight: 700, letterSpacing: 1, fontFamily: "monospace" }}>
              {card.holder.matricule}
            </span>
          </div>
        ) : null}

        <div style={col({ flex: 1, gap: 4, minWidth: 0 })}>
          <span style={{ fontSize: 32, fontWeight: 800, color: design.primary, lineHeight: 1.05, textTransform: "uppercase" }}>{card.holder.lastName}</span>
          <span style={{ fontSize: 21, fontWeight: 500, color: shade(design.primary, 0.3) }}>{card.holder.firstName}</span>
          <div style={{ display: "flex", width: 44, height: 4, borderRadius: 4, background: design.accent, margin: "8px 0 10px" }} />
          <div style={col({ gap: 10 })}>
            {first ? <Field label={first.label} value={first.value} color={design.primary} /> : null}
            <div style={row({ columnGap: 26, rowGap: 10, flexWrap: "wrap" })}>
              {second ? <Field label={second.label} value={second.value} color={design.primary} /> : null}
              {design.show_enrolled_on && card.enrolledOn ? <Field label="INSCRIT LE" value={card.enrolledOn} color={design.primary} /> : null}
            </div>
            {design.show_validity && card.validity ? <Field label="VALIDE JUSQU'AU" value={card.validity} color={design.accent} accent /> : null}
            {!design.show_photo ? <Field label="MATRICULE" value={card.holder.matricule} color={design.primary} /> : null}
          </div>
        </div>

        <div style={col({ alignItems: "center", gap: 8, width: 150 })}>
          <div
            style={row({
              position: "relative",
              width: 146,
              height: 146,
              borderRadius: 16,
              background: "#ffffff",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 6px 18px rgba(15,23,42,0.12)",
            })}
          >
            {card.qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.qr} alt="" width={122} height={122} />
            ) : (
              <span style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", padding: 12 }}>QR code après génération</span>
            )}
            {[
              { left: -6, top: -6, borderLeft: `3px solid ${design.accent}`, borderTop: `3px solid ${design.accent}` },
              { right: -6, top: -6, borderRight: `3px solid ${design.accent}`, borderTop: `3px solid ${design.accent}` },
              { left: -6, bottom: -6, borderLeft: `3px solid ${design.accent}`, borderBottom: `3px solid ${design.accent}` },
              { right: -6, bottom: -6, borderRight: `3px solid ${design.accent}`, borderBottom: `3px solid ${design.accent}` },
            ].map((corner, i) => (
              <div key={i} style={{ position: "absolute", width: 22, height: 22, borderRadius: 4, ...corner }} />
            ))}
          </div>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: "#334155", textAlign: "center" }}>SCANNER POUR VÉRIFIER L&apos;IDENTITÉ</span>
        </div>
      </div>

      {/* Pied */}
      <div
        style={row({
          height: 40,
          padding: "0 28px",
          alignItems: "center",
          justifyContent: "space-between",
          background: design.primary,
          borderTop: `3px solid ${design.accent}`,
        })}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: "#ffffff" }}>{[design.website, design.phone].filter(Boolean).join(" · ") || card.organization.name}</span>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: design.accent }}>{card.organization.demo ? "DÉMONSTRATION · DOCUMENT FICTIF" : "DOCUMENT PERSONNEL"}</span>
      </div>
    </Frame>
  );
}

function Info({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={col({ gap: 3, width: 290 })}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.4, color: accent }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: "#ffffff" }}>{value}</span>
    </div>
  );
}

export function Barcode({ value, width, height, color = "#000000" }: { value: string; width: number; height: number; color?: string }) {
  const { bars, width: modules } = code128Bars(value);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${modules} ${height}`} preserveAspectRatio="none">
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} fill={color} />
      ))}
    </svg>
  );
}

export function CardBack({ card, design, fontFamily }: FaceProps) {
  const infos = [
    design.address ? { label: "ADRESSE", value: design.address } : null,
    design.phone ? { label: "TÉLÉPHONE", value: design.phone } : null,
    design.email ? { label: "E-MAIL", value: design.email } : null,
    design.website ? { label: "SITE INTERNET", value: design.website } : null,
    design.administration ? { label: "ADMINISTRATION", value: design.administration } : null,
  ].filter((x): x is { label: string; value: string } => x !== null);
  return (
    <Frame fontFamily={fontFamily} background="#ffffff">
      <div
        style={col({
          position: "relative",
          height: 300,
          padding: "26px 30px",
          gap: 12,
          background: `linear-gradient(160deg, ${shade(design.primary, -0.2)} 0%, ${design.primary} 60%, ${shade(design.primary, 0.12)} 100%)`,
          overflow: "hidden",
        })}
      >
        <Decor color="#ffffff" opacity={0.07} />
        <Rings color="#ffffff" />
        <div style={row({ alignItems: "center", gap: 14 })}>
          <Logo card={card} design={design} size={60} />
          <div style={col({ gap: 3 })}>
            <span style={{ fontSize: 22, fontWeight: 800, color: "#ffffff" }}>{card.organization.name}</span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, color: design.accent }}>{card.organization.kind.toUpperCase()}</span>
          </div>
        </div>
        {design.slogan ? <span style={{ fontSize: 15, fontStyle: "italic", fontWeight: 600, color: "rgba(255,255,255,0.92)" }}>« {design.slogan} »</span> : null}
        <div style={{ display: "flex", width: 60, height: 4, borderRadius: 4, background: design.accent }} />
        <div style={row({ flexWrap: "wrap", columnGap: 30, rowGap: 12 })}>
          {infos.map((i) => (
            <Info key={i.label} label={i.label} value={i.value} accent={design.accent} />
          ))}
        </div>
      </div>
      <div style={{ display: "flex", height: 5, background: design.accent }} />
      <div style={row({ flex: 1, padding: "14px 30px", gap: 26, alignItems: "center" })}>
        {design.show_barcode ? (
          <div style={col({ alignItems: "center", gap: 6 })}>
            <Barcode value={card.barcode} width={300} height={64} />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 3, fontFamily: "monospace" }}>{card.barcode}</span>
          </div>
        ) : null}
        <div style={col({ flex: 1, gap: 5 })}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: design.primary }}>CARTE STRICTEMENT PERSONNELLE</span>
          <span style={{ fontSize: 10, color: "#475569", lineHeight: 1.35 }}>{design.notice}</span>
          {design.lost_text ? <span style={{ fontSize: 10, fontWeight: 700, color: "#0f172a" }}>{design.lost_text}</span> : null}
          {card.badgeNumber ? <span style={{ fontSize: 9, color: "#94a3b8" }}>Carte n° {card.badgeNumber}</span> : null}
        </div>
      </div>
    </Frame>
  );
}
