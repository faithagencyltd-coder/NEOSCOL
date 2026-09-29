import { Defs, Image, LinearGradient, Page, Rect, Stop, Svg, Text, View } from "@react-pdf/renderer";

import { pdfText } from "@/lib/pdf/format";

import type { DocImages, DocOrganization } from "../types";
import { COLORS, OrgMark } from "./common";
import { CR80 } from "./student";


/** Fond d'en-tête en dégradé (bleu nuit → couleur de l'établissement → cyan). */
function HeaderGradient({ color, height }: { color: string; height: number }) {
  return (
    <Svg width={CR80[1]} height={height} style={{ position: "absolute", top: 0, left: 0 }}>
      <Defs>
        <LinearGradient id="hdr" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#07142B" />
          <Stop offset="0.7" stopColor={color} />
          <Stop offset="1" stopColor="#0EA5E9" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={CR80[1]} height={height} fill="url(#hdr)" />
    </Svg>
  );
}

/** Bande holographique + puce (finition premium, impression à plat). */
function FoilStrip() {
  return (
    <View style={{ position: "absolute", left: 8, right: 8, bottom: 6, flexDirection: "row", alignItems: "center", gap: 5 }}>
      <Svg width={14} height={10}>
        <Defs>
          <LinearGradient id="chip" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FDE68A" />
            <Stop offset="0.5" stopColor="#F59E0B" />
            <Stop offset="1" stopColor="#B45309" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="14" height="10" rx="2" fill="url(#chip)" />
      </Svg>
      <Svg width={CR80[1] - 35} height={3}>
        <Defs>
          <LinearGradient id="foil" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#7DD3FC" />
            <Stop offset="0.35" stopColor="#F9A8D4" />
            <Stop offset="0.7" stopColor="#FDE047" />
            <Stop offset="1" stopColor="#86EFAC" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={CR80[1] - 35} height="3" rx="1.5" fill="url(#foil)" />
      </Svg>
    </View>
  );
}

export type BadgeData = {
  organization: DocOrganization;
  staff: { first_name: string; last_name: string; job_title: string | null; employee_number: string };
  badge: { number: string; year: string | null; status: string };
  qr: string;
};

/** Badge professionnel du personnel (CR80, portrait) : son QR sert au pointage. */
export function StaffBadgePage({ data, images }: { data: BadgeData; images: DocImages }) {
  const { organization: org, staff, badge } = data;
  return (
    <Page size={[CR80[1], CR80[0]]} style={{ fontFamily: "Helvetica", fontSize: 7, color: COLORS.ink, backgroundColor: "#FFFFFF" }}>
      <View style={{ paddingTop: 8, paddingBottom: 18, alignItems: "center", gap: 3 }}>
        <HeaderGradient color={org.primary_color || COLORS.navy} height={84} />
        <OrgMark organization={org} images={images} size={22} />
        <Text style={{ color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 7.5, textAlign: "center", paddingHorizontal: 6 }}>{pdfText(org.name)}</Text>
        <Text style={{ color: COLORS.cyan, fontSize: 6, letterSpacing: 1 }}>PERSONNEL {pdfText(badge.year ?? "")}</Text>
        {badge.status !== "active" || org.is_demo ? (
          <Text style={{ fontSize: 5.5, color: "#FCA5A5", fontFamily: "Helvetica-Bold" }}>
            {badge.status !== "active" ? "BADGE DÉSACTIVÉ" : "DÉMONSTRATION"}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: "center", marginTop: -14 }}>
        {images.photo ? (
          <Image src={images.photo} style={{ width: 58, height: 70, objectFit: "cover", borderRadius: 4, borderWidth: 2, borderColor: "#FFFFFF" }} />
        ) : (
          <View style={{ width: 58, height: 70, borderRadius: 4, backgroundColor: COLORS.soft, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" }}>
            <Text style={{ fontSize: 16, color: COLORS.muted }}>{`${staff.first_name[0] ?? ""}${staff.last_name[0] ?? ""}`}</Text>
          </View>
        )}
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9.5, marginTop: 4 }}>{pdfText(staff.last_name)}</Text>
        <Text style={{ fontSize: 8 }}>{pdfText(staff.first_name)}</Text>
        <Text style={{ fontSize: 7, color: COLORS.blue, marginTop: 1 }}>{pdfText(staff.job_title ?? "")}</Text>
        <Text style={{ fontSize: 6.5, marginTop: 2 }}>Matricule {staff.employee_number}</Text>
        <Image src={data.qr} style={{ width: 62, height: 62, marginTop: 5 }} />
        <Text style={{ fontSize: 5.5, color: COLORS.muted, marginTop: 2 }}>{badge.number}</Text>
      </View>
      <FoilStrip />
    </Page>
  );
}

export type LearnerBadgeData = {
  organization: DocOrganization;
  learner: { first_name: string; last_name: string; matricule: string };
  formation: string | null;
  session: string | null;
  group: string | null;
  badge: { number: string; status: string };
  qr: string;
  /** Profil imprimé sous le nom de l'établissement (APPRENANT, ÉTUDIANT). */
  role?: string;
};

/** Badge de l'apprenant (CR80, portrait) : logo, photo, identité, matricule, formation, session, groupe, QR personnel. */
export function LearnerBadgePage({ data, images }: { data: LearnerBadgeData; images: DocImages }) {
  const { organization: org, learner, badge } = data;
  return (
    <Page size={[CR80[1], CR80[0]]} style={{ fontFamily: "Helvetica", fontSize: 7, color: COLORS.ink, backgroundColor: "#FFFFFF" }}>
      <View style={{ paddingTop: 7, paddingBottom: 16, alignItems: "center", gap: 2 }}>
        <HeaderGradient color={org.primary_color || COLORS.navy} height={76} />
        <OrgMark organization={org} images={images} size={20} />
        <Text style={{ color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 7, textAlign: "center", paddingHorizontal: 6 }}>{pdfText(org.name)}</Text>
        <Text style={{ color: "#FFFFFF", fontSize: 5.5, letterSpacing: 1 }}>{data.role ?? "APPRENANT"}</Text>
        {badge.status !== "active" || org.is_demo ? (
          <Text style={{ fontSize: 5.5, color: "#FCA5A5", fontFamily: "Helvetica-Bold" }}>{badge.status !== "active" ? "BADGE DÉSACTIVÉ" : "DÉMONSTRATION"}</Text>
        ) : null}
      </View>
      <View style={{ alignItems: "center", marginTop: -12 }}>
        {images.photo ? (
          <Image src={images.photo} style={{ width: 54, height: 64, objectFit: "cover", borderRadius: 4, borderWidth: 2, borderColor: "#FFFFFF" }} />
        ) : (
          <View style={{ width: 54, height: 64, borderRadius: 4, backgroundColor: COLORS.soft, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" }}>
            <Text style={{ fontSize: 15, color: COLORS.muted }}>{`${learner.first_name[0] ?? ""}${learner.last_name[0] ?? ""}`}</Text>
          </View>
        )}
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9, marginTop: 3 }}>{pdfText(learner.last_name)}</Text>
        <Text style={{ fontSize: 7.5 }}>{pdfText(learner.first_name)}</Text>
        <Text style={{ fontSize: 6.5, marginTop: 1 }}>Matricule {learner.matricule}</Text>
        {data.formation ? <Text style={{ fontSize: 6.5, color: COLORS.blue, marginTop: 1, textAlign: "center", paddingHorizontal: 6 }}>{pdfText(data.formation)}</Text> : null}
        {data.session ? (
          <Text style={{ fontSize: 5.5, color: COLORS.muted, textAlign: "center", paddingHorizontal: 6 }}>
            {pdfText(data.session + (data.group ? ` · ${data.group}` : ""))}
          </Text>
        ) : null}
        <Image src={data.qr} style={{ width: 56, height: 56, marginTop: 4 }} />
        <Text style={{ fontSize: 5.5, color: COLORS.muted, marginTop: 1 }}>{badge.number}</Text>
      </View>
      <FoilStrip />
    </Page>
  );
}
