import { Page, Text, View } from "@react-pdf/renderer";

import { pdfDate, pdfNumber, pdfText, rankLabel } from "@/lib/pdf/format";

import type { DocImages, ReportCardSnapshot, Verification } from "../types";
import { COLORS, DataTable, DemoMark, DocFooter, DocHeader, DocTitle, InfoGrid, Signatures, styles, Watermark, type Column } from "./common";

/** Une page de bulletin (le document peut en contenir plusieurs : bulletins de classe). */
export function ReportCardPage({
  snapshot,
  images,
  verification,
  issuedAt,
}: {
  snapshot: ReportCardSnapshot;
  images: DocImages;
  verification: Verification | null;
  issuedAt: string;
}) {
  const { organization: org, config, card, student } = snapshot;
  const color = config.primary_color || org.primary_color;
  const accent = config.accent_color || org.accent_color;
  const showRank = snapshot.ranking_enabled && config.show_rank;
  const draft = card.status !== "published";

  const columns: Column[] = [{ label: "Matière", width: config.show_teacher ? "17%" : "24%" }];
  for (const column of card.columns) columns.push({ label: column.label, width: "7%", align: "center" });
  columns.push({ label: "Moy.", width: "7%", align: "center" }, { label: "Coef.", width: "5%", align: "center" }, { label: "Points", width: "7%", align: "center" });
  if (config.show_subject_rank && showRank) columns.push({ label: "Rang", width: "5%", align: "center" });
  if (config.show_class_stats) columns.push({ label: "Moy. cl.", width: "7%", align: "center" }, { label: "Min / Max", width: "10%", align: "center" });
  if (config.show_teacher) columns.push({ label: "Enseignant", width: "12%" });
  if (config.show_appreciation) columns.push({ label: "Appréciation", width: "11%" });
  // Répartit la largeur restante sur la colonne « Matière ».
  const used = columns.slice(1).reduce((sum, c) => sum + Number.parseFloat(String(c.width)), 0);
  columns[0] = { label: "Matière", width: `${Math.max(14, 100 - used)}%` };

  const rows = card.subjects.map((s) => {
    const row = [s.subject];
    for (const column of card.columns) row.push(pdfNumber(s.columns?.[column.key]));
    row.push(pdfNumber(s.average), pdfNumber(s.coefficient, 0), pdfNumber(s.points ?? (s.average !== null ? s.average * s.coefficient : null)));
    if (config.show_subject_rank && showRank) row.push(rankLabel(s.rank));
    if (config.show_class_stats) row.push(pdfNumber(s.class_average), `${pdfNumber(s.min)} / ${pdfNumber(s.max)}`);
    if (config.show_teacher) row.push(s.teacher ?? "—");
    if (config.show_appreciation) row.push(s.mention ?? "");
    return row;
  });
  const footer = ["TOTAL", ...card.columns.map(() => ""), "", pdfNumber(card.coefficient_total, 0), pdfNumber(card.points_total)];
  while (footer.length < columns.length) footer.push("");

  return (
    <Page size="A4" style={styles.page}>
      <DemoMark organization={org} />
      {draft ? <Watermark text="PROVISOIRE" /> : null}
      <DocHeader
        organization={org}
        images={images}
        showLogo={config.show_logo}
        right={
          <>
            <Text style={styles.small}>Année scolaire {pdfText(snapshot.year)}</Text>
            <Text style={[styles.bold, { color: accent }]}>{pdfText(snapshot.period)}</Text>
          </>
        }
      />
      <DocTitle color={color}>{config.title || "BULLETIN DE NOTES"}</DocTitle>
      <InfoGrid
        rows={[
          ["Élève", `${student.last_name} ${student.first_name}`],
          ["Matricule", student.matricule],
          ["Classe", snapshot.class_name],
          ["Né(e) le", `${pdfDate(student.birth_date)}${student.birth_place ? ` à ${student.birth_place}` : ""}`],
          ["Professeur principal", snapshot.head_teacher],
          ["Effectif", card.class_size ? String(card.class_size) : null],
        ]}
      />
      <View style={{ marginTop: 10 }}>
        <DataTable columns={columns} rows={rows} color={color} footer={footer} />
      </View>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }} wrap={false}>
        <View style={[styles.box, { flex: 1, borderLeftWidth: 3, borderLeftColor: accent }]}>
          <Text style={{ color: COLORS.muted }}>Moyenne générale</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 18, color }}>{pdfNumber(card.average)} / 20</Text>
          {card.mention ? <Text style={styles.bold}>{pdfText(card.mention)}</Text> : null}
        </View>
        {showRank ? (
          <View style={[styles.box, { flex: 1 }]}>
            <Text style={{ color: COLORS.muted }}>Rang</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 18, color }}>{rankLabel(card.rank, card.class_size)}</Text>
          </View>
        ) : null}
        {config.show_class_stats ? (
          <View style={[styles.box, { flex: 1.2 }]}>
            <Text style={{ color: COLORS.muted }}>Classe</Text>
            <Text>Moyenne : {pdfNumber(card.class_average)}</Text>
            <Text>Plus forte : {pdfNumber(card.best_average)} · Plus faible : {pdfNumber(card.worst_average)}</Text>
          </View>
        ) : null}
        {config.show_attendance && card.attendance ? (
          <View style={[styles.box, { flex: 1 }]}>
            <Text style={{ color: COLORS.muted }}>Assiduité</Text>
            <Text>Absences : {card.attendance.absences} (dont {card.attendance.justified} justifiée{card.attendance.justified > 1 ? "s" : ""})</Text>
            <Text>Retards : {card.attendance.lates}</Text>
          </View>
        ) : null}
      </View>

      <View style={{ marginTop: 10, gap: 6 }} wrap={false}>
        {card.head_teacher_comment ? (
          <View style={styles.box}>
            <Text style={styles.bold}>Appréciation du professeur principal</Text>
            <Text>{pdfText(card.head_teacher_comment)}</Text>
          </View>
        ) : null}
        {card.appreciation ? (
          <View style={styles.box}>
            <Text style={styles.bold}>Appréciation du conseil de classe</Text>
            <Text>{pdfText(card.appreciation)}</Text>
          </View>
        ) : null}
        {card.decision || card.proposed_decision ? (
          <View style={[styles.box, { borderLeftWidth: 3, borderLeftColor: color }]}>
            <Text>
              <Text style={styles.bold}>Décision : </Text>
              {pdfText(card.decision ?? card.proposed_decision)}
              {!card.decision ? " (proposition)" : ""}
            </Text>
          </View>
        ) : null}
      </View>

      <Signatures
        labels={config.signatures.map((s) => s.label)}
        organization={org}
        images={images}
        date={issuedAt}
        showStamp={config.show_stamp}
        signatory={org.signatory_name}
      />
      {config.footer_note ? <Text style={[styles.small, { marginTop: 6 }]}>{pdfText(config.footer_note)}</Text> : null}
      <DocFooter organization={org} verification={config.show_qr && !draft ? verification : null} />
    </Page>
  );
}
