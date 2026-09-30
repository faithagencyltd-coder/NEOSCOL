import { BadgePercent, Handshake, Pencil, Plus, Timer } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog, type QuickField } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { saveNegotiatedPrice, savePromo } from "@/features/platform/offer-actions";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Offres — Plateforme" };

type Promo = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  plan_codes: string[] | null;
  intervals: string[] | null;
  starts_at: string;
  ends_at: string | null;
  max_uses: number | null;
  auto_apply: boolean;
  is_active: boolean;
};

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
/** Offre terminée (date de fin dépassée). */
function isPast(iso: string | null) {
  return iso ? new Date(iso).getTime() < new Date().getTime() : false;
}

/**
 * Offres commerciales du Super Admin : codes promo, offres automatiques limitées
 * dans le temps et tarifs négociés par établissement. Calculs faits en base.
 */
export default async function PlatformOffersPage() {
  const supabase = await createClient();
  const [{ data: promos }, { data: redemptions }, { data: plans }, { data: orgs }, { data: negotiated }] = await Promise.all([
    supabase.from("promo_codes").select("*").order("created_at", { ascending: false }),
    supabase.from("promo_redemptions").select("promo_id, discount"),
    supabase.from("subscription_plans").select("code, name, monthly_price, annual_price, is_active").order("sort_order"),
    supabase.from("organizations").select("id, name, code").is("parent_id", null).order("name"),
    supabase.from("negotiated_prices").select("id, organization_id, plan_code, monthly_price, annual_price, note, valid_until, is_active, created_at, organization:organizations(name)").order("created_at", { ascending: false }),
  ]);
  const planOptions = (plans ?? []).map((p) => ({ value: p.code, label: p.name }));

  const promoFields = (p?: Promo): QuickField[] => [
    { name: "code", label: "Code (ce que le client saisit)", required: true, defaultValue: p?.code, placeholder: "RENTREE2026", hint: "Lettres majuscules, chiffres, tirets." },
    { name: "name", label: "Nom de l'offre", required: true, defaultValue: p?.name, placeholder: "Offre de rentrée" },
    { name: "discount_type", label: "Type de réduction", type: "select", defaultValue: p?.discount_type ?? "percent", options: [{ value: "percent", label: "Pourcentage (%)" }, { value: "amount", label: "Montant (F CFA)" }] },
    { name: "discount_value", label: "Valeur", type: "number", required: true, min: 1, defaultValue: p ? String(p.discount_value) : undefined, hint: "Ex. : 20 (%) ou 5000 (F CFA)." },
    { name: "plan_code", label: "Formule concernée", type: "select", defaultValue: p?.plan_codes?.[0] ?? "", options: [{ value: "", label: "Toutes les formules" }, ...planOptions] },
    { name: "interval", label: "Périodicité", type: "select", defaultValue: p?.intervals?.[0] ?? "", options: [{ value: "", label: "Mensuel et annuel" }, { value: "MONTHLY", label: "Mensuel uniquement" }, { value: "YEARLY", label: "Annuel uniquement" }] },
    { name: "starts_on", label: "Début", type: "date", defaultValue: day(p?.starts_at ?? null) },
    { name: "ends_on", label: "Fin (facultatif)", type: "date", defaultValue: day(p?.ends_at ?? null) },
    { name: "max_uses", label: "Utilisations maximum (facultatif)", type: "number", min: 1, defaultValue: p?.max_uses ? String(p.max_uses) : undefined, hint: "Vide = illimité. Chaque établissement ne peut l'utiliser qu'une fois." },
    { name: "description", label: "Description (affichée sur la page des tarifs)", type: "textarea", wide: true, defaultValue: p?.description ?? undefined },
    { name: "auto_apply", label: "Appliquer automatiquement, sans code (offre limitée dans le temps)", type: "checkbox", defaultValue: p?.auto_apply ? "true" : "false" },
    { name: "is_active", label: "Offre active", type: "checkbox", defaultValue: p ? (p.is_active ? "true" : "false") : "true" },
  ];

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="grid gap-1">
        <h2 className="text-2xl font-bold">Offres et réductions</h2>
        <p className="text-sm text-muted-foreground">
          Codes promo, offres automatiques limitées dans le temps et tarifs négociés pour un établissement. Les réductions sont calculées par le serveur au moment
          du paiement ; les factures déjà émises ne changent jamais. La durée de l&apos;essai gratuit se règle dans l&apos;onglet Formules.
        </p>
      </div>

      <Card className="overflow-hidden" data-testid="promo-list">
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle className="flex items-center gap-2">
              <BadgePercent className="size-5 text-primary" aria-hidden /> Codes promo et offres
            </CardTitle>
            <CardDescription>Une offre « automatique » s&apos;applique sans code pendant sa période et s&apos;affiche sur la page des tarifs.</CardDescription>
          </div>
          <QuickFormDialog
            title="Nouvelle offre"
            trigger={
              <Button>
                <Plus aria-hidden /> Nouvelle offre
              </Button>
            }
            action={savePromo}
            fields={promoFields()}
          />
        </CardHeader>
        {!promos?.length ? (
          <CardContent>
            <EmptyState icon={BadgePercent} title="Aucune offre" description="Créez un code promo ou une offre de rentrée." />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr className="border-t border-border">
                <TH>Code</TH>
                <TH>Réduction</TH>
                <TH>Formules</TH>
                <TH>Période</TH>
                <TH className="text-right">Utilisations</TH>
                <TH>État</TH>
                <TH className="text-right">Action</TH>
              </tr>
            </THead>
            <tbody>
              {(promos as Promo[]).map((p) => {
                const used = (redemptions ?? []).filter((r) => r.promo_id === p.id);
                const expired = isPast(p.ends_at);
                return (
                  <TR key={p.id}>
                    <TD>
                      <span className="grid">
                        <span className="font-mono text-sm font-semibold">{p.code}</span>
                        <span className="text-xs text-muted-foreground">{p.name}</span>
                      </span>
                    </TD>
                    <TD className="font-semibold">{p.discount_type === "percent" ? `- ${p.discount_value} %` : `- ${formatMoney(p.discount_value, "XOF")}`}</TD>
                    <TD className="text-sm">
                      {p.plan_codes?.length ? p.plan_codes.map((c) => plans?.find((pl) => pl.code === c)?.name ?? c).join(", ") : "Toutes"}
                      {p.intervals?.length ? ` · ${p.intervals[0] === "YEARLY" ? "annuel" : "mensuel"}` : ""}
                    </TD>
                    <TD className="text-sm">
                      {formatDate(p.starts_at)} → {p.ends_at ? formatDate(p.ends_at) : "sans fin"}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {used.length}
                      {p.max_uses ? ` / ${p.max_uses}` : ""}
                      <span className="block text-xs text-muted-foreground">{formatMoney(used.reduce((s, r) => s + r.discount, 0), "XOF")} accordés</span>
                    </TD>
                    <TD>
                      <span className="flex flex-wrap gap-1">
                        <Badge tone={!p.is_active ? "neutral" : expired ? "warning" : "success"}>{!p.is_active ? "Désactivée" : expired ? "Terminée" : "Active"}</Badge>
                        {p.auto_apply ? (
                          <Badge tone="info">
                            <Timer className="mr-1 size-3" aria-hidden /> Automatique
                          </Badge>
                        ) : null}
                      </span>
                    </TD>
                    <TD className="text-right">
                      <QuickFormDialog
                        title={`Modifier l'offre ${p.code}`}
                        trigger={
                          <Button size="sm" variant="secondary">
                            <Pencil aria-hidden /> Modifier
                          </Button>
                        }
                        action={savePromo}
                        hidden={{ id: p.id }}
                        fields={promoFields(p)}
                      />
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="overflow-hidden" data-testid="negotiated-list">
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle className="flex items-center gap-2">
              <Handshake className="size-5 text-primary" aria-hidden /> Tarifs négociés
            </CardTitle>
            <CardDescription>Prix propre à un établissement (gros client, partenaire). Il s&apos;applique à ses prochaines factures ; l&apos;historique est conservé.</CardDescription>
          </div>
          <QuickFormDialog
            title="Tarif négocié"
            trigger={
              <Button>
                <Plus aria-hidden /> Nouveau tarif négocié
              </Button>
            }
            action={saveNegotiatedPrice}
            fields={[
              { name: "organization_id", label: "Établissement", type: "select", required: true, options: (orgs ?? []).map((o) => ({ value: o.id, label: `${o.name} (${o.code})` })) },
              { name: "plan_code", label: "Formule", type: "select", required: true, options: planOptions },
              { name: "monthly_price", label: "Prix mensuel négocié (F CFA)", type: "number", required: true, min: 100 },
              { name: "annual_price", label: "Prix annuel négocié (F CFA)", type: "number", required: true, min: 100 },
              { name: "valid_until", label: "Valable jusqu'au (facultatif)", type: "date" },
              { name: "note", label: "Note interne", type: "textarea", wide: true },
            ]}
          />
        </CardHeader>
        {!negotiated?.length ? (
          <CardContent>
            <EmptyState icon={Handshake} title="Aucun tarif négocié" />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr className="border-t border-border">
                <TH>Établissement</TH>
                <TH>Formule</TH>
                <TH className="text-right">Mensuel</TH>
                <TH className="text-right">Annuel</TH>
                <TH>Validité</TH>
                <TH>État</TH>
                <TH className="text-right">Action</TH>
              </tr>
            </THead>
            <tbody>
              {negotiated.map((n) => (
                <TR key={n.id}>
                  <TD>
                    <span className="grid">
                      <span className="font-medium">{n.organization?.name ?? "—"}</span>
                      {n.note ? <span className="text-xs text-muted-foreground">{n.note}</span> : null}
                    </span>
                  </TD>
                  <TD>{plans?.find((p) => p.code === n.plan_code)?.name ?? n.plan_code}</TD>
                  <TD className="text-right tabular-nums">{formatMoney(n.monthly_price, "XOF")}</TD>
                  <TD className="text-right tabular-nums">{formatMoney(n.annual_price, "XOF")}</TD>
                  <TD className="text-sm">{n.valid_until ? `jusqu'au ${formatDate(n.valid_until)}` : "sans limite"}</TD>
                  <TD>
                    <Badge tone={n.is_active ? "success" : "neutral"}>{n.is_active ? "En vigueur" : "Historique"}</Badge>
                  </TD>
                  <TD className="text-right">
                    {n.is_active ? (
                      <QuickFormDialog
                        title="Retirer ce tarif négocié ?"
                        description="Les prochaines factures reviennent au prix normal. Ce tarif reste dans l'historique."
                        submitLabel="Retirer"
                        trigger={
                          <Button size="sm" variant="secondary">
                            Retirer
                          </Button>
                        }
                        action={saveNegotiatedPrice}
                        hidden={{ organization_id: n.organization_id, plan_code: n.plan_code, remove: "true" }}
                        fields={[]}
                      />
                    ) : null}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
