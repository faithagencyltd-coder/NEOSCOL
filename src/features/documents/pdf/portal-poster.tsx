import { Image, Page, Text, View } from "@react-pdf/renderer";

import { pdfText } from "@/lib/pdf/format";

import type { DocImages, DocOrganization } from "../types";
import { COLORS, DemoMark, OrgMark } from "./common";

type Portal = { label: string; sub: string; method: string };

/** Affiche A4 du lien des portails : QR code, adresse, portails et méthode de connexion. */
export function PortalPosterPage({
  organization,
  images,
  url,
  qr,
  portals,
}: {
  organization: DocOrganization;
  images: DocImages;
  url: string;
  qr: string;
  portals: Portal[];
}) {
  const color = organization.primary_color;
  return (
    <Page size="A4" style={{ padding: 40, fontFamily: "Helvetica", color: COLORS.ink }}>
      <DemoMark organization={organization} />
      <View style={{ alignItems: "center", gap: 8 }}>
        <OrgMark organization={organization} images={images} size={70} />
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 22, textAlign: "center" }}>{pdfText(organization.name)}</Text>
        {organization.city ? <Text style={{ fontSize: 11, color: COLORS.muted }}>{pdfText(organization.city)}</Text> : null}
      </View>

      <View style={{ marginTop: 22, borderRadius: 14, backgroundColor: color, paddingVertical: 14, paddingHorizontal: 18 }}>
        <Text style={{ color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 20, textAlign: "center" }}>Connectez-vous à votre portail</Text>
        <Text style={{ color: "#FFFFFF", fontSize: 11, textAlign: "center", marginTop: 4, opacity: 0.9 }}>
          Parents, enseignants, formateurs, élèves et étudiants : un seul lien, chacun avec ses identifiants personnels.
        </Text>
      </View>

      <View style={{ marginTop: 22, alignItems: "center", gap: 10 }}>
        <Image src={qr} style={{ width: 210, height: 210 }} />
        <Text style={{ fontSize: 10, color: COLORS.muted }}>Scannez le QR code avec l&apos;appareil photo de votre téléphone</Text>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 14, color }}>{url}</Text>
      </View>

      <View style={{ marginTop: 22, flexDirection: "row", gap: 10 }}>
        {portals.map((p) => (
          <View key={p.label} style={{ flex: 1, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, padding: 10, backgroundColor: COLORS.soft }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9.5, color }}>{pdfText(p.label)}</Text>
            <Text style={{ fontSize: 8.5, color: COLORS.muted, marginTop: 2 }}>{pdfText(p.sub)}</Text>
            <Text style={{ fontSize: 9, marginTop: 6 }}>{pdfText(p.method)}</Text>
          </View>
        ))}
      </View>

      <View style={{ position: "absolute", bottom: 30, left: 40, right: 40, borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 8 }}>
        <Text style={{ fontSize: 8.5, color: COLORS.muted, textAlign: "center" }}>
          Identifiants oubliés ou pas encore de compte ? Adressez-vous au secrétariat
          {organization.phone ? ` (${pdfText(organization.phone)})` : ""}. Ne partagez jamais votre mot de passe ni votre code SMS.
        </Text>
      </View>
    </Page>
  );
}
