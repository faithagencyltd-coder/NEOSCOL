import { Page, Text, View } from "@react-pdf/renderer";

import { COLORS } from "@/features/documents/pdf/common";
import { pdfText } from "@/lib/pdf/format";

/** Rapport Analytics imprimable : tableaux simples (pas de graphique), paginés automatiquement. */
export type ReportSection = { title: string; header: string[]; rows: (string | number)[][] };

export function AnalyticsReportPage({ title, period, generatedAt, sections }: { title: string; period: string; generatedAt: string; sections: ReportSection[] }) {
  return (
    <Page size="A4" style={{ padding: 32, fontSize: 9, color: COLORS.ink, fontFamily: "Helvetica" }} wrap>
      <View style={{ marginBottom: 14, borderBottomWidth: 2, borderBottomColor: COLORS.navy, paddingBottom: 8 }}>
        <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: COLORS.navy }}>{pdfText(title)}</Text>
        <Text style={{ color: COLORS.muted, marginTop: 2 }}>{pdfText(period)}</Text>
        <Text style={{ color: COLORS.muted, marginTop: 2 }}>{pdfText(`Généré le ${generatedAt} — données issues d'événements réellement enregistrés.`)}</Text>
      </View>
      {sections.map((s) => (
        <View key={s.title} style={{ marginBottom: 14 }} wrap={s.rows.length > 25}>
          <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: COLORS.navy, marginBottom: 4 }}>{pdfText(s.title)}</Text>
          <View style={{ flexDirection: "row", backgroundColor: COLORS.soft, borderBottomWidth: 1, borderBottomColor: COLORS.line, paddingVertical: 3 }} fixed={false}>
            {s.header.map((h, i) => (
              <Text key={h} style={{ flex: i === 0 ? 3 : 1, fontFamily: "Helvetica-Bold", paddingHorizontal: 3, textAlign: i === 0 ? "left" : "right" }}>
                {pdfText(h)}
              </Text>
            ))}
          </View>
          {s.rows.length === 0 ? <Text style={{ color: COLORS.muted, paddingVertical: 3 }}>{pdfText("Aucune donnée sur la période.")}</Text> : null}
          {s.rows.map((r, ri) => (
            <View key={ri} style={{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COLORS.line, paddingVertical: 2.5 }} wrap={false}>
              {r.map((c, i) => (
                <Text key={i} style={{ flex: i === 0 ? 3 : 1, paddingHorizontal: 3, textAlign: i === 0 ? "left" : "right" }}>
                  {pdfText(typeof c === "number" ? c.toLocaleString("fr-FR") : String(c))}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ))}
      <Text style={{ position: "absolute", bottom: 16, left: 32, right: 32, fontSize: 7, color: COLORS.muted, textAlign: "center" }} render={({ pageNumber, totalPages }) => pdfText(`NeoScool — Analytics — page ${pageNumber} / ${totalPages}`)} fixed />
    </Page>
  );
}
