import { Image, Page, Text, View } from "@react-pdf/renderer";

import { ENROLLMENT_STATUS, ENROLLMENT_TYPE, RELATIONSHIP, SEX } from "@/lib/labels";
import { pdfDate, pdfDateTime, pdfMoney, pdfText } from "@/lib/pdf/format";

import type {
  CertificateSnapshot,
  CommitmentSnapshot,
  DocImages,
  DossierSnapshot,
  EnrollmentFormSnapshot,
  StudentCardSnapshot,
  TranscriptSnapshot,
  Verification,
} from "../types";
import { fillText } from "../templates";
import { COLORS, DataTable, DemoMark, DocFooter, DocHeader, DocTitle, InfoGrid, OrgMark, Signatures, styles } from "./common";

/** Remplace les variables {{eleve.nom}}… d'un document rédigé (Document Studio). */
export function fillTemplate(text: string, snapshot: CertificateSnapshot, issuedAt?: string): string {
  const s = snapshot.student;
  const tz = snapshot.organization.timezone;
  return fillText(text, {
    "eleve.nom": s.last_name,
    "eleve.prenom": s.first_name,
    "eleve.matricule": s.matricule,
    "eleve.date_naissance": pdfDate(s.birth_date, tz, true),
    "eleve.lieu_naissance": s.birth_place ?? "—",
    "classe.nom": snapshot.class_name ?? "—",
    "formation.nom": snapshot.program ?? snapshot.class_name ?? "—",
    "annee.nom": snapshot.year ?? "—",
    "etablissement.nom": snapshot.organization.name,
    "signataire.nom": snapshot.organization.signatory_name ?? "le chef d'établissement",
    "signataire.fonction": snapshot.organization.signatory_title ?? "chef d'établissement",
    date: pdfDate(issuedAt ?? new Date().toISOString(), tz, true),
    contenu: snapshot.purpose ?? "",
  });
}

export function CertificatePage({ snapshot, images, verification, issuedAt }: { snapshot: CertificateSnapshot; images: DocImages; verification: Verification | null; issuedAt: string }) {
  const org = snapshot.organization;
  return (
    <Page size="A4" style={[styles.page, { fontSize: 11.5 }]}>
      <DemoMark organization={org} />
      <DocHeader organization={org} images={images} />
      <View style={{ marginTop: 40, marginBottom: 26 }}>
        <DocTitle color={org.primary_color}>{snapshot.title}</DocTitle>
      </View>
      <Text style={{ lineHeight: 1.45, textAlign: "justify" }}>{pdfText(fillTemplate(snapshot.body, snapshot, issuedAt))}</Text>
      {snapshot.purpose && snapshot.kind === "school_certificate" ? (
        <Text style={{ lineHeight: 1.45, marginTop: 10 }}>{pdfText(`Motif de la demande : ${snapshot.purpose}`)}</Text>
      ) : null}
      {snapshot.closing.trim() ? <Text style={{ lineHeight: 1.45, marginTop: 14 }}>{pdfText(fillTemplate(snapshot.closing, snapshot, issuedAt))}</Text> : null}
      <View style={{ marginTop: 30 }}>
        <Signatures labels={[org.signatory_title ?? "Le chef d'établissement"]} organization={org} images={images} date={issuedAt} signatory={org.signatory_name} />
      </View>
      <DocFooter organization={org} verification={verification} />
    </Page>
  );
}

export function EnrollmentFormPage({ snapshot, images, verification, issuedAt }: { snapshot: EnrollmentFormSnapshot; images: DocImages; verification: Verification | null; issuedAt: string }) {
  const { organization: org, student, enrollment } = snapshot;
  const sections = new Map<string, { label: string; value: string }[]>();
  for (const field of enrollment.fields) {
    const list = sections.get(field.section) ?? [];
    list.push(field);
    sections.set(field.section, list);
  }
  return (
    <Page size="A4" style={styles.page}>
      <DemoMark organization={org} />
      <DocHeader
        organization={org}
        images={images}
        right={
          <>
            <Text style={[styles.bold, { color: org.primary_color }]}>{enrollment.reference}</Text>
            <Text style={styles.small}>Année scolaire {pdfText(enrollment.year)}</Text>
          </>
        }
      />
      <DocTitle color={org.primary_color}>{`FICHE D'INSCRIPTION — ${(ENROLLMENT_TYPE[enrollment.type] ?? enrollment.type).toUpperCase()}`}</DocTitle>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Élève</Text>
          <InfoGrid
            rows={[
              ["Nom", student.last_name],
              ["Prénoms", [student.first_name, student.other_names].filter(Boolean).join(" ")],
              ["Matricule", student.matricule],
              ["Sexe", student.sex ? SEX[student.sex] : null],
              ["Né(e) le", pdfDate(student.birth_date)],
              ["À", student.birth_place],
              ["Nationalité", student.nationality],
              ["Ville", student.city],
              ["Téléphone", student.phone],
              ["E-mail", student.email],
            ]}
          />
        </View>
        {images.photo ? <Image src={images.photo} style={{ width: 80, height: 100, objectFit: "cover", marginTop: 24, borderRadius: 4 }} /> : null}
      </View>
      <Text style={styles.sectionTitle}>Scolarité demandée</Text>
      <InfoGrid
        rows={[
          ["Classe", enrollment.class_name],
          ["Niveau", enrollment.level],
          ["Filière / formation", enrollment.program],
          ["Statut", ENROLLMENT_STATUS[enrollment.status]?.label ?? enrollment.status],
          ["Déposée le", enrollment.submitted_at ? pdfDateTime(enrollment.submitted_at, org.timezone) : null],
          ["Décision le", enrollment.decided_at ? pdfDateTime(enrollment.decided_at, org.timezone) : null],
        ]}
      />
      <Text style={styles.sectionTitle}>Parents / tuteurs</Text>
      {snapshot.guardians.length ? (
        <DataTable
          color={org.primary_color}
          columns={[
            { label: "Nom", width: "28%" },
            { label: "Lien", width: "16%" },
            { label: "Téléphone", width: "18%" },
            { label: "E-mail", width: "22%" },
            { label: "Profession", width: "16%" },
          ]}
          rows={snapshot.guardians.map((g) => [
            `${g.name}${g.is_financial_responsible ? " (resp. financier)" : ""}`,
            RELATIONSHIP[g.relationship] ?? g.relationship,
            g.phone ?? "—",
            g.email ?? "—",
            g.profession ?? "—",
          ])}
        />
      ) : (
        <Text style={styles.small}>Aucun parent ou tuteur enregistré.</Text>
      )}
      {[...sections.entries()].map(([section, fields]) => (
        <View key={section} wrap={false}>
          <Text style={styles.sectionTitle}>{pdfText(section)}</Text>
          <InfoGrid rows={fields.map((f) => [f.label, f.value])} />
        </View>
      ))}
      <Signatures labels={["Le parent / tuteur", "Le secrétariat"]} organization={org} images={images} date={issuedAt} />
      <DocFooter organization={org} verification={verification} />
    </Page>
  );
}

export function CommitmentPage({ snapshot, images, verification, issuedAt }: { snapshot: CommitmentSnapshot; images: DocImages; verification: Verification | null; issuedAt: string }) {
  const { organization: org, student, guardian, enrollment, fees } = snapshot;
  const currency = org.currency;
  const who = guardian ? `${guardian.name} (${RELATIONSHIP[guardian.relationship] ?? guardian.relationship})` : "le parent ou tuteur légal";
  return (
    <Page size="A4" style={[styles.page, { fontSize: 10.5 }]}>
      <DemoMark organization={org} />
      <DocHeader organization={org} images={images} right={<Text style={[styles.bold, { color: org.primary_color }]}>{enrollment.reference}</Text>} />
      <DocTitle color={org.primary_color}>ENGAGEMENT DU PARENT / TUTEUR</DocTitle>
      <Text style={{ lineHeight: 1.6 }}>
        {pdfText(
          `Je soussigné(e), ${who}${guardian?.phone ? `, joignable au ${guardian.phone}` : ""}, responsable de l'élève ${student.first_name} ${student.last_name} (matricule ${student.matricule}), inscrit(e) en ${enrollment.class_name ?? "—"} pour l'année scolaire ${enrollment.year} à ${org.name}, m'engage à :`,
        )}
      </Text>
      <View style={{ marginTop: 8, marginLeft: 12, gap: 4, lineHeight: 1.5 }}>
        {[
          "respecter et faire respecter le règlement intérieur de l'établissement ;",
          "assurer l'assiduité et la ponctualité de l'élève, et justifier toute absence dans les meilleurs délais ;",
          "suivre régulièrement les résultats scolaires et répondre aux convocations de l'établissement ;",
          "régler les frais de scolarité selon l'échéancier ci-dessous ; en cas de retard, certaines fonctionnalités du portail peuvent être restreintes (les présences restent toujours consultables).",
        ].map((item) => (
          <Text key={item}>• {pdfText(item)}</Text>
        ))}
      </View>
      <Text style={styles.sectionTitle}>Frais de scolarité</Text>
      <DataTable
        color={org.primary_color}
        columns={[
          { label: "Désignation", width: "70%" },
          { label: "Montant", width: "30%", align: "right" },
        ]}
        rows={fees.lines.map((l) => [l.description, pdfMoney(l.amount, currency)])}
        footer={["Total", pdfMoney(fees.total, currency)]}
      />
      {fees.installments.length ? (
        <>
          <Text style={styles.sectionTitle}>Échéancier</Text>
          <DataTable
            color={org.accent_color}
            columns={[
              { label: "Échéance", width: "50%" },
              { label: "Date limite", width: "25%", align: "center" },
              { label: "Montant", width: "25%", align: "right" },
            ]}
            rows={fees.installments.map((i) => [i.label, pdfDate(i.due_on), pdfMoney(i.amount, currency)])}
          />
        </>
      ) : null}
      <Signatures labels={["Le parent / tuteur (lu et approuvé)", "Le chef d'établissement"]} organization={org} images={images} date={issuedAt} signatory={org.signatory_name} />
      <DocFooter organization={org} verification={verification} />
    </Page>
  );
}

/** Carte scolaire au format carte bancaire (CR80 : 85,6 × 54 mm). */
export const CR80: [number, number] = [242.6, 153];

export function StudentCardPage({ snapshot, images, verification }: { snapshot: StudentCardSnapshot; images: DocImages; verification: Verification | null }) {
  const { organization: org, student } = snapshot;
  return (
    <Page size={CR80} style={{ fontFamily: "Helvetica", fontSize: 7, color: COLORS.ink, backgroundColor: "#FFFFFF" }}>
      <View style={{ backgroundColor: org.primary_color, paddingVertical: 5, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 5 }}>
        <OrgMark organization={org} images={images} size={20} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 7.5 }}>{pdfText(org.name)}</Text>
          <Text style={{ color: COLORS.cyan, fontSize: 6 }}>CARTE SCOLAIRE {pdfText(snapshot.year ?? "")}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", padding: 8, gap: 8 }}>
        {images.photo ? (
          <Image src={images.photo} style={{ width: 52, height: 64, objectFit: "cover", borderRadius: 3 }} />
        ) : (
          <View style={{ width: 52, height: 64, borderRadius: 3, backgroundColor: COLORS.soft, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 14, color: COLORS.muted }}>{`${student.first_name[0] ?? ""}${student.last_name[0] ?? ""}`}</Text>
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9 }}>{pdfText(student.last_name)}</Text>
          <Text style={{ fontSize: 8 }}>{pdfText(student.first_name)}</Text>
          <Text>Matricule : <Text style={{ fontFamily: "Helvetica-Bold" }}>{student.matricule}</Text></Text>
          <Text>Classe : {pdfText(snapshot.class_name ?? "—")}</Text>
          <Text>Né(e) le {pdfDate(student.birth_date)}</Text>
        </View>
        {verification ? <Image src={verification.qr} style={{ width: 46, height: 46, alignSelf: "flex-end" }} /> : null}
      </View>
      <Text style={{ position: "absolute", bottom: 4, left: 8, right: 8, fontSize: 5.5, color: COLORS.muted }}>
        {verification ? `N° ${verification.number} — vérifiable en ligne` : ""}
        {org.is_demo ? " — DÉMONSTRATION" : ""}
      </Text>
    </Page>
  );
}

export function DossierCoverPage({ snapshot, images, verification, issuedAt }: { snapshot: DossierSnapshot; images: DocImages; verification: Verification | null; issuedAt: string }) {
  const { organization: org, student } = snapshot;
  return (
    <Page size="A4" style={styles.page}>
      <DemoMark organization={org} />
      <DocHeader organization={org} images={images} />
      <View style={{ marginTop: 60, alignItems: "center", gap: 8 }}>
        {images.photo ? <Image src={images.photo} style={{ width: 90, height: 112, objectFit: "cover", borderRadius: 4 }} /> : null}
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 22, color: org.primary_color }}>DOSSIER COMPLET</Text>
        <Text style={{ fontSize: 15, fontFamily: "Helvetica-Bold" }}>{pdfText(`${student.last_name} ${student.first_name}`)}</Text>
        <Text>Matricule {student.matricule}{snapshot.class_name ? ` · ${pdfText(snapshot.class_name)}` : ""}</Text>
        <Text style={styles.small}>Édité le {pdfDateTime(issuedAt, org.timezone)}</Text>
      </View>
      <Text style={[styles.sectionTitle, { marginTop: 40 }]}>Sommaire</Text>
      <DataTable
        color={org.primary_color}
        columns={[
          { label: "#", width: "8%", align: "center" },
          { label: "Pièce", width: "72%" },
          { label: "Nombre", width: "20%", align: "center" },
        ]}
        rows={snapshot.sections.map((s, i) => [String(i + 1), s.label, String(s.count)])}
      />
      <DocFooter organization={org} verification={verification} />
    </Page>
  );
}

/** Relevé de notes de l'année : moyennes par matière et par période (bulletins publiés). */
export function TranscriptPage({ snapshot, images, verification, issuedAt }: { snapshot: TranscriptSnapshot; images: DocImages; verification: Verification | null; issuedAt: string }) {
  const org = snapshot.organization;
  const n = snapshot.periods.length;
  const fmt = (v: number | null) => (v === null ? "—" : v.toFixed(2).replace(".", ","));
  const width = `${Math.floor(46 / Math.max(n + 1, 1))}%`;
  return (
    <Page size="A4" style={styles.page}>
      <DemoMark organization={org} />
      <DocHeader organization={org} images={images} />
      <DocTitle color={org.primary_color}>{`RELEVÉ DE NOTES${snapshot.year ? ` — ${snapshot.year}` : ""}`}</DocTitle>
      <InfoGrid
        rows={[
          ["Élève", `${snapshot.student.last_name} ${snapshot.student.first_name}`],
          ["Matricule", snapshot.student.matricule],
          ["Classe", snapshot.class_name],
          ["Né(e) le", pdfDate(snapshot.student.birth_date, org.timezone, true)],
        ]}
      />
      <View style={{ marginTop: 12 }}>
        <DataTable
          color={org.primary_color}
          columns={[
            { label: "Matière", width: "42%" },
            { label: "Coef.", width: "12%", align: "center" },
            ...snapshot.periods.map((p) => ({ label: p, width, align: "center" as const })),
            ...(n > 1 ? [{ label: "Année", width, align: "center" as const }] : []),
          ]}
          rows={snapshot.subjects.map((s) => {
            const values = s.averages.filter((v): v is number => v !== null);
            const annual = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
            return [s.subject, String(s.coefficient).replace(".", ","), ...s.averages.map(fmt), ...(n > 1 ? [fmt(annual)] : [])];
          })}
          footer={["Moyenne générale", "", ...snapshot.averages.map(fmt), ...(n > 1 ? [fmt(snapshot.annual_average)] : [])]}
        />
      </View>
      {snapshot.ranks.some((r) => r !== null) ? (
        <Text style={{ marginTop: 8, color: COLORS.muted }}>
          {pdfText(`Rang : ${snapshot.periods.map((p, i) => `${p} ${snapshot.ranks[i] ?? "—"}`).join(" · ")}`)}
        </Text>
      ) : null}
      <View style={{ marginTop: 26 }}>
        <Signatures labels={[org.signatory_title ?? "Le chef d'établissement"]} organization={org} images={images} date={issuedAt} signatory={org.signatory_name} />
      </View>
      <DocFooter organization={org} verification={verification} />
    </Page>
  );
}
