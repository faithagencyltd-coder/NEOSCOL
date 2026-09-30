import { Gift, MessageSquareText, Tag, TrendingUp, Wallet } from "lucide-react";
import type { Metadata } from "next";

import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { adjustSmsCredit, saveSmsPricing, setCountrySmsPrice, setOrgSmsPrice } from "@/features/platform/sms-actions";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney } from "@/lib/utils/format";

export const metadata: Metadata = { title: "SMS — Plateforme" };

/**
 * SMS payants : le Super Admin fixe le prix d'un SMS (par défaut, par pays, par
 * établissement), active la facturation, suit les ventes et le crédit de chaque
 * établissement, et peut offrir ou retirer des SMS (motif tracé).
 */
export default async function PlatformSmsPage() {
  const supabase = await createClient();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const [{ data: pricing }, { data: countries }, { data: countryPrices }, { data: orgPrices }, { data: orgs }, { data: wallets }, { data: purchases }, { data: sends }, { data: history }] =
    await Promise.all([
      supabase.from("platform_sms_pricing").select("*").eq("id", 1).single(),
      supabase.from("countries").select("code, name").order("name"),
      supabase.from("sms_country_prices").select("country_code, price"),
      supabase.from("sms_org_prices").select("organization_id, price, note"),
      supabase.from("organizations").select("id, name, country").eq("status", "active").order("name"),
      supabase.from("sms_wallets").select("organization_id, balance, updated_at"),
      supabase.from("sms_credit_purchases").select("id, organization_id, internal_reference, sms_count, amount, currency, status, paid_at, created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("sms_wallet_movements").select("delta").eq("reason", "send").gte("created_at", monthStart),
      supabase.from("sms_price_history").select("id, scope, target, old_price, new_price, changed_at").order("changed_at", { ascending: false }).limit(10),
    ]);
  const currency = pricing?.currency ?? "XOF";
  const orgName = (id: string) => (orgs ?? []).find((o) => o.id === id)?.name ?? "Établissement";
  const paid = (purchases ?? []).filter((p) => p.status === "SUCCESS");
  const paidThisMonth = paid.filter((p) => (p.paid_at ?? p.created_at) >= monthStart);
  const priceOf = (code: string) => (countryPrices ?? []).find((c) => c.country_code === code)?.price ?? null;
  const orgOptions = (orgs ?? []).map((o) => ({ value: o.id, label: o.name }));

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="grid gap-1">
        <h2 className="text-2xl font-bold">SMS</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Fixez le prix d&apos;un SMS. Avant chaque envoi, l&apos;établissement voit le nombre de SMS × le prix ; il achète du crédit avec le même paiement que
          l&apos;abonnement, et chaque SMS envoyé consomme ce crédit. Un changement de prix ne touche jamais le crédit déjà acheté.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Facturation" value={pricing?.billing_enabled ? "Active" : "Inactive"} icon={Tag} />
        <StatCard label="Prix par défaut d'un SMS" value={formatMoney(pricing?.default_price ?? 0, currency)} icon={MessageSquareText} />
        <StatCard label="Ventes du mois" value={formatMoney(paidThisMonth.reduce((s, p) => s + p.amount, 0), currency)} hint={`${paidThisMonth.reduce((s, p) => s + p.sms_count, 0)} SMS vendus`} icon={TrendingUp} />
        <StatCard label="SMS envoyés ce mois" value={String(-(sends ?? []).reduce((s, m) => s + m.delta, 0))} icon={Wallet} />
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>Réglages</CardTitle>
            <CardDescription>
              {pricing?.billing_enabled ? "Les SMS des établissements consomment leur crédit." : "Les SMS ne sont pas facturés : aucun crédit n'est décompté."} Achat minimum :{" "}
              {pricing?.min_purchase ?? 0} SMS.
            </CardDescription>
          </div>
          <QuickFormDialog
            title="Réglages des SMS"
            description="Prix par défaut d'un SMS (si aucun prix de pays ou d'établissement ne s'applique), achat minimum et activation de la facturation."
            trigger={
              <Button size="sm" data-testid="sms-settings">
                <Tag aria-hidden /> Modifier
              </Button>
            }
            action={saveSmsPricing}
            fields={[
              { name: "default_price", label: `Prix d'un SMS (${currency})`, type: "number", required: true, min: 1, defaultValue: String(pricing?.default_price ?? 25) },
              { name: "min_purchase", label: "Achat minimum (SMS)", type: "number", required: true, min: 1, defaultValue: String(pricing?.min_purchase ?? 100) },
              { name: "billing_enabled", label: "Facturer les SMS aux établissements", type: "checkbox", defaultValue: pricing?.billing_enabled ? "true" : "" },
            ]}
          />
        </CardHeader>
        {(history ?? []).length ? (
          <CardContent>
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Historique des prix</summary>
              <ul className="mt-2 grid gap-1 text-muted-foreground">
                {(history ?? []).map((h) => (
                  <li key={h.id}>
                    {formatDateTime(h.changed_at)} — {h.scope === "default" ? "Prix par défaut" : h.scope === "country" ? `Pays ${h.target}` : orgName(h.target ?? "")} :{" "}
                    {h.old_price ?? "—"} → {h.new_price ?? "prix par défaut"}
                  </li>
                ))}
              </ul>
            </details>
          </CardContent>
        ) : null}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Prix par pays</CardTitle>
            <CardDescription>Sans prix de pays, le prix par défaut s&apos;applique.</CardDescription>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Pays</TH>
                <TH>Prix d&apos;un SMS</TH>
                <TH />
              </TR>
            </THead>
            <tbody>
              {(countries ?? []).map((c) => (
                <TR key={c.code}>
                  <TD>{c.name}</TD>
                  <TD className="tabular-nums">{priceOf(c.code) === null ? <span className="text-muted-foreground">Par défaut</span> : formatMoney(priceOf(c.code)!, currency)}</TD>
                  <TD className="text-right">
                    <QuickFormDialog
                      title={`Prix d'un SMS — ${c.name}`}
                      description="Laissez vide pour revenir au prix par défaut."
                      trigger={
                        <Button size="sm" variant="ghost">
                          Modifier
                        </Button>
                      }
                      action={setCountrySmsPrice}
                      hidden={{ country: c.code }}
                      fields={[{ name: "price", label: `Prix (${currency})`, type: "number", min: 1, defaultValue: priceOf(c.code)?.toString() ?? "" }]}
                    />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
              <CardTitle>Prix particuliers</CardTitle>
              <CardDescription>Un prix négocié pour un établissement prime sur le prix du pays.</CardDescription>
            </div>
            <QuickFormDialog
              title="Prix particulier d'un SMS"
              triggerLabel="Ajouter"
              action={setOrgSmsPrice}
              fields={[
                { name: "organization_id", label: "Établissement", type: "select", required: true, options: orgOptions },
                { name: "price", label: `Prix d'un SMS (${currency})`, type: "number", required: true, min: 1 },
                { name: "note", label: "Note", wide: true },
              ]}
            />
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Établissement</TH>
                <TH>Prix</TH>
                <TH />
              </TR>
            </THead>
            <tbody>
              {(orgPrices ?? []).length === 0 ? (
                <TR>
                  <TD colSpan={3} className="text-muted-foreground">
                    Aucun prix particulier.
                  </TD>
                </TR>
              ) : (
                (orgPrices ?? []).map((p) => (
                  <TR key={p.organization_id}>
                    <TD>
                      {orgName(p.organization_id)}
                      {p.note ? <span className="block text-xs text-muted-foreground">{p.note}</span> : null}
                    </TD>
                    <TD className="tabular-nums">{formatMoney(p.price, currency)}</TD>
                    <TD className="text-right">
                      <QuickFormDialog
                        title={`Prix particulier — ${orgName(p.organization_id)}`}
                        description="Laissez vide pour retirer le prix particulier."
                        trigger={
                          <Button size="sm" variant="ghost">
                            Modifier
                          </Button>
                        }
                        action={setOrgSmsPrice}
                        hidden={{ organization_id: p.organization_id }}
                        fields={[
                          { name: "price", label: `Prix (${currency})`, type: "number", min: 1, defaultValue: String(p.price) },
                          { name: "note", label: "Note", defaultValue: p.note ?? "", wide: true },
                        ]}
                      />
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>Crédit des établissements</CardTitle>
            <CardDescription>Crédit restant, total acheté ; offrez ou retirez des SMS avec un motif (tracé dans le journal).</CardDescription>
          </div>
          <QuickFormDialog
            title="Offrir ou retirer des SMS"
            description="Nombre positif pour offrir, négatif pour retirer. Le crédit ne peut jamais devenir négatif."
            trigger={
              <Button size="sm" variant="secondary">
                <Gift aria-hidden /> Offrir / retirer
              </Button>
            }
            action={adjustSmsCredit}
            fields={[
              { name: "organization_id", label: "Établissement", type: "select", required: true, options: orgOptions },
              { name: "delta", label: "Nombre de SMS (+ ou −)", type: "number", required: true },
              { name: "reason", label: "Motif", required: true, wide: true },
            ]}
          />
        </CardHeader>
        <Table data-testid="sms-wallets">
          <THead>
            <TR>
              <TH>Établissement</TH>
              <TH>Crédit restant</TH>
              <TH>Total acheté</TH>
              <TH>Montant payé</TH>
            </TR>
          </THead>
          <tbody>
            {(orgs ?? [])
              .map((o) => ({
                org: o,
                balance: (wallets ?? []).find((w) => w.organization_id === o.id)?.balance ?? 0,
                bought: paid.filter((p) => p.organization_id === o.id),
              }))
              .filter((r) => r.balance > 0 || r.bought.length > 0)
              .map((r) => (
                <TR key={r.org.id}>
                  <TD>{r.org.name}</TD>
                  <TD className="tabular-nums">{r.balance} SMS</TD>
                  <TD className="tabular-nums">{r.bought.reduce((s, p) => s + p.sms_count, 0)} SMS</TD>
                  <TD className="tabular-nums">{formatMoney(r.bought.reduce((s, p) => s + p.amount, 0), currency)}</TD>
                </TR>
              ))}
          </tbody>
        </Table>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Derniers achats</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Établissement</TH>
              <TH>Référence</TH>
              <TH>SMS</TH>
              <TH>Montant</TH>
              <TH>État</TH>
            </TR>
          </THead>
          <tbody>
            {(purchases ?? []).slice(0, 30).map((p) => (
              <TR key={p.id}>
                <TD>{formatDateTime(p.paid_at ?? p.created_at)}</TD>
                <TD>{orgName(p.organization_id)}</TD>
                <TD className="font-mono text-xs">{p.internal_reference}</TD>
                <TD className="tabular-nums">{p.sms_count}</TD>
                <TD className="tabular-nums">{formatMoney(p.amount, p.currency)}</TD>
                <TD>
                  <Badge tone={p.status === "SUCCESS" ? "success" : p.status === "FAILED" ? "danger" : p.status === "CANCELLED" ? "neutral" : "warning"}>
                    {p.status === "SUCCESS" ? "Payé" : p.status === "FAILED" ? "Échoué" : p.status === "CANCELLED" ? "Annulé" : "En attente"}
                  </Badge>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
