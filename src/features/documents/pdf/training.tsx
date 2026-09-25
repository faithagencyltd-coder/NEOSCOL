import { Page, Text, View } from "@react-pdf/renderer";

import { pdfDate, pdfText } from "@/lib/pdf/format";

import type { CompetencySheetSnapshot, DocImages, TrainingTranscriptSnapshot, Verification } from "../types";
import { COLORS, DataTable, DemoMark, DocFooter, DocHeader, DocTitle, InfoGrid, Signatures, styles } from "./common";

const LEVELS: Record<string, string> = {
  not_acquired: "Non acquise",
  in_progress: "En cours d'acquisition",
  acquired: "Acquise",
  mastered: "Maîtrisée",
};
const KINDS: Record<string, string> = {
  test: "Interrogation",
  exam: "Examen",
  homework: "Devoir",
  oral: "Oral",
  practical: "TP",
  project: "Projet",
  other: "Évaluation",
};
const note = (v: number | null) => (v === null ? "—" : v.toFixed(2).replace(".", ","));
const hours = (minutes: number) => `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;

/** Relevé de notes de formation : évaluations par module (notes, examens, TP), moyenne et assiduité. */
export function TrainingTranscriptPage({ snapshot, images, verification, issuedAt }: { snapshot: TrainingTranscriptSnapshot; images: DocImages; verification: Verification | null; issuedAt: string }) {
  const org = snapshot.organization;
  const tz = org.timezone;
  return (
    <Page size="A4" style={styles.page}>
      <DemoMark organization={org} />
      <DocHeader organization={org} images={images} />
      <DocTitle color={org.primary_color}>RELEVÉ DE NOTES DE FORMATION</DocTitle>
      <InfoGrid
        rows={[
          ["Apprenant", `${snapshot.student.last_name} ${snapshot.student.first_name}`],
          ["Matricule", snapshot.student.matricule],
          ["Formation", snapshot.formation + (snapshot.duration_hours ? ` (${snapshot.duration_hours} h)` : "")],
          ["Session", `${snapshot.session} — du ${pdfDate(snapshot.period.starts_on, tz)} au ${pdfDate(snapshot.period.ends_on, tz)}`],
        ]}
      />
      <View style={{ marginTop: 12 }}>
        <DataTable
          color={org.primary_color}
          columns={[
            { label: "Module", width: "30%" },
            { label: "Évaluations (note / barème)", width: "54%" },
            { label: "Moyenne /20", width: "16%", align: "center" },
          ]}
          rows={snapshot.modules.map((m) => [
            m.name,
            m.assessments.length
              ? m.assessments.map((a) => `${KINDS[a.kind] ?? a.kind} « ${a.title} » : ${a.score === null ? "abs." : `${note(a.score)}/${a.max}`}`).join(" · ")
              : "Aucune évaluation",
            note(m.average),
          ])}
          footer={["Moyenne générale", "", note(snapshot.average)]}
        />
      </View>
      {snapshot.attendance ? (
        <Text style={{ marginTop: 10 }}>
          {pdfText(
            `Assiduité : ${snapshot.attendance.rate === null ? "—" : `${snapshot.attendance.rate} %`} · absences : ${snapshot.attendance.absences} cours · retards : ${snapshot.attendance.lates} · temps de présence : ${hours(snapshot.attendance.minutes)}.`,
          )}
        </Text>
      ) : null}
      <Text style={{ marginTop: 6, color: COLORS.muted, fontSize: 8 }}>
        {pdfText("Moyenne d'un module : moyenne des évaluations ramenées sur 20, pondérées par leur coefficient.")}
      </Text>
      <View style={{ marginTop: 22 }}>
        <Signatures labels={["Le responsable pédagogique", org.signatory_title ?? "Le directeur"]} organization={org} images={images} date={issuedAt} signatory={org.signatory_name} />
      </View>
      <DocFooter organization={org} verification={verification} />
    </Page>
  );
}

/** Fiche de compétences : niveau atteint pour chaque compétence visée par la formation, stages. */
export function CompetencySheetPage({ snapshot, images, verification, issuedAt }: { snapshot: CompetencySheetSnapshot; images: DocImages; verification: Verification | null; issuedAt: string }) {
  const org = snapshot.organization;
  const tz = org.timezone;
  const acquired = snapshot.competencies.filter((c) => c.level === "acquired" || c.level === "mastered").length;
  return (
    <Page size="A4" style={styles.page}>
      <DemoMark organization={org} />
      <DocHeader organization={org} images={images} />
      <DocTitle color={org.primary_color}>FICHE DE COMPÉTENCES</DocTitle>
      <InfoGrid
        rows={[
          ["Apprenant", `${snapshot.student.last_name} ${snapshot.student.first_name}`],
          ["Matricule", snapshot.student.matricule],
          ["Formation", snapshot.formation],
          ["Session", snapshot.session],
        ]}
      />
      <View style={{ marginTop: 12 }}>
        <DataTable
          color={org.primary_color}
          columns={[
            { label: "Compétence", width: "46%" },
            { label: "Niveau atteint", width: "22%" },
            { label: "Évaluée le", width: "14%", align: "center" },
            { label: "Observation", width: "18%" },
          ]}
          rows={snapshot.competencies.map((c) => [c.name, c.level ? (LEVELS[c.level] ?? c.level) : "Non évaluée", pdfDate(c.evaluated_on, tz), c.comment ?? ""])}
          footer={["Compétences acquises", `${acquired} / ${snapshot.competencies.length}`, "", ""]}
        />
      </View>
      {snapshot.internships.length ? (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 4 }}>{pdfText("Stages en entreprise")}</Text>
          <DataTable
            color={org.primary_color}
            columns={[
              { label: "Entreprise", width: "44%" },
              { label: "Période", width: "32%" },
              { label: "Évaluation", width: "24%", align: "center" },
            ]}
            rows={snapshot.internships.map((i) => [i.company, `${pdfDate(i.starts_on, tz)} — ${pdfDate(i.ends_on, tz)}`, i.score === null ? "—" : `${note(i.score)}/20`])}
          />
        </View>
      ) : null}
      <View style={{ marginTop: 22 }}>
        <Signatures labels={["Le formateur référent", org.signatory_title ?? "Le directeur"]} organization={org} images={images} date={issuedAt} signatory={org.signatory_name} />
      </View>
      <DocFooter organization={org} verification={verification} />
    </Page>
  );
}
