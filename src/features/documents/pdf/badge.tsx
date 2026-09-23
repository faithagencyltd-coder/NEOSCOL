import { Image, Page, Text, View } from "@react-pdf/renderer";

import { pdfText } from "@/lib/pdf/format";

import type { DocImages, DocOrganization } from "../types";
import { COLORS, OrgMark } from "./common";
import { CR80 } from "./student";

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
      <View style={{ backgroundColor: COLORS.navy, paddingTop: 8, paddingBottom: 18, alignItems: "center", gap: 3 }}>
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
    </Page>
  );
}
