import { Page, Text, View } from "@react-pdf/renderer";

import { pdfText } from "@/lib/pdf/format";

import { COLORS } from "./common";

export type SubscriptionInvoiceData = {
  invoice_number: string;
  status: string;
  status_label: string;
  issued_at: string;
  due_at: string;
  paid_at: string | null;
  plan_name: string;
  interval_label: string;
  period: string;
  list_amount: string;
  discount: string | null;
  total: string;
  currency: string;
  payment_method: string | null;
  transaction_reference: string | null;
  test_mode: boolean;
  organization: { name: string; code: string; address: string | null; city: string | null; country: string | null; email: string | null; phone: string | null };
};

const NAVY = "#0B1F3A";
const BLUE = "#1D63ED";

/** Facture d'abonnement NéoScol (SYSTÈME A) — émise par NéoScol à l'établissement. */
export function SubscriptionInvoicePage({ data }: { data: SubscriptionInvoiceData }) {
  const row = (label: string, value: string | null) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
      <Text style={{ color: COLORS.muted }}>{label}</Text>
      <Text style={{ fontFamily: "Helvetica-Bold" }}>{pdfText(value ?? "—")}</Text>
    </View>
  );
  const paid = data.status === "PAID";
  return (
    <Page size="A4" style={{ padding: 40, fontFamily: "Helvetica", fontSize: 10, color: COLORS.ink }}>
      {data.test_mode ? (
        <Text style={{ position: "absolute", top: 14, right: 40, fontSize: 8, color: COLORS.danger }}>MODE TEST — AUCUN PAIEMENT RÉEL</Text>
      ) : null}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 24, color: NAVY }}>
            Néo<Text style={{ color: BLUE }}>Scol</Text>
          </Text>
          <Text style={{ fontSize: 9, color: COLORS.muted, marginTop: 2 }}>Logiciel de gestion scolaire</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 16, color: NAVY }}>FACTURE</Text>
          <Text style={{ fontSize: 11, marginTop: 2 }}>{data.invoice_number}</Text>
          <Text style={{ marginTop: 6, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 4, fontFamily: "Helvetica-Bold", fontSize: 9,
            color: "#FFFFFF", backgroundColor: paid ? "#15803D" : data.status === "PENDING" ? "#B45309" : "#64748B" }}>
            {pdfText(data.status_label.toUpperCase())}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 16, marginTop: 28 }}>
        <View style={{ flex: 1, backgroundColor: COLORS.soft, borderRadius: 8, padding: 12 }}>
          <Text style={{ fontSize: 8, color: COLORS.muted, marginBottom: 4 }}>FACTURÉ À</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12 }}>{pdfText(data.organization.name)}</Text>
          <Text style={{ color: COLORS.muted }}>Code établissement : {data.organization.code}</Text>
          {data.organization.address ? <Text>{pdfText(data.organization.address)}</Text> : null}
          <Text>{pdfText([data.organization.city, data.organization.country].filter(Boolean).join(", "))}</Text>
          {data.organization.email ? <Text>{pdfText(data.organization.email)}</Text> : null}
          {data.organization.phone ? <Text>{pdfText(data.organization.phone)}</Text> : null}
        </View>
        <View style={{ flex: 1, padding: 12 }}>
          {row("Date d'émission", data.issued_at)}
          {row("Échéance", data.due_at)}
          {row("Date de paiement", data.paid_at)}
          {row("Référence transaction", data.transaction_reference)}
        </View>
      </View>

      <View style={{ marginTop: 28 }}>
        <View style={{ flexDirection: "row", backgroundColor: NAVY, borderTopLeftRadius: 6, borderTopRightRadius: 6, padding: 8 }}>
          <Text style={{ flex: 3, color: "#FFFFFF", fontFamily: "Helvetica-Bold" }}>Désignation</Text>
          <Text style={{ flex: 2, color: "#FFFFFF", fontFamily: "Helvetica-Bold" }}>Période</Text>
          <Text style={{ flex: 1.4, color: "#FFFFFF", fontFamily: "Helvetica-Bold", textAlign: "right" }}>Montant</Text>
        </View>
        <View style={{ flexDirection: "row", padding: 8, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
          <View style={{ flex: 3 }}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>Abonnement NéoScol — {pdfText(data.plan_name)}</Text>
            <Text style={{ color: COLORS.muted, fontSize: 9 }}>Périodicité : {pdfText(data.interval_label)}</Text>
          </View>
          <Text style={{ flex: 2 }}>{pdfText(data.period)}</Text>
          <Text style={{ flex: 1.4, textAlign: "right" }}>{pdfText(data.list_amount)}</Text>
        </View>
        {data.discount ? (
          <View style={{ flexDirection: "row", padding: 8, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
            <Text style={{ flex: 5, color: "#15803D" }}>Réduction paiement annuel (-30 %)</Text>
            <Text style={{ flex: 1.4, textAlign: "right", color: "#15803D" }}>- {pdfText(data.discount)}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 10 }}>
          <View style={{ width: 220, backgroundColor: COLORS.soft, borderRadius: 6, padding: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12 }}>TOTAL</Text>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12 }}>{pdfText(data.total)}</Text>
            </View>
            <Text style={{ fontSize: 8, color: COLORS.muted, marginTop: 3 }}>Devise : {data.currency} (F CFA)</Text>
            {data.payment_method ? <Text style={{ fontSize: 8, color: COLORS.muted }}>Moyen de paiement : {pdfText(data.payment_method)}</Text> : null}
          </View>
        </View>
      </View>

      <View style={{ position: "absolute", bottom: 30, left: 40, right: 40, borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 8 }}>
        <Text style={{ fontSize: 8, color: COLORS.muted, textAlign: "center" }}>
          Facture d&apos;abonnement au logiciel NéoScol. Distincte des factures de scolarité émises par l&apos;établissement à ses familles.
        </Text>
      </View>
    </Page>
  );
}
