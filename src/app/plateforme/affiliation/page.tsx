import { Download, HandCoins, Megaphone, Plus, Wallet } from "lucide-react";
import type { Metadata } from "next";

import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { TabNav } from "@/components/shared/tab-nav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  correctAttribution,
  recordAffiliatePayout,
  reviewAffiliate,
  reviewCommission,
  saveAffiliateCampaign,
  saveAffiliateSettings,
} from "@/features/affiliates/actions";
import { AFFILIATE_KINDS, AFFILIATE_STATUS, ATTRIBUTION_FLAGS, ATTRIBUTION_SOURCES, COMMISSION_STATUS, PAYOUT_METHODS, rewardText } from "@/features/affiliates/constants";
import { Bars, Empty, Kpi, Panel } from "@/features/analytics/charts";
import { InlineForm } from "@/features/ecosystem/components/inline-form";
import { canWritePlatform, getPlatformRole } from "@/lib/auth/platform";
import { createClient } from "@/lib/supabase/server";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Affiliation — Console" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "vue", label: "Vue d'ensemble" },
  { key: "affilies", label: "Affiliés" },
  { key: "attributions", label: "Établissements recommandés" },
  { key: "commissions", label: "Commissions" },
  { key: "versements", label: "Versements" },
  { key: "campagnes", label: "Campagnes" },
  { key: "reglages", label: "Réglages" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const money = (v: number, c = "XOF") => `${v.toLocaleString("fr-FR")} ${c === "XOF" ? "FCFA" : c}`;
const day = (d: string) => new Date(d).toLocaleDateString("fr-FR");
const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));
const fullName = (p: { first_name: string | null; last_name: string | null; email: string | null } | null) =>
  [p?.first_name, p?.last_name].filter(Boolean).join(" ") || p?.email || "—";
const REWARD_TYPES = { percent: "Pourcentage du paiement", fixed: "Montant fixe" };
const REWARD_EVENTS = { first_payment: "Premier paiement de l'établissement", each_payment: "Chaque paiement pendant la période de récompense" };
const CONFLICT_RULES = { code_first: "Le code saisi à l'inscription passe avant le lien", first_click: "Premier lien cliqué", last_click: "Dernier lien cliqué" };

/** Console › Affiliation : affiliés, écoles recommandées, commissions, versements, campagnes, réglages. */
export default async function AffiliationConsolePage({ searchParams }: PageProps<"/plateforme/affiliation">) {
  const sp = await searchParams;
  const requested = param(sp, "onglet");
  const tab: Tab = TABS.find((t) => t.key === requested)?.key ?? "vue";
  const writable = canWritePlatform(await getPlatformRole());
  const supabase = await createClient();
  // Commissions validées dont le délai de vérification est écoulé → payables.
  if (writable) await supabase.rpc("affiliate_promote_payable");
  const { data: settings } = await supabase.from("affiliate_settings").select("*").eq("id", 1).maybeSingle();
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Megaphone className="size-6 text-primary" aria-hidden /> NEOSCOOL Affiliates
          </h1>
          <p className="text-sm text-muted-foreground">
            Programme de recommandation d&apos;établissements. Commissions calculées uniquement sur des paiements d&apos;abonnement confirmés ; versements enregistrés avec leur référence réelle.
          </p>
        </div>
        <StatusBadge value={settings?.enabled ? "on" : "off"} map={{ on: { label: "Programme actif", tone: "success" }, off: { label: "Programme inactif", tone: "neutral" } }} />
      </div>
      <TabNav label="Affiliation" active={tab} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/plateforme/affiliation?onglet=${t.key}` }))} />
      {tab === "vue" ? <OverviewTab /> : null}
      {tab === "affilies" ? <AffiliatesTab writable={writable} /> : null}
      {tab === "attributions" ? <AttributionsTab writable={writable} /> : null}
      {tab === "commissions" ? <CommissionsTab writable={writable} status={param(sp, "statut")} /> : null}
      {tab === "versements" ? <PayoutsTab writable={writable} minPayout={settings?.min_payout ?? 0} /> : null}
      {tab === "campagnes" ? <CampaignsTab writable={writable} enabled={Boolean(settings?.campaigns_enabled)} /> : null}
      {tab === "reglages" && settings ? <SettingsTab writable={writable} s={settings} /> : null}
    </div>
  );
}

async function OverviewTab() {
  const { data } = await (await createClient()).rpc("platform_affiliate_overview");
  const o = data as {
    affiliates: Record<string, number> | null;
    clicks_30d: number;
    referrals: number;
    converted: number;
    flagged: number;
    disputes: number;
    commissions: Record<string, { n: number; amount: number }> | null;
    paid_total: number;
    top: { code: string; name: string; referrals: number; commissions: number }[];
  } | null;
  if (!o) return <Empty>Statistiques indisponibles.</Empty>;
  const c = o.commissions ?? {};
  const sum = (keys: string[]) => keys.reduce((t, k) => t + (c[k]?.amount ?? 0), 0);
  return (
    <div className="grid gap-4" data-testid="affiliate-overview">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Affiliés approuvés" value={String(o.affiliates?.approved ?? 0)} hint={`${o.affiliates?.pending ?? 0} demande(s) en attente`} />
        <Kpi label="Établissements recommandés" value={String(o.referrals)} hint={`${o.converted} avec au moins un paiement · ${o.clicks_30d} clic(s) sur 30 jours`} />
        <Kpi label="Commissions à traiter" value={money(sum(["pending", "in_review", "validated"]))} hint={`${o.flagged} attribution(s) à vérifier · ${o.disputes} contestation(s)`} />
        <Kpi label="Versé aux affiliés" value={money(o.paid_total)} hint={`${money(sum(["payable"]))} payable(s)`} />
      </div>
      <Panel title="Meilleurs affiliés" description="Établissements recommandés (attributions actives) et commissions hors annulations.">
        <Bars rows={o.top.map((t) => ({ label: `${t.name} (${t.code})`, value: t.referrals, text: `${t.referrals} · ${money(t.commissions)}` }))} empty="Aucun affilié approuvé." />
      </Panel>
    </div>
  );
}

async function AffiliatesTab({ writable }: { writable: boolean }) {
  const supabase = await createClient();
  const [{ data: rows }, { data: campaigns }] = await Promise.all([
    supabase
      .from("affiliates")
      .select("*, profile:profiles!affiliates_user_id_fkey(first_name, last_name, email), promo:promo_codes(code)")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("affiliate_campaigns").select("id, name").order("created_at", { ascending: false }),
  ]);
  if (!rows?.length) return <Empty>Aucune demande d&apos;adhésion.</Empty>;
  const actions = (status: string) =>
    status === "pending" ? ["approve", "reject"] : status === "approved" ? ["suspend"] : status === "suspended" ? ["reactivate", "reject"] : ["approve"];
  const LABELS: Record<string, string> = { approve: "Approuver", reject: "Refuser", suspend: "Suspendre", reactivate: "Réactiver" };
  return (
    <ul className="grid gap-2" data-testid="affiliates-list">
      {rows.map((a) => (
        <li key={a.id} className="grid gap-2 rounded-xl border border-border bg-surface p-3 text-sm" data-testid={`affiliate-${a.code}`}>
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">
              {fullName(a.profile)} · <code>{a.code}</code>
            </span>
            <StatusBadge value={a.status} map={AFFILIATE_STATUS} />
          </span>
          <span className="text-xs text-muted-foreground">
            {AFFILIATE_KINDS[a.kind] ?? a.kind} · {a.profile?.email ?? "—"} · {a.phone ?? "sans téléphone"} · {[a.city, a.country].filter(Boolean).join(", ") || "—"} · demande du {day(a.created_at)}
          </span>
          <span className="text-xs text-muted-foreground">
            Versement : {a.payout_method ? `${PAYOUT_METHODS[a.payout_method]} — ${a.payout_details ?? ""}` : "non renseigné"}
            {a.promo ? ` · code promo lié : ${a.promo.code}` : ""}
            {a.campaign_id ? ` · campagne : ${(campaigns ?? []).find((c) => c.id === a.campaign_id)?.name ?? "—"}` : ""}
          </span>
          {a.motivation ? <span className="text-xs italic text-muted-foreground">« {a.motivation} »</span> : null}
          {a.review_note ? <span className="text-xs">Note : {a.review_note}</span> : null}
          {writable ? (
            <span className="flex flex-wrap gap-2">
              {actions(a.status).map((act) =>
                act === "approve" || act === "reactivate" ? (
                  <InlineForm key={act} action={reviewAffiliate} hidden={{ id: a.id, action: act }} submit={LABELS[act]} variant="secondary" className="flex" />
                ) : (
                  <QuickFormDialog
                    key={act}
                    title={`${LABELS[act]} ${a.code}`}
                    action={reviewAffiliate}
                    hidden={{ id: a.id, action: act }}
                    trigger={
                      <Button size="sm" variant="ghost">
                        {LABELS[act]}
                      </Button>
                    }
                    fields={[{ name: "note", label: "Motif (visible par l'affilié)", type: "textarea", required: true, wide: true }]}
                  />
                ),
              )}
              <QuickFormDialog
                title={`Campagne et code promo de ${a.code}`}
                action={reviewAffiliate}
                hidden={{ id: a.id, action: "link" }}
                trigger={
                  <Button size="sm" variant="ghost">
                    Campagne / code promo
                  </Button>
                }
                fields={[
                  { name: "campaign_id", label: "Campagne", type: "select", options: [{ value: "", label: "Aucune (règle générale)" }, ...(campaigns ?? []).map((c) => ({ value: c.id, label: c.name }))], defaultValue: a.campaign_id ?? "" },
                  { name: "promo_code", label: "Code promo lié (Console › Offres), facultatif", defaultValue: a.promo?.code ?? "", hint: "L'école qui utilise ce code promo est attribuée à cet affilié." },
                ]}
              />
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

async function AttributionsTab({ writable }: { writable: boolean }) {
  const { data: rows } = await (await createClient())
    .from("affiliate_attributions")
    .select("*, organization:organizations(name, city, created_at), affiliate:affiliates!affiliate_attributions_affiliate_id_fkey(code)")
    .order("created_at", { ascending: false })
    .limit(300);
  return (
    <div className="grid gap-3" data-testid="attributions">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Une école est attribuée une seule fois, à sa création. Toute correction est motivée et journalisée.</p>
        {writable ? (
          <QuickFormDialog
            title="Attribuer un établissement manuellement"
            action={correctAttribution}
            trigger={
              <Button size="sm" variant="secondary">
                <Plus aria-hidden /> Attribution manuelle
              </Button>
            }
            fields={[
              { name: "organization_id", label: "Identifiant de l'établissement (fiche établissement)", required: true, wide: true },
              { name: "affiliate_code", label: "Code de l'affilié", required: true },
              { name: "reason", label: "Motif", type: "textarea", required: true, wide: true },
            ]}
          />
        ) : null}
      </div>
      {!rows?.length ? <Empty>Aucun établissement recommandé.</Empty> : null}
      <ul className="grid gap-2">
        {(rows ?? []).map((t) => (
          <li key={t.id} className="grid gap-1 rounded-xl border border-border bg-surface p-3 text-sm">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {t.organization?.name ?? "—"} → <code>{t.affiliate?.code}</code>
              </span>
              <StatusBadge value={t.status} map={{ active: { label: "Retenue", tone: "success" }, rejected: { label: "Refusée", tone: "danger" } }} />
            </span>
            <span className="text-xs text-muted-foreground">
              {ATTRIBUTION_SOURCES[t.source] ?? t.source}
              {t.code_used ? ` (${t.code_used})` : ""} · {day(t.created_at)}
              {t.correction_reason ? ` · corrigée : ${t.correction_reason}` : ""}
            </span>
            {t.flags.length ? (
              <span className="flex flex-wrap gap-1">
                {t.flags.map((f) => (
                  <span key={f} className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning">
                    {ATTRIBUTION_FLAGS[f] ?? f}
                  </span>
                ))}
              </span>
            ) : null}
            {writable ? (
              <QuickFormDialog
                title="Corriger l'attribution"
                action={correctAttribution}
                hidden={{ organization_id: t.organization_id }}
                trigger={
                  <Button size="sm" variant="ghost" className="w-fit">
                    Corriger
                  </Button>
                }
                fields={[
                  { name: "affiliate_code", label: "Nouveau code affilié (vide = retirer l'attribution)" },
                  { name: "reason", label: "Motif", type: "textarea", required: true, wide: true },
                ]}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

async function CommissionsTab({ writable, status }: { writable: boolean; status?: string }) {
  let query = (await createClient())
    .from("affiliate_commissions")
    .select("*, organization:organizations(name), affiliate:affiliates!affiliate_commissions_affiliate_id_fkey(code)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (status && status in COMMISSION_STATUS) query = query.eq("status", status);
  const { data: rows } = await query;
  return (
    <div className="grid gap-3" data-testid="commissions">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <a href="/plateforme/affiliation?onglet=commissions" className={`rounded-full border px-3 py-1 ${!status ? "border-primary text-primary" : "border-border"}`}>
          Toutes
        </a>
        {Object.entries(COMMISSION_STATUS).map(([k, v]) => (
          <a key={k} href={`/plateforme/affiliation?onglet=commissions&statut=${k}`} className={`rounded-full border px-3 py-1 ${status === k ? "border-primary text-primary" : "border-border"}`}>
            {v.label}
          </a>
        ))}
        <a href="/plateforme/affiliation/export" className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1">
          <Download className="size-4" aria-hidden /> Export Excel
        </a>
      </div>
      {!rows?.length ? <Empty>Aucune commission.</Empty> : null}
      <ul className="grid gap-2">
        {(rows ?? []).map((c) => (
          <li key={c.id} className="grid gap-1 rounded-xl border border-border bg-surface p-3 text-sm" data-testid={`commission-${c.id}`}>
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                <code>{c.affiliate?.code}</code> · {c.organization?.name ?? "—"} · {money(c.amount, c.currency)}
                {c.mode === "test" ? <span className="ml-1 text-xs text-warning">(paiement de test)</span> : null}
              </span>
              <StatusBadge value={c.status} map={COMMISSION_STATUS} />
            </span>
            <span className="text-xs text-muted-foreground">
              Paiement {money(c.payment_amount, c.currency)} ({c.plan_code ?? "—"}) du {day(c.created_at)} · règle :{" "}
              {(c.rule as { type?: string; value?: number })?.type === "percent" ? `${(c.rule as { value: number }).value} %` : `${(c.rule as { value?: number })?.value ?? "—"} fixe`}
              {(c.rule as { campaign?: string })?.campaign ? ` (campagne ${(c.rule as { campaign: string }).campaign})` : ""}
              {c.reason ? ` · ${c.reason}` : ""}
            </span>
            {c.disputed ? <span className="rounded-lg bg-warning-soft p-2 text-xs text-warning">Contestation : {c.dispute_message}</span> : null}
            {c.refunded_after_payout ? <span className="text-xs text-danger">Paiement remboursé après versement : à régulariser avec l&apos;affilié.</span> : null}
            {writable && !["paid", "cancelled"].includes(c.status) ? (
              <span className="flex flex-wrap gap-2">
                {c.status === "pending" ? <InlineForm action={reviewCommission} hidden={{ id: c.id, action: "review" }} submit="Mettre en vérification" variant="ghost" className="flex" /> : null}
                {["pending", "in_review"].includes(c.status) ? <InlineForm action={reviewCommission} hidden={{ id: c.id, action: "validate" }} submit="Valider" variant="secondary" className="flex" /> : null}
                {c.status === "rejected" ? <InlineForm action={reviewCommission} hidden={{ id: c.id, action: "reopen" }} submit="Rouvrir" variant="ghost" className="flex" /> : null}
                {c.status !== "rejected" ? (
                  <QuickFormDialog
                    title="Refuser la commission"
                    action={reviewCommission}
                    hidden={{ id: c.id, action: "reject" }}
                    trigger={
                      <Button size="sm" variant="ghost">
                        Refuser
                      </Button>
                    }
                    fields={[{ name: "reason", label: "Motif (visible par l'affilié)", type: "textarea", required: true, wide: true }]}
                  />
                ) : null}
              </span>
            ) : null}
            {writable && c.disputed ? (
              <QuickFormDialog
                title="Traiter la contestation"
                action={reviewCommission}
                hidden={{ id: c.id, action: "resolve_dispute" }}
                trigger={
                  <Button size="sm" variant="ghost" className="w-fit">
                    Traiter la contestation
                  </Button>
                }
                fields={[{ name: "reason", label: "Réponse (visible par l'affilié)", type: "textarea", wide: true }]}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

async function PayoutsTab({ writable, minPayout }: { writable: boolean; minPayout: number }) {
  const supabase = await createClient();
  const [{ data: payable }, { data: payouts }] = await Promise.all([
    supabase
      .from("affiliate_commissions")
      .select("id, amount, currency, created_at, affiliate_id, organization:organizations(name), affiliate:affiliates!affiliate_commissions_affiliate_id_fkey(code, payout_method, payout_details)")
      .eq("status", "payable")
      .order("created_at"),
    supabase.from("affiliate_payouts").select("*, affiliate:affiliates(code)").order("paid_on", { ascending: false }).limit(200),
  ]);
  const byAffiliate = new Map<string, NonNullable<typeof payable>>();
  for (const c of payable ?? []) byAffiliate.set(c.affiliate_id, [...(byAffiliate.get(c.affiliate_id) ?? []), c]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid gap-4" data-testid="payouts">
      <Panel title="Commissions payables" description={`Versez l'argent hors NeoScool (Mobile Money, virement), puis enregistrez le versement avec sa référence réelle. Minimum conseillé : ${money(minPayout)}.`}>
        {byAffiliate.size === 0 ? <Empty>Aucune commission payable.</Empty> : null}
        <div className="grid gap-3">
          {[...byAffiliate.entries()].map(([affiliateId, list]) => {
            const total = list.reduce((t, c) => t + c.amount, 0);
            const a = list[0]!.affiliate;
            return (
              <div key={affiliateId} className="grid gap-2 rounded-xl border border-border p-3 text-sm" data-testid={`payable-${a?.code}`}>
                <p className="flex flex-wrap items-center justify-between gap-2 font-medium">
                  <span className="flex items-center gap-1.5">
                    <HandCoins className="size-4 text-primary" aria-hidden /> <code>{a?.code}</code> · {money(total, list[0]!.currency)}
                  </span>
                  <span className="text-xs text-muted-foreground">{a?.payout_method ? `${PAYOUT_METHODS[a.payout_method]} — ${a.payout_details ?? ""}` : "coordonnées non renseignées"}</span>
                </p>
                {total < minPayout ? <p className="text-xs text-warning">Sous le minimum de versement.</p> : null}
                {writable ? (
                  <InlineForm action={recordAffiliatePayout} hidden={{ affiliate_id: affiliateId }} submit="Enregistrer le versement" className="grid gap-2">
                    <div className="grid gap-1">
                      {list.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-xs">
                          <input type="checkbox" name="commission" value={c.id} defaultChecked className="size-4" /> {c.organization?.name ?? "—"} · {money(c.amount, c.currency)} · {day(c.created_at)}
                        </label>
                      ))}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <select name="method" defaultValue={a?.payout_method ?? "mobile_money"} className="h-9 rounded-lg border border-border px-2" aria-label="Moyen">
                        {Object.entries(PAYOUT_METHODS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <input name="reference" required minLength={3} maxLength={120} placeholder="Référence de la transaction *" className="h-9 rounded-lg border border-border px-2" aria-label="Référence" />
                      <input name="paid_on" type="date" required defaultValue={today} max={today} className="h-9 rounded-lg border border-border px-2" aria-label="Date du versement" />
                    </div>
                    <input name="note" maxLength={500} placeholder="Note (facultatif)" className="h-9 rounded-lg border border-border px-2" aria-label="Note" />
                  </InlineForm>
                ) : null}
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel title="Versements enregistrés">
        {!payouts?.length ? <Empty>Aucun versement.</Empty> : null}
        <ul className="grid gap-2">
          {(payouts ?? []).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <Wallet className="size-4 text-primary" aria-hidden /> <code>{p.affiliate?.code}</code> · {money(p.amount, p.currency)}
              </span>
              <span className="text-xs text-muted-foreground">
                {day(p.paid_on)} · {PAYOUT_METHODS[p.method]} · réf. {p.reference}
                {p.note ? ` · ${p.note}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

async function CampaignsTab({ writable, enabled }: { writable: boolean; enabled: boolean }) {
  const { data: rows } = await (await createClient()).from("affiliate_campaigns").select("*").order("created_at", { ascending: false });
  type C = NonNullable<typeof rows>[number];
  const fields = (c?: C) => [
    { name: "name", label: "Nom", required: true, wide: true, defaultValue: c?.name ?? "" },
    { name: "description", label: "Description", type: "textarea" as const, wide: true, defaultValue: c?.description ?? "" },
    { name: "starts_on", label: "Début", type: "date" as const, defaultValue: c?.starts_on ?? new Date().toISOString().slice(0, 10) },
    { name: "ends_on", label: "Fin (facultatif)", type: "date" as const, defaultValue: c?.ends_on ?? "" },
    { name: "reward_type", label: "Type de récompense", type: "select" as const, options: opts(REWARD_TYPES), defaultValue: c?.reward_type ?? "percent" },
    { name: "reward_value", label: "Taux (%) ou montant", type: "number" as const, required: true, min: 1, defaultValue: String(c?.reward_value ?? 20) },
    { name: "reward_event", label: "Déclencheur", type: "select" as const, options: opts(REWARD_EVENTS), defaultValue: c?.reward_event ?? "first_payment" },
    { name: "reward_months", label: "Période de récompense (mois)", type: "number" as const, min: 1, max: 60, defaultValue: String(c?.reward_months ?? 12) },
    { name: "eligible_plans", label: "Formules concernées (codes séparés par des virgules, vide = toutes)", wide: true, defaultValue: (c?.eligible_plans ?? []).join(", ") },
    { name: "is_active", label: "Active", type: "checkbox" as const, defaultValue: c ? (c.is_active ? "true" : "") : "true" },
  ];
  return (
    <div className="grid gap-3" data-testid="campaigns">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {enabled ? "Les campagnes actives remplacent la règle générale pour les affiliés qui y sont rattachés." : "Les campagnes sont désactivées (Réglages) : la règle générale s'applique à tous."}
        </p>
        {writable ? (
          <QuickFormDialog
            title="Nouvelle campagne"
            action={saveAffiliateCampaign}
            trigger={
              <Button size="sm">
                <Plus aria-hidden /> Nouvelle campagne
              </Button>
            }
            fields={fields()}
          />
        ) : null}
      </div>
      {!rows?.length ? <Empty>Aucune campagne.</Empty> : null}
      <ul className="grid gap-2">
        {(rows ?? []).map((c) => (
          <li key={c.id} className="grid gap-1 rounded-xl border border-border bg-surface p-3 text-sm">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{c.name}</span>
              <span className="flex items-center gap-2">
                <StatusBadge value={c.is_active ? "on" : "off"} map={{ on: { label: "Active", tone: "success" }, off: { label: "Inactive", tone: "neutral" } }} />
                {writable ? (
                  <QuickFormDialog title="Modifier la campagne" action={saveAffiliateCampaign} hidden={{ id: c.id }} trigger={<Button size="sm" variant="ghost">Modifier</Button>} fields={fields(c)} />
                ) : null}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              {rewardText(c)} · du {day(c.starts_on)}
              {c.ends_on ? ` au ${day(c.ends_on)}` : ", sans date de fin"}
              {c.eligible_plans?.length ? ` · formules : ${c.eligible_plans.join(", ")}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function SettingsTab({ writable, s }: { writable: boolean; s: Record<string, unknown> & { allowed_kinds: string[] } }) {
  const box = (name: string, label: string, hint: string) => (
    <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={Boolean(s[name])} disabled={!writable} className="mt-0.5 size-4" />
      <span className="grid">
        <strong>{label}</strong>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
  const num = (name: string, label: string, hint?: string) => (
    <label className="grid gap-1 text-sm">
      {label}
      <input name={name} type="number" min={0} defaultValue={s[name] == null ? "" : String(s[name])} disabled={!writable} className="h-9 rounded-lg border border-border px-2" />
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
  const select = (name: string, label: string, options: Record<string, string>) => (
    <label className="grid gap-1 text-sm">
      {label}
      <select name={name} defaultValue={String(s[name])} disabled={!writable} className="h-9 rounded-lg border border-border px-2">
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div data-testid="affiliate-settings">
      <InlineForm action={saveAffiliateSettings} submit={writable ? "Enregistrer" : undefined} className="grid gap-4">
        <Panel title="Activation" description="Désactivé par défaut. Une désactivation bloque les nouvelles demandes, clics, attributions et commissions ; l'historique est conservé et les commissions validées restent payables.">
          <div className="grid gap-2 sm:grid-cols-2">
            {box("enabled", "Programme actif", "Interrupteur général de NEOSCOOL Affiliates.")}
            {box("signups_open", "Nouvelles demandes acceptées", "Sinon, seuls les affiliés existants continuent.")}
            {box("links_enabled", "Liens de recommandation", "Liens /r/<code> suivis pendant la durée d'attribution, grâce à un cookie technique « ns_ref » (identifiant du clic, rien d'autre) : à mentionner dans votre politique de confidentialité.")}
            {box("codes_enabled", "Codes de recommandation", "Champ « code de recommandation » à l'inscription d'un établissement, et codes promo liés.")}
            {box("campaigns_enabled", "Campagnes", "Règles de récompense par campagne (onglet Campagnes).")}
            {box("require_approval", "Validation manuelle des affiliés", "Sinon, toute demande conforme est approuvée automatiquement.")}
            {box("require_phone", "Téléphone obligatoire", "")}
            {box("require_payout_details", "Coordonnées de versement obligatoires", "Mobile Money ou banque.")}
            {box("count_test_payments", "Compter les paiements de test", "À n'activer que pour une démonstration : les commissions sont marquées « paiement de test ».")}
          </div>
          <fieldset className="mt-3 grid gap-1 text-sm">
            <legend className="font-medium">Profils acceptés</legend>
            <div className="flex flex-wrap gap-3">
              {Object.entries(AFFILIATE_KINDS).map(([k, v]) => (
                <label key={k} className="flex items-center gap-1.5">
                  <input type="checkbox" name={`kind_${k}`} defaultChecked={s.allowed_kinds.includes(k)} disabled={!writable} className="size-4" /> {v}
                </label>
              ))}
            </div>
          </fieldset>
        </Panel>
        <Panel title="Récompense (règle générale)">
          <div className="grid gap-3 sm:grid-cols-3">
            {select("reward_type", "Type", REWARD_TYPES)}
            {num("reward_value", "Taux (%) ou montant fixe")}
            {select("reward_event", "Déclencheur", REWARD_EVENTS)}
            {num("reward_months", "Période de récompense (mois)", "Pour « chaque paiement » : à partir du premier paiement.")}
            <label className="grid gap-1 text-sm sm:col-span-2">
              Formules concernées (codes, séparés par des virgules ; vide = toutes)
              <input name="eligible_plans" defaultValue={((s.eligible_plans as string[] | null) ?? []).join(", ")} disabled={!writable} className="h-9 rounded-lg border border-border px-2" />
            </label>
            {num("monthly_cap", "Plafond mensuel par affilié (vide = aucun)")}
          </div>
        </Panel>
        <Panel title="Attribution et paiement">
          <div className="grid gap-3 sm:grid-cols-3">
            {num("attribution_days", "Durée d'attribution d'un lien (jours)")}
            {select("conflict_rule", "Si plusieurs affiliés", CONFLICT_RULES)}
            {num("hold_days", "Délai de vérification avant paiement (jours)")}
            {num("min_payout", "Minimum de versement (FCFA)")}
          </div>
        </Panel>
        <Panel title="Conditions du programme" description="Affichées aux personnes qui demandent à rejoindre le programme.">
          <Textarea name="terms" rows={6} maxLength={6000} defaultValue={String(s.terms ?? "")} disabled={!writable} />
        </Panel>
      </InlineForm>
    </div>
  );
}
