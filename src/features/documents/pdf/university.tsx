import { Image, Page, Text, View } from "@react-pdf/renderer";

import { pdfDate, pdfText } from "@/lib/pdf/format";

import type { DeliberationMinutesSnapshot, DiplomaSnapshot, DocImages, UniversityTranscriptSnapshot, Verification } from "../types";
import { COLORS, DataTable, DemoMark, DocFooter, DocHeader, DocTitle, InfoGrid, OrgMark, Signatures, styles, Watermark } from "./common";

const note = (v: number | null) => (v === null ? "—" : v.toFixed(2).replace(".", ","));
const cr = (v: number | null) => (v === null ? "—" : String(v).replace(".", ","));
const UE_STATUS: Record<string, string> = { validated: "Validée", compensated: "Compensée", failed: "Non validée", incomplete: "Incomplète", jury: "Jury" };

/** Relevé de notes LMD d'un semestre : UE, matières (session 1 / rattrapage), crédits, résultat. */
export function UniversityTranscriptPage({ snapshot: s, images, verification, issuedAt }: { snapshot: UniversityTranscriptSnapshot; images: DocImages; verification: Verification | null; issuedAt: string }) {
  const org = s.organization;
  const rows: string[][] = [];
  for (const u of s.units) {
    rows.push([`${u.code} — ${u.name}`, cr(u.credits), note(u.session1), note(u.retake), note(u.average), `${cr(u.credits_earned)}/${cr(u.credits)}`, UE_STATUS[u.status] ?? u.status]);
    for (const m of u.subjects) rows.push([`    ${m.name} (coef. ${cr(m.coefficient)})`, "", note(m.session1), note(m.retake), note(m.average), "", ""]);
  }
  return (
    <Page size="A4" style={styles.page}>
      <DemoMark organization={org} />
      <DocHeader organization={org} images={images} />
      <DocTitle color={org.primary_color}>RELEVÉ DE NOTES</DocTitle>
      <InfoGrid
        rows={[
          ["Étudiant", `${s.student.last_name} ${s.student.first_name}`],
          ["Matricule", s.student.matricule],
          ["Né(e) le", s.student.birth_date ? `${pdfDate(s.student.birth_date, org.timezone)}${s.student.birth_place ? ` à ${s.student.birth_place}` : ""}` : null],
          ["Année académique", s.year],
          ["Filière", s.program],
          ["Diplôme préparé", s.degree],
          ["Niveau", s.level],
          ["Parcours", s.track],
          ["Semestre", s.period],
          ["Seuil de validation", `${note(s.pass_mark)}/20`],
        ]}
      />
      <View style={{ marginTop: 12 }}>
        <DataTable
          color={org.primary_color}
          columns={[
            { label: "Unités d'enseignement et matières", width: "40%" },
            { label: "Crédits", width: "8%", align: "center" },
            { label: "Session 1", width: "10%", align: "center" },
            { label: "Rattrapage", width: "11%", align: "center" },
            { label: "Moyenne", width: "10%", align: "center" },
            { label: "Acquis", width: "9%", align: "center" },
            { label: "Statut", width: "12%" },
          ]}
          rows={rows}
          footer={[`Moyenne du semestre${s.rank ? ` — rang ${s.rank}/${s.population}` : ""}`, cr(s.credits_total), "", "", note(s.average), `${cr(s.credits_earned)}/${cr(s.credits_total)}`, s.validated ? (s.compensated ? "Validé (comp.)" : "Validé") : "Non validé"]}
        />
      </View>
      <View style={[styles.box, { marginTop: 10 }]}>
        <Text>
          <Text style={styles.bold}>Résultat : </Text>
          {pdfText(s.decision ?? (s.validated ? "Semestre validé" : "Semestre non validé"))} — {pdfText(`${cr(s.credits_earned)} crédits capitalisés sur ${cr(s.credits_total)}.`)}
        </Text>
      </View>
      <Text style={{ marginTop: 6, color: COLORS.muted, fontSize: 7.5 }}>
        {pdfText("Moyenne d'UE : moyenne des matières pondérée par leur coefficient. Une UE est acquise si sa moyenne atteint le seuil, ou par compensation lorsque la moyenne du semestre l'atteint. Les crédits d'une UE acquise sont définitivement capitalisés.")}
      </Text>
      <View style={{ marginTop: 16 }}>
        <Signatures labels={["Le chef du service de la scolarité", org.signatory_title ?? "Le Président"]} organization={org} images={images} date={issuedAt} signatory={org.signatory_name} />
      </View>
      <DocFooter organization={org} verification={verification} />
    </Page>
  );
}

/** Procès-verbal de délibération : jury, résultats et décisions de chaque étudiant. */
export function DeliberationMinutesPage({ snapshot: s, images, verification, issuedAt }: { snapshot: DeliberationMinutesSnapshot; images: DocImages; verification: Verification | null; issuedAt: string }) {
  const org = s.organization;
  const admitted = s.rows.filter((r) => (r.decision ?? "").toLowerCase().startsWith("admis")).length;
  return (
    <Page size="A4" style={styles.page}>
      <DemoMark organization={org} />
      {s.status !== "closed" ? <Watermark text="PROVISOIRE" /> : null}
      <DocHeader organization={org} images={images} />
      <DocTitle color={org.primary_color}>PROCÈS-VERBAL DE DÉLIBÉRATION</DocTitle>
      <InfoGrid
        rows={[
          ["Délibération", s.title],
          ["Promotion", s.promotion],
          ["Filière", s.program],
          ["Niveau", s.level],
          ["Semestre", s.period ?? "Annuel"],
          ["Session", s.session === "retake" ? "Rattrapage" : "Normale"],
          ["Date du jury", s.held_on ? pdfDate(s.held_on, org.timezone, true) : null],
          ["Président", s.president],
        ]}
      />
      {s.members ? (
        <Text style={{ marginTop: 6 }}>
          <Text style={styles.bold}>Membres du jury : </Text>
          {pdfText(s.members.split("\n").map((m) => m.trim()).filter(Boolean).join(" ; "))}
        </Text>
      ) : null}
      <View style={{ marginTop: 10 }}>
        <DataTable
          color={org.primary_color}
          columns={[
            { label: "N°", width: "5%", align: "center" },
            { label: "Matricule", width: "17%" },
            { label: "Nom et prénoms", width: "30%" },
            { label: "Moyenne", width: "10%", align: "center" },
            { label: "Crédits", width: "10%", align: "center" },
            { label: "Décision du jury", width: "28%" },
          ]}
          rows={s.rows.map((r, i) => [String(i + 1), r.matricule, r.name, note(r.average), `${cr(r.credits_earned)}/${cr(r.credits_total)}`, `${r.decision ?? "—"}${r.jury_credits ? " (crédits accordés par le jury)" : ""}`])}
        />
      </View>
      <Text style={{ marginTop: 8 }}>
        {pdfText(`Effectif : ${s.rows.length} étudiant(s) · admis : ${admitted} · taux de réussite : ${s.rows.length ? Math.round((admitted / s.rows.length) * 100) : 0} %.`)}
      </Text>
      {s.closed_at ? <Text style={{ color: COLORS.muted, fontSize: 8 }}>{pdfText(`Délibération close le ${pdfDate(s.closed_at, org.timezone, true)}.`)}</Text> : null}
      <View style={{ marginTop: 16 }}>
        <Signatures labels={["Les membres du jury", "Le président du jury"]} organization={org} images={images} date={issuedAt} signatory={s.president} />
      </View>
      <DocFooter organization={org} verification={verification} />
    </Page>
  );
}

const DIPLOMA_KINDS: Record<string, string> = { diploma: "DIPLÔME", certificate: "CERTIFICAT", attestation: "ATTESTATION DE RÉUSSITE" };

/** Diplôme (paysage) : intitulé, titulaire, filière, mention, numéro et QR de vérification. */
export function DiplomaPage({ snapshot: s, images, verification, issuedAt }: { snapshot: DiplomaSnapshot; images: DocImages; verification: Verification | null; issuedAt: string }) {
  const org = s.organization;
  const color = org.primary_color || COLORS.navy;
  return (
    <Page size="A4" orientation="landscape" style={{ padding: 22, fontFamily: "Helvetica", color: COLORS.ink }}>
      <DemoMark organization={org} />
      {s.status === "revoked" ? <Watermark text="RÉVOQUÉ" /> : null}
      <View style={{ flex: 1, borderWidth: 3, borderColor: color, padding: 6 }}>
        <View style={{ flex: 1, borderWidth: 0.8, borderColor: color, paddingVertical: 22, paddingHorizontal: 40, alignItems: "center" }}>
          <OrgMark organization={org} images={images} size={54} />
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 15, marginTop: 6, textAlign: "center" }}>{pdfText(org.name)}</Text>
          {org.header_text ? <Text style={{ fontSize: 8.5, color: COLORS.muted, textAlign: "center", marginTop: 2 }}>{pdfText(org.header_text)}</Text> : null}
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 30, letterSpacing: 4, color, marginTop: 18 }}>{DIPLOMA_KINDS[s.diploma_kind] ?? "DIPLÔME"}</Text>
          <Text style={{ fontSize: 17, marginTop: 6, textAlign: "center" }}>{pdfText(s.title)}</Text>
          <Text style={{ fontSize: 11, marginTop: 20 }}>{pdfText("est décerné à")}</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 22, marginTop: 6 }}>{pdfText(`${s.student.first_name} ${s.student.last_name.toUpperCase()}`)}</Text>
          <Text style={{ fontSize: 10.5, marginTop: 6, textAlign: "center" }}>
            {pdfText(
              [
                `Matricule ${s.student.matricule}`,
                s.student.birth_date ? `né(e) le ${pdfDate(s.student.birth_date, org.timezone, true)}${s.student.birth_place ? ` à ${s.student.birth_place}` : ""}` : null,
              ]
                .filter(Boolean)
                .join(", "),
            )}
          </Text>
          <Text style={{ fontSize: 11, marginTop: 14, textAlign: "center" }}>
            {pdfText([s.program ? `Filière : ${s.program}` : null, s.level ? `Niveau : ${s.level}` : null, s.year ? `Année académique ${s.year}` : null].filter(Boolean).join("  ·  "))}
          </Text>
          {s.mention ? <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 13, marginTop: 8 }}>{pdfText(`Mention : ${s.mention}`)}</Text> : null}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", width: "100%", marginTop: "auto" }}>
            <View style={{ width: "30%" }}>
              <Text style={{ fontSize: 9 }}>{pdfText(`N° ${s.number ?? "—"}`)}</Text>
              {s.conferred_on ? <Text style={{ fontSize: 9 }}>{pdfText(`Obtenu le ${pdfDate(s.conferred_on, org.timezone, true)}`)}</Text> : null}
            </View>
            <View style={{ width: "22%", alignItems: "center" }}>
              {verification ? (
                <>
                  <Image src={verification.qr} style={{ width: 58, height: 58 }} />
                  <Text style={{ fontSize: 6.5, color: COLORS.muted, textAlign: "center" }}>{pdfText(`Vérification : ${verification.code}`)}</Text>
                </>
              ) : null}
            </View>
            <View style={{ width: "40%" }}>
              <Signatures labels={[org.signatory_title ?? "Le Président"]} organization={org} images={images} date={s.issued_on ?? issuedAt} signatory={org.signatory_name} />
            </View>
          </View>
        </View>
      </View>
    </Page>
  );
}
