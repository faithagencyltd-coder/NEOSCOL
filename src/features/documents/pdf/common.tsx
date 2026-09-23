import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

import { pdfDate, pdfText } from "@/lib/pdf/format";

import type { DocImages, DocOrganization, Verification } from "../types";

export const COLORS = {
  navy: "#0B1F3A",
  blue: "#1E6FFF",
  cyan: "#22D3EE",
  ink: "#0F1B3D",
  muted: "#5B6B8C",
  line: "#D8E0EE",
  soft: "#F3F6FC",
  danger: "#C62828",
};

export const styles = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 64, paddingHorizontal: 32, fontFamily: "Helvetica", fontSize: 9.5, color: COLORS.ink },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 8, borderBottomWidth: 2 },
  brand: { flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "70%" },
  logo: { width: 42, height: 42, objectFit: "contain" },
  monogram: { width: 42, height: 42, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  monogramText: { color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 12 },
  orgName: { fontFamily: "Helvetica-Bold", fontSize: 12.5 },
  small: { fontSize: 8, color: COLORS.muted },
  title: { fontFamily: "Helvetica-Bold", fontSize: 16, textAlign: "center", marginTop: 12, marginBottom: 10, letterSpacing: 0.6 },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 10.5, marginTop: 10, marginBottom: 4 },
  box: { backgroundColor: COLORS.soft, borderRadius: 6, padding: 8 },
  row: { flexDirection: "row" },
  bold: { fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 18, left: 32, right: 32, flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 6 },
  qr: { width: 40, height: 40 },
  watermark: { position: "absolute", top: 330, left: 0, right: 0, textAlign: "center", fontSize: 58, color: "#E3342F", opacity: 0.12, transform: "rotate(-30deg)", fontFamily: "Helvetica-Bold" },
  demo: { position: "absolute", top: 8, right: 32, fontSize: 7, color: COLORS.danger },
});

/** Logo de l'établissement ou monogramme aux couleurs de l'établissement. */
export function OrgMark({ organization, images, size = 42 }: { organization: DocOrganization; images: DocImages; size?: number }) {
  if (images.logo) return <Image src={images.logo} style={{ width: size, height: size, objectFit: "contain" }} />;
  return (
    <View style={[styles.monogram, { width: size, height: size, backgroundColor: organization.primary_color }]}>
      <Text style={[styles.monogramText, { fontSize: size / 3.4 }]}>{organization.code.slice(0, 4)}</Text>
    </View>
  );
}

export function DocHeader({
  organization,
  images,
  right,
  showLogo = true,
}: {
  organization: DocOrganization;
  images: DocImages;
  right?: ReactNode;
  showLogo?: boolean;
}) {
  const address = [organization.address, organization.city].filter(Boolean).join(", ");
  const contact = [organization.phone, organization.email].filter(Boolean).join(" · ");
  return (
    <View style={[styles.header, { borderBottomColor: organization.primary_color }]} fixed>
      <View style={styles.brand}>
        {showLogo ? <OrgMark organization={organization} images={images} /> : null}
        <View>
          <Text style={styles.orgName}>{pdfText(organization.name)}</Text>
          {address ? <Text style={styles.small}>{pdfText(address)}</Text> : null}
          {contact ? <Text style={styles.small}>{pdfText(contact)}</Text> : null}
          {organization.header_text ? <Text style={styles.small}>{pdfText(organization.header_text)}</Text> : null}
        </View>
      </View>
      {right ? <View style={{ alignItems: "flex-end" }}>{right}</View> : null}
    </View>
  );
}

export function DocTitle({ children, color }: { children: string; color: string }) {
  return <Text style={[styles.title, { color }]}>{pdfText(children)}</Text>;
}

/** Pied de page : QR de vérification, numéro, pagination. */
export function DocFooter({ organization, verification }: { organization: DocOrganization; verification: Verification | null }) {
  return (
    <View style={styles.footer} fixed>
      {verification ? <Image src={verification.qr} style={styles.qr} /> : null}
      <View style={{ flex: 1 }}>
        {verification ? (
          <>
            <Text style={[styles.small, styles.bold]}>Document n° {verification.number}</Text>
            <Text style={styles.small}>Authenticité vérifiable : {verification.url}</Text>
          </>
        ) : (
          <Text style={styles.small}>Document non numéroté — sans valeur officielle.</Text>
        )}
        {organization.footer_text ? <Text style={styles.small}>{pdfText(organization.footer_text)}</Text> : null}
      </View>
      <Text style={styles.small} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export function DemoMark({ organization }: { organization: DocOrganization }) {
  return organization.is_demo ? <Text style={styles.demo} fixed>DÉMONSTRATION — DONNÉES FICTIVES</Text> : null;
}

export function Watermark({ text }: { text: string }) {
  return (
    <Text style={styles.watermark} fixed>
      {text}
    </Text>
  );
}

/** Grille libellé / valeur sur deux colonnes. */
export function InfoGrid({ rows }: { rows: [string, string | null | undefined][] }) {
  return (
    <View style={[styles.box, { flexDirection: "row", flexWrap: "wrap" }]}>
      {rows.map(([label, value]) => (
        <View key={label} style={{ width: "50%", flexDirection: "row", paddingVertical: 1.5, paddingRight: 6 }}>
          <Text style={{ color: COLORS.muted }}>{label} : </Text>
          <Text style={[styles.bold, { flex: 1 }]}>{pdfText(value || "—")}</Text>
        </View>
      ))}
    </View>
  );
}

export type Column = { label: string; width: string | number; align?: "left" | "right" | "center" };

export function DataTable({ columns, rows, color, zebra = true, footer }: { columns: Column[]; rows: string[][]; color: string; zebra?: boolean; footer?: string[] }) {
  const cell = (column: Column) => ({
    width: column.width,
    textAlign: column.align ?? "left",
    paddingVertical: 3.5,
    paddingHorizontal: 4,
  });
  return (
    <View style={{ borderWidth: 1, borderColor: COLORS.line, borderRadius: 4 }}>
      <View style={{ flexDirection: "row", backgroundColor: color }}>
        {columns.map((column) => (
          <Text key={column.label} style={[cell(column), { color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 7.5 }]}>
            {pdfText(column.label)}
          </Text>
        ))}
      </View>
      {rows.map((row, index) => (
        <View
          key={index}
          wrap={false}
          style={{ flexDirection: "row", backgroundColor: zebra && index % 2 ? COLORS.soft : "#FFFFFF", borderTopWidth: index ? 0.5 : 0, borderTopColor: COLORS.line }}
        >
          {row.map((value, i) => {
            const column = columns[i];
            return column ? (
              <Text key={i} style={cell(column)}>
                {pdfText(value)}
              </Text>
            ) : null;
          })}
        </View>
      ))}
      {footer ? (
        <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: COLORS.ink }}>
          {footer.map((value, i) => {
            const column = columns[i];
            return column ? (
              <Text key={i} style={[cell(column), styles.bold]}>
                {pdfText(value)}
              </Text>
            ) : null;
          })}
        </View>
      ) : null}
    </View>
  );
}

/** Bloc de signatures (et cachet) avec lieu et date. */
export function Signatures({
  labels,
  organization,
  images,
  date,
  showStamp = true,
  signatory = null,
}: {
  labels: string[];
  organization: DocOrganization;
  images: DocImages;
  date: string;
  showStamp?: boolean;
  /** Nom imprimé sous la dernière signature (signataire officiel). */
  signatory?: string | null;
}) {
  const place = organization.city ? `Fait à ${organization.city}, le ` : "Fait le ";
  return (
    <View wrap={false} style={{ marginTop: 14 }}>
      <Text style={{ textAlign: "right", marginBottom: 6 }}>{pdfText(place + pdfDate(date, organization.timezone, true))}</Text>
      <View style={{ flexDirection: "row", justifyContent: labels.length > 1 ? "space-between" : "flex-end", gap: 12 }}>
        {labels.map((label, index) => {
          const main = index === labels.length - 1;
          return (
            <View key={label} style={{ width: labels.length > 1 ? `${Math.floor(100 / labels.length) - 2}%` : "45%", alignItems: "center" }}>
              <Text style={styles.bold}>{pdfText(label)}</Text>
              <View style={{ height: 56, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 4 }}>
                {main && showStamp && images.stamp ? <Image src={images.stamp} style={{ width: 54, height: 54, objectFit: "contain", opacity: 0.85 }} /> : null}
                {main && signatory && images.signature ? <Image src={images.signature} style={{ width: 90, height: 44, objectFit: "contain" }} /> : null}
              </View>
              {main && signatory ? <Text>{pdfText(signatory)}</Text> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}
