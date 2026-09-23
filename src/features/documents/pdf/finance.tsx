import { Page, Text, View } from "@react-pdf/renderer";

import { PAYMENT_METHOD } from "@/lib/labels";
import { pdfDate, pdfDateTime, pdfMoney, pdfNumber, pdfText } from "@/lib/pdf/format";

import type { DocImages, InvoiceSnapshot, ReceiptSnapshot, Verification } from "../types";
import { COLORS, DataTable, DemoMark, DocFooter, DocHeader, DocTitle, InfoGrid, Signatures, styles, Watermark } from "./common";

export function ReceiptPage({ snapshot, images, verification, issuedAt }: { snapshot: ReceiptSnapshot; images: DocImages; verification: Verification | null; issuedAt: string }) {
  const { organization: org, payment, student } = snapshot;
  const currency = org.currency;
  return (
    <Page size="A5" orientation="landscape" style={[styles.page, { paddingBottom: 58 }]}>
      <DemoMark organization={org} />
      {payment.status === "cancelled" ? <Watermark text="ANNULÉ" /> : null}
      <DocHeader
        organization={org}
        images={images}
        right={
          <>
            <Text style={[styles.bold, { color: org.primary_color }]}>{payment.number}</Text>
            <Text style={styles.small}>{pdfDateTime(payment.paid_at, org.timezone)}</Text>
          </>
        }
      />
      <DocTitle color={org.primary_color}>REÇU DE PAIEMENT</DocTitle>
      <InfoGrid
        rows={[
          ["Élève", `${student.last_name} ${student.first_name}`],
          ["Matricule", student.matricule],
          ["Classe", snapshot.class_name],
          ["Facture", snapshot.invoice.number],
          ["Versé par", payment.payer_name],
          ["Mode de paiement", `${PAYMENT_METHOD[payment.method] ?? payment.method}${payment.reference ? ` — réf. ${payment.reference}` : ""}`],
        ]}
      />
      <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
        <View style={[styles.box, { flex: 1.3, borderLeftWidth: 3, borderLeftColor: org.accent_color }]}>
          <Text style={{ color: COLORS.muted }}>Montant reçu</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 18, color: org.primary_color }}>{pdfMoney(payment.amount, currency)}</Text>
        </View>
        <View style={[styles.box, { flex: 1 }]}>
          <Text style={{ color: COLORS.muted }}>Total de la facture</Text>
          <Text style={styles.bold}>{pdfMoney(snapshot.invoice.total, currency)}</Text>
          <Text style={{ color: COLORS.muted, marginTop: 3 }}>Reste à payer après ce versement</Text>
          <Text style={styles.bold}>{pdfMoney(payment.balance_after ?? 0, currency)}</Text>
        </View>
      </View>
      <Signatures labels={[`Reçu par ${payment.received_by_name ?? "la caisse"}`]} organization={org} images={images} date={issuedAt} showStamp />
      <DocFooter organization={org} verification={verification} />
    </Page>
  );
}

export function InvoicePage({ snapshot, images, verification, issuedAt }: { snapshot: InvoiceSnapshot; images: DocImages; verification: Verification | null; issuedAt: string }) {
  const { organization: org, invoice, student } = snapshot;
  const currency = org.currency;
  return (
    <Page size="A4" style={styles.page}>
      <DemoMark organization={org} />
      {invoice.status === "cancelled" ? <Watermark text="ANNULÉE" /> : invoice.status === "draft" ? <Watermark text="BROUILLON" /> : null}
      <DocHeader
        organization={org}
        images={images}
        right={
          <>
            <Text style={[styles.bold, { color: org.primary_color }]}>{invoice.number}</Text>
            <Text style={styles.small}>Émise le {pdfDate(invoice.issued_on)}</Text>
            {invoice.due_on ? <Text style={styles.small}>Échéance finale : {pdfDate(invoice.due_on)}</Text> : null}
          </>
        }
      />
      <DocTitle color={org.primary_color}>FACTURE</DocTitle>
      <InfoGrid
        rows={[
          ["Élève", `${student.last_name} ${student.first_name}`],
          ["Matricule", student.matricule],
          ["Classe", snapshot.class_name],
          ["Responsable", snapshot.guardian],
        ]}
      />
      <Text style={styles.sectionTitle}>Détail</Text>
      <DataTable
        color={org.primary_color}
        columns={[
          { label: "Désignation", width: "46%" },
          { label: "Qté", width: "8%", align: "center" },
          { label: "Prix unitaire", width: "16%", align: "right" },
          { label: "Remise", width: "14%", align: "right" },
          { label: "Montant", width: "16%", align: "right" },
        ]}
        rows={invoice.lines.map((l) => [
          l.description,
          pdfNumber(l.quantity, 0),
          pdfMoney(l.unit_amount, currency),
          l.discount_amount ? pdfMoney(l.discount_amount, currency) : "—",
          pdfMoney(l.amount, currency),
        ])}
        footer={["Total", "", "", invoice.discount_total ? pdfMoney(invoice.discount_total, currency) : "", pdfMoney(invoice.total, currency)]}
      />
      {invoice.installments.length ? (
        <>
          <Text style={styles.sectionTitle}>Échéancier</Text>
          <DataTable
            color={org.accent_color}
            columns={[
              { label: "Échéance", width: "50%" },
              { label: "Date limite", width: "25%", align: "center" },
              { label: "Montant", width: "25%", align: "right" },
            ]}
            rows={invoice.installments.map((i) => [i.label, pdfDate(i.due_on), pdfMoney(i.amount, currency)])}
          />
        </>
      ) : null}
      {invoice.payments.length ? (
        <>
          <Text style={styles.sectionTitle}>Paiements reçus</Text>
          <DataTable
            color={COLORS.navy}
            columns={[
              { label: "Reçu", width: "30%" },
              { label: "Date", width: "25%", align: "center" },
              { label: "Mode", width: "20%" },
              { label: "Montant", width: "25%", align: "right" },
            ]}
            rows={invoice.payments.map((p) => [p.number, pdfDateTime(p.paid_at, org.timezone), PAYMENT_METHOD[p.method] ?? p.method, pdfMoney(p.amount, currency)])}
          />
        </>
      ) : null}
      <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 10 }} wrap={false}>
        <View style={[styles.box, { width: "48%" }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text>Total</Text>
            <Text style={styles.bold}>{pdfMoney(invoice.total, currency)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text>Déjà payé</Text>
            <Text style={styles.bold}>{pdfMoney(invoice.paid, currency)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 3, borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 3 }}>
            <Text style={styles.bold}>Reste dû</Text>
            <Text style={[styles.bold, { color: invoice.balance > 0 ? COLORS.danger : org.primary_color }]}>{pdfMoney(invoice.balance, currency)}</Text>
          </View>
        </View>
      </View>
      <Signatures labels={["La comptabilité"]} organization={org} images={images} date={issuedAt} />
      <Text style={[styles.small, { marginTop: 4 }]}>{pdfText("Merci de mentionner le numéro de facture et le matricule de l'élève lors de chaque paiement.")}</Text>
      <DocFooter organization={org} verification={verification} />
    </Page>
  );
}
