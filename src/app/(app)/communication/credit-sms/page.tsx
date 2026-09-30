import { MessageSquareText, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { BuyCreditForm } from "@/features/sms/components/buy-credit-form";
import { requireOrganization } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney } from "@/lib/utils/format";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Crédit SMS" };

type Quote = { billing_enabled: boolean; included_in_plan: boolean; unit_price: number; currency: string; min_purchase: number; balance: number };

const REASON: Record<string, string> = { purchase: "Achat", send: "Envoi", refund: "Recrédit (non délivré)", grant: "Offert par NeoScool", adjustment: "Correction NeoScool" };
const PURCHASE_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  SUCCESS: { label: "Payé", tone: "success" },
  PROCESSING: { label: "En attente", tone: "warning" },
  PENDING: { label: "En attente", tone: "warning" },
  FAILED: { label: "Échoué", tone: "danger" },
  CANCELLED: { label: "Annulé", tone: "neutral" },
};

/**
 * Crédit SMS de l'établissement : prix d'un SMS fixé par NeoScool, crédit
 * restant, achat (même paiement que l'abonnement) et historique des mouvements.
 */
export default async function SmsCreditPage({ searchParams }: PageProps<"/communication/credit-sms">) {
  const context = await requireOrganization();
  if (!can(context, "communication.send") && !can(context, "billing.manage")) notFound();
  const orgId = context.organization.id;
  const missing = Number(param(await searchParams, "manque") ?? 0) || 0;
  const supabase = await createClient();
  const [{ data: quote }, { data: movements }, { data: purchases }] = await Promise.all([
    supabase.rpc("sms_quote", { p_org: orgId, p_sms: 0 }),
    supabase.from("sms_wallet_movements").select("id, delta, balance_after, reason, reference, note, created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(30),
    can(context, "billing.manage")
      ? supabase.from("sms_credit_purchases").select("id, internal_reference, sms_count, amount, currency, status, created_at, paid_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [] }),
  ]);
  const q = quote as unknown as Quote;
  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader title="Crédit SMS" description="Chaque SMS envoyé consomme du crédit. Le prix d'un SMS est fixé par NeoScool ; un SMS long compte pour plusieurs SMS." />
      {!q.included_in_plan ? (
        <Alert tone="warning" title="SMS non inclus dans votre formule">
          Votre formule ne comprend pas l&apos;envoi de SMS. Changez de formule dans « Mon abonnement » pour envoyer des SMS.
        </Alert>
      ) : !q.billing_enabled ? (
        <Alert tone="info" title="SMS non facturés actuellement">
          NeoScool ne facture pas les SMS pour le moment : vos envois ne consomment pas de crédit.
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Crédit restant" value={`${q.balance} SMS`} icon={Wallet} />
        <StatCard label="Prix d'un SMS" value={formatMoney(q.unit_price, q.currency)} icon={MessageSquareText} />
        <StatCard label="Valeur du crédit" value={formatMoney(q.balance * q.unit_price, q.currency)} icon={Wallet} />
      </div>
      {q.billing_enabled && q.included_in_plan && can(context, "billing.manage") ? (
        <Card>
          <CardHeader>
            <CardTitle>Acheter du crédit</CardTitle>
            <CardDescription>
              {missing > 0 ? `Il manque ${missing} SMS pour votre envoi. ` : ""}Paiement sécurisé par le même moyen que votre abonnement ; le crédit est ajouté dès la
              confirmation du paiement.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BuyCreditForm unitPrice={q.unit_price} currency={q.currency} minPurchase={q.min_purchase} suggested={missing} />
          </CardContent>
        </Card>
      ) : null}
      {(purchases ?? []).length ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Achats</CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Référence</TH>
                <TH>SMS</TH>
                <TH>Montant</TH>
                <TH>État</TH>
              </TR>
            </THead>
            <tbody>
              {(purchases ?? []).map((p) => (
                <TR key={p.id}>
                  <TD>{formatDateTime(p.paid_at ?? p.created_at)}</TD>
                  <TD className="font-mono text-xs">{p.internal_reference}</TD>
                  <TD className="tabular-nums">{p.sms_count}</TD>
                  <TD className="tabular-nums">{formatMoney(p.amount, p.currency)}</TD>
                  <TD>
                    <Badge tone={PURCHASE_STATUS[p.status]?.tone ?? "neutral"}>{PURCHASE_STATUS[p.status]?.label ?? p.status}</Badge>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Mouvements du crédit</CardTitle>
        </CardHeader>
        {(movements ?? []).length === 0 ? (
          <EmptyState icon={Wallet} title="Aucun mouvement" description="Les achats, envois et recrédits apparaîtront ici." />
        ) : (
          <Table data-testid="sms-movements">
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Mouvement</TH>
                <TH>SMS</TH>
                <TH>Crédit après</TH>
              </TR>
            </THead>
            <tbody>
              {(movements ?? []).map((m) => (
                <TR key={m.id}>
                  <TD>{formatDateTime(m.created_at)}</TD>
                  <TD>
                    {REASON[m.reason] ?? m.reason}
                    {m.note ? <span className="block text-xs text-muted-foreground">{m.note}</span> : null}
                  </TD>
                  <TD className={m.delta > 0 ? "tabular-nums text-success" : "tabular-nums"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</TD>
                  <TD className="tabular-nums">{m.balance_after}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
