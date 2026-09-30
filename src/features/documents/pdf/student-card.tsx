/**
 * Carte élève / apprenant / étudiant imprimable (PDF), même design que la carte
 * 3D : une page recto puis une page verso au format carte bancaire CR80
 * (85,6 × 54 mm), prêtes pour une imprimante à cartes.
 */
import { Circle, Defs, Image, Line, LinearGradient, Page, Rect, Stop, Svg, Text, View } from "@react-pdf/renderer";

import { shade } from "@/features/cards/card-faces";
import type { CardData, CardDesign } from "@/features/cards/design";
import { code128Bars } from "@/lib/barcode/code128";

const W = 242.65; // 85,6 mm en points
const H = 153.07; // 54 mm en points
const k = W / 680; // échelle depuis le gabarit écran (680 × 428 px)
const u = (px: number) => px * k;
/** Pas de césure automatique (noms, intitulés) : un mot n'est jamais coupé. */
const whole = (word: string) => [word];

function Grid({ color, opacity, top, height }: { color: string; opacity: number; top: number; height: number }) {
  const lines = [];
  for (let x = 24; x < 680; x += 34) lines.push(<Line key={`v${x}`} x1={u(x)} y1={0} x2={u(x)} y2={u(height)} stroke={color} strokeWidth={0.3} opacity={opacity} />);
  for (let y = 24; y < height; y += 34) lines.push(<Line key={`h${y}`} x1={0} y1={u(y)} x2={W} y2={u(y)} stroke={color} strokeWidth={0.3} opacity={opacity} />);
  return (
    <Svg width={W} height={u(height)} style={{ position: "absolute", left: 0, top: u(top) }}>
      {lines}
    </Svg>
  );
}

function Gradient({ id, from, to, height }: { id: string; from: string; to: string; height: number }) {
  return (
    <Svg width={W} height={u(height)} style={{ position: "absolute", left: 0, top: 0 }}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={u(height)} fill={`url(#${id})`} />
      <Circle cx={W - u(0)} cy={u(70)} r={u(70)} stroke="#ffffff" strokeWidth={0.5} fill="none" opacity={0.18} />
      <Circle cx={W - u(0)} cy={u(70)} r={u(110)} stroke="#ffffff" strokeWidth={0.5} fill="none" opacity={0.18} />
      <Circle cx={W - u(0)} cy={u(70)} r={u(150)} stroke="#ffffff" strokeWidth={0.5} fill="none" opacity={0.18} />
    </Svg>
  );
}

function Logo({ card, design, size }: { card: CardData; design: CardDesign; size: number }) {
  return (
    <View
      style={{
        width: u(size),
        height: u(size),
        borderRadius: u(size),
        backgroundColor: "#ffffff",
        borderWidth: u(3),
        borderColor: design.accent,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {card.organization.logo ? (
        <Image src={card.organization.logo} style={{ width: u(size - 14), height: u(size - 14), objectFit: "contain" }} />
      ) : (
        <Text hyphenationCallback={whole} style={{ fontSize: u(size * 0.34), fontFamily: "Helvetica-Bold", color: design.primary }}>
          {card.organization.name
            .split(/\s+/)
            .filter((w) => w.length > 2)
            .slice(0, 2)
            .map((w) => w[0])
            .join("")
            .toUpperCase()}
        </Text>
      )}
    </View>
  );
}

function Field({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ marginRight: u(24), marginBottom: u(8), maxWidth: u(230) }}>
      <Text hyphenationCallback={whole} style={{ fontSize: u(10), fontFamily: "Helvetica-Bold", color: "#64748b", letterSpacing: u(1.2) }}>{label}</Text>
      <Text hyphenationCallback={whole} style={{ fontSize: u(15), fontFamily: "Helvetica-Bold", color, marginTop: u(2) }}>{value}</Text>
    </View>
  );
}

function Front({ card, design }: { card: CardData; design: CardDesign }) {
  const initials = `${card.holder.firstName[0] ?? ""}${card.holder.lastName[0] ?? ""}`.toUpperCase();
  const [first, second] = card.fields;
  return (
    <Page size={[W, H]} style={{ backgroundColor: "#ffffff", fontFamily: "Helvetica" }}>
      <View style={{ height: u(104), position: "relative" }}>
        <Gradient id="front" from={shade(design.primary, -0.25)} to={shade(design.primary, 0.18)} height={104} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: u(28), height: u(104) }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Logo card={card} design={design} size={70} />
            <View style={{ marginLeft: u(14), maxWidth: u(300) }}>
              <Text hyphenationCallback={whole} style={{ fontSize: u(card.organization.name.length > 30 ? 18 : 22), fontFamily: "Helvetica-Bold", color: "#ffffff" }}>{card.organization.name}</Text>
              <Text hyphenationCallback={whole} style={{ fontSize: u(11), fontFamily: "Helvetica-Bold", color: design.accent, letterSpacing: u(1.4), marginTop: u(3) }}>{card.organization.kind.toUpperCase()}</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text hyphenationCallback={whole} style={{ fontSize: u(21), fontFamily: "Helvetica-Bold", color: design.accent, letterSpacing: u(1.8) }}>{card.title}</Text>
            {card.yearLabel ? <Text hyphenationCallback={whole} style={{ fontSize: u(11), fontFamily: "Helvetica-Bold", color: "#ffffff", marginTop: u(4) }}>{card.yearLabel}</Text> : null}
          </View>
        </View>
      </View>
      <View style={{ height: u(5), backgroundColor: design.accent }} />
      <View style={{ height: u(276), position: "relative" }}>
        <Grid color={design.primary} opacity={0.06} top={0} height={276} />
        <View style={{ flexDirection: "row", paddingHorizontal: u(28), paddingTop: u(22) }}>
          {design.show_photo ? (
            <View style={{ alignItems: "center", marginRight: u(24) }}>
              <View style={{ width: u(132), height: u(160), borderRadius: u(18), borderWidth: u(4), borderColor: design.accent, backgroundColor: design.primary, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {card.holder.photo ? (
                  <Image src={card.holder.photo} style={{ width: u(124), height: u(152), objectFit: "cover" }} />
                ) : (
                  <Text hyphenationCallback={whole} style={{ fontSize: u(46), fontFamily: "Helvetica-Bold", color: design.accent }}>{initials}</Text>
                )}
              </View>
              <Text hyphenationCallback={whole} style={{ marginTop: u(12), paddingVertical: u(6), paddingHorizontal: u(12), borderRadius: u(8), backgroundColor: design.primary, color: "#ffffff", fontSize: u(13), fontFamily: "Courier-Bold" }}>{card.holder.matricule}</Text>
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text hyphenationCallback={whole} style={{ fontSize: u(30), fontFamily: "Helvetica-Bold", color: design.primary, textTransform: "uppercase" }}>{card.holder.lastName}</Text>
            <Text hyphenationCallback={whole} style={{ fontSize: u(20), color: shade(design.primary, 0.3), marginTop: u(2) }}>{card.holder.firstName}</Text>
            <View style={{ width: u(44), height: u(4), borderRadius: u(4), backgroundColor: design.accent, marginVertical: u(9) }} />
            {first ? <Field label={first.label} value={first.value} color={design.primary} /> : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: u(10) }}>
              {second ? <Field label={second.label} value={second.value} color={design.primary} /> : null}
              {design.show_enrolled_on && card.enrolledOn ? <Field label="INSCRIT LE" value={card.enrolledOn} color={design.primary} /> : null}
            </View>
            {design.show_validity && card.validity ? (
              <View style={{ marginTop: u(10) }}>
                <Field label="VALIDE JUSQU'AU" value={card.validity} color={design.accent} />
              </View>
            ) : null}
          </View>
          <View style={{ width: u(150), alignItems: "center" }}>
            <View style={{ width: u(146), height: u(146), borderRadius: u(16), backgroundColor: "#ffffff", borderWidth: u(3), borderColor: design.accent, alignItems: "center", justifyContent: "center" }}>
              {card.qr ? <Image src={card.qr} style={{ width: u(122), height: u(122) }} /> : null}
            </View>
            <Text hyphenationCallback={whole} style={{ fontSize: u(8.5), fontFamily: "Helvetica-Bold", color: "#334155", marginTop: u(8), textAlign: "center" }}>
              SCANNER POUR VÉRIFIER L&apos;IDENTITÉ
            </Text>
          </View>
        </View>
      </View>
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: u(43), backgroundColor: design.primary, borderTopWidth: u(3), borderTopColor: design.accent, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: u(28) }}>
        <Text hyphenationCallback={whole} style={{ fontSize: u(12), color: "#ffffff" }}>{[design.website, design.phone].filter(Boolean).join(" · ") || card.organization.name}</Text>
        <Text hyphenationCallback={whole} style={{ fontSize: u(11), fontFamily: "Helvetica-Bold", color: design.accent, letterSpacing: u(1.4) }}>{card.organization.demo ? "DÉMONSTRATION · DOCUMENT FICTIF" : "DOCUMENT PERSONNEL"}</Text>
      </View>
    </Page>
  );
}

function Back({ card, design }: { card: CardData; design: CardDesign }) {
  const infos = [
    design.address ? ["ADRESSE", design.address] : null,
    design.phone ? ["TÉLÉPHONE", design.phone] : null,
    design.email ? ["E-MAIL", design.email] : null,
    design.website ? ["SITE INTERNET", design.website] : null,
    design.administration ? ["ADMINISTRATION", design.administration] : null,
  ].filter((x): x is [string, string] => x !== null);
  const { bars, width: modules } = code128Bars(card.barcode);
  const bw = u(300);
  const scale = bw / modules;
  return (
    <Page size={[W, H]} style={{ backgroundColor: "#ffffff", fontFamily: "Helvetica" }}>
      <View style={{ height: u(300), position: "relative" }}>
        <Gradient id="back" from={shade(design.primary, -0.2)} to={shade(design.primary, 0.12)} height={300} />
        <Grid color="#ffffff" opacity={0.07} top={0} height={300} />
        <View style={{ paddingHorizontal: u(30), paddingTop: u(26) }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Logo card={card} design={design} size={60} />
            <View style={{ marginLeft: u(14) }}>
              <Text hyphenationCallback={whole} style={{ fontSize: u(21), fontFamily: "Helvetica-Bold", color: "#ffffff" }}>{card.organization.name}</Text>
              <Text hyphenationCallback={whole} style={{ fontSize: u(11), fontFamily: "Helvetica-Bold", color: design.accent, letterSpacing: u(1.4), marginTop: u(3) }}>{card.organization.kind.toUpperCase()}</Text>
            </View>
          </View>
          {design.slogan ? <Text hyphenationCallback={whole} style={{ fontSize: u(15), fontFamily: "Helvetica-BoldOblique", color: "#ffffff", marginTop: u(12) }}>« {design.slogan} »</Text> : null}
          <View style={{ width: u(60), height: u(4), borderRadius: u(4), backgroundColor: design.accent, marginVertical: u(12) }} />
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {infos.map(([label, value]) => (
              <View key={label} style={{ width: u(290), marginRight: u(20), marginBottom: u(10) }}>
                <Text hyphenationCallback={whole} style={{ fontSize: u(10), fontFamily: "Helvetica-Bold", color: design.accent, letterSpacing: u(1.2) }}>{label}</Text>
                <Text hyphenationCallback={whole} style={{ fontSize: u(14), fontFamily: "Helvetica-Bold", color: "#ffffff", marginTop: u(3) }}>{value}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
      <View style={{ height: u(5), backgroundColor: design.accent }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: u(30), paddingTop: u(14) }}>
        {design.show_barcode ? (
          <View style={{ alignItems: "center", marginRight: u(26) }}>
            <Svg width={bw} height={u(64)}>
              {bars.map((b, i) => (
                <Rect key={i} x={b.x * scale} y={0} width={b.w * scale} height={u(64)} fill="#000000" />
              ))}
            </Svg>
            <Text hyphenationCallback={whole} style={{ fontSize: u(13), fontFamily: "Courier-Bold", letterSpacing: u(3), marginTop: u(6) }}>{card.barcode}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text hyphenationCallback={whole} style={{ fontSize: u(11), fontFamily: "Helvetica-Bold", color: design.primary }}>CARTE STRICTEMENT PERSONNELLE</Text>
          <Text hyphenationCallback={whole} style={{ fontSize: u(10), color: "#475569", marginTop: u(4) }}>{design.notice}</Text>
          {design.lost_text ? <Text hyphenationCallback={whole} style={{ fontSize: u(10), fontFamily: "Helvetica-Bold", marginTop: u(4) }}>{design.lost_text}</Text> : null}
          {card.badgeNumber ? <Text hyphenationCallback={whole} style={{ fontSize: u(9), color: "#94a3b8", marginTop: u(3) }}>Carte n° {card.badgeNumber}</Text> : null}
        </View>
      </View>
    </Page>
  );
}

/** Recto puis verso d'une carte. */
export function StudentCardPdfPages({ card, design }: { card: CardData; design: CardDesign }) {
  return (
    <>
      <Front card={card} design={design} />
      <Back card={card} design={design} />
    </>
  );
}
