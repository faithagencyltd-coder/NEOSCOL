import { Download, FileText, Radio } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { TabNav } from "@/components/shared/tab-nav";
import { Card } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { InlineForm } from "@/features/ecosystem/components/inline-form";
import { purgeAnalytics, saveAnalyticsSettings } from "@/features/analytics/actions";
import { BROWSER_LABELS, DEVICE_LABELS, OS_LABELS } from "@/features/analytics/agent";
import { Bars, DailyChart, Empty, Kpi, Panel, WorldMap } from "@/features/analytics/charts";
import { countryName, loadBehavior, loadConversion, loadDevices, loadGeo, loadOrganizations, loadOverview } from "@/features/analytics/data";
import { appModuleLabel, CONVERSION_LABELS, delta, filterQuery, fmtDuration, parseFilters, pct, PRESETS, siteSection, type AnalyticsFilters } from "@/features/analytics/shared";
import { ORG_TYPE_LABELS } from "@/features/platform/org-types";
import { canWritePlatform, getPlatformRole } from "@/lib/auth/platform";
import { createClient } from "@/lib/supabase/server";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Analytics — Console" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "vue", label: "Vue d'ensemble" },
  { key: "geographie", label: "Géographie" },
  { key: "comportement", label: "Comportement" },
  { key: "appareils", label: "Appareils" },
  { key: "conversion", label: "Conversion" },
  { key: "etablissements", label: "Établissements" },
  { key: "rapports", label: "Rapports" },
  { key: "reglages", label: "Réglages" },
] as const;
type Tab = (typeof TABS)[number]["key"];
const n = (v: number | null | undefined) => (v ?? 0).toLocaleString("fr-FR");
const SOURCE_NOTE = "Données issues uniquement des événements réellement enregistrés (aucune estimation).";

/** Console › Analytics : audience du site, comportement, appareils, conversion, activité des établissements, rapports. */
export default async function AnalyticsPage({ searchParams }: PageProps<"/plateforme/analytics">) {
  const params = await searchParams;
  const f = parseFilters(params);
  const requested = param(params, "onglet");
  const tab: Tab = TABS.find((t) => t.key === requested)?.key ?? "vue";
  const supabase = await createClient();
  const [{ data: settings }, { data: countries }] = await Promise.all([
    supabase.from("analytics_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("countries").select("code, name").order("name"),
  ]);
  const writable = canWritePlatform(await getPlatformRole());

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            {SOURCE_NOTE} Visiteurs anonymes par défaut ; « visiteurs qui reviennent » seulement pour ceux qui ont accepté la mesure.
            {settings && !settings.enabled ? <strong className="ml-1 text-danger">Mesure détaillée désactivée (Réglages).</strong> : null}
          </p>
        </div>
      </div>

      {tab !== "reglages" ? <Filters f={f} tab={tab} countries={countries ?? []} /> : null}
      <TabNav label="Analytics" active={tab} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/plateforme/analytics?${filterQuery(f, { onglet: t.key })}` }))} />

      {tab === "vue" ? <OverviewTab f={f} /> : null}
      {tab === "geographie" ? <GeoTab f={f} /> : null}
      {tab === "comportement" ? <BehaviorTab f={f} /> : null}
      {tab === "appareils" ? <DevicesTab f={f} /> : null}
      {tab === "conversion" ? <ConversionTab f={f} /> : null}
      {tab === "etablissements" ? <OrganizationsTab f={f} /> : null}
      {tab === "rapports" ? <ReportsTab f={f} /> : null}
      {tab === "reglages" && settings ? <SettingsTab settings={settings} writable={writable} /> : null}
    </div>
  );
}

function Filters({ f, tab, countries }: { f: AnalyticsFilters; tab: Tab; countries: { code: string; name: string }[] }) {
  const field = "h-9 rounded-lg border border-border bg-surface px-2 text-sm";
  return (
    <form method="get" className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-3" data-testid="analytics-filters">
      <input type="hidden" name="onglet" value={tab} />
      <label className="grid gap-1 text-xs">
        Période
        <select name="periode" defaultValue={f.preset === "perso" ? "" : f.preset} className={field}>
          {Object.entries(PRESETS).map(([k, p]) => (
            <option key={k} value={k}>
              {p.label}
            </option>
          ))}
          <option value="">Dates ci-contre</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs">
        Du
        <input type="date" name="du" defaultValue={f.preset === "perso" ? f.from : ""} className={field} />
      </label>
      <label className="grid gap-1 text-xs">
        Au
        <input type="date" name="au" defaultValue={f.preset === "perso" ? f.to : ""} className={field} />
      </label>
      <label className="grid gap-1 text-xs">
        Pays
        <select name="pays" defaultValue={f.country} className={field}>
          <option value="">Tous</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs">
        Appareil
        <select name="appareil" defaultValue={f.device} className={field}>
          <option value="">Tous</option>
          {Object.entries(DEVICE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
        Appliquer
      </button>
      <span className="ml-auto text-xs text-muted-foreground">
        Du {new Date(f.from).toLocaleDateString("fr-FR")} au {new Date(f.to).toLocaleDateString("fr-FR")}
      </span>
    </form>
  );
}

async function OverviewTab({ f }: { f: AnalyticsFilters }) {
  const o = await loadOverview(f);
  if (!o) return <Empty>Statistiques indisponibles.</Empty>;
  const consented = o.consented_sessions;
  return (
    <div className="grid gap-4" data-testid="analytics-overview">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="grid gap-1 border-primary/40 p-4" data-testid="realtime">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Radio className="size-3.5 text-success" aria-hidden /> En ce moment (5 dernières minutes)
          </span>
          <span className="text-2xl font-bold tabular-nums">{n(o.realtime)}</span>
          <span className="truncate text-xs text-muted-foreground">{o.realtime_pages.map((p) => `${p.path ?? "?"} (${p.n})`).join(" · ") || "—"}</span>
        </Card>
        <Kpi label="Visiteurs aujourd'hui" value={n(o.today)} />
        <Kpi label="Visiteurs (7 derniers jours)" value={n(o.week)} />
        <Kpi label="Visiteurs (30 derniers jours)" value={n(o.month)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Visiteurs sur la période" value={n(o.visitors)} deltaPct={delta(o.visitors, o.previous.visitors)} testId="kpi-visitors" />
        <Kpi label="Visites (sessions)" value={n(o.sessions)} deltaPct={delta(o.sessions, o.previous.sessions)} />
        <Kpi label="Pages vues" value={n(o.pageviews)} deltaPct={delta(o.pageviews, o.previous.pageviews)} />
        <Kpi label="Visites avec conversion" value={n(o.conversions)} deltaPct={delta(o.conversions, o.previous.conversions)} hint={`Taux : ${pct(o.conversions, o.sessions)} %`} />
        <Kpi label="Durée moyenne d'une page" value={fmtDuration(o.avg_duration_ms)} />
        <Kpi label="Visites d'une seule page" value={o.bounce_rate === null ? "—" : `${o.bounce_rate.toLocaleString("fr-FR")} %`} />
        <Kpi label="Nouveaux visiteurs" value={n(o.new_sessions)} hint={`sur ${n(consented)} visite(s) avec consentement`} />
        <Kpi label="Visiteurs qui reviennent" value={n(o.returning_sessions)} hint={consented ? `${pct(o.returning_sessions, consented)} % des visites avec consentement` : "aucune visite avec consentement"} />
      </div>
      <Panel title="Évolution journalière" description="Visiteurs, visites et pages vues par jour sur la période choisie.">
        <DailyChart
          days={o.by_day.map((d) => d.day)}
          series={[
            { label: "Visiteurs", color: "#1d63ed", values: o.by_day.map((d) => d.visitors) },
            { label: "Visites", color: "#f7931e", values: o.by_day.map((d) => d.sessions) },
            { label: "Pages vues", color: "#10b981", values: o.by_day.map((d) => d.pageviews) },
          ]}
        />
      </Panel>
      <ComparisonTable o={o} />
    </div>
  );
}

function ComparisonTable({ o }: { o: { visitors: number; sessions: number; pageviews: number; conversions: number; previous: { visitors: number; sessions: number; pageviews: number; conversions: number } } }) {
  const rows: [string, number, number][] = [
    ["Visiteurs", o.visitors, o.previous.visitors],
    ["Visites", o.sessions, o.previous.sessions],
    ["Pages vues", o.pageviews, o.previous.pageviews],
    ["Visites avec conversion", o.conversions, o.previous.conversions],
  ];
  return (
    <Panel title="Comparaison avec la période précédente" description="Période de même durée, juste avant la période choisie.">
      <Table>
        <THead>
          <TR>
            <TH>Indicateur</TH>
            <TH className="text-right">Période choisie</TH>
            <TH className="text-right">Période précédente</TH>
            <TH className="text-right">Évolution</TH>
          </TR>
        </THead>
        <tbody>
          {rows.map(([label, cur, prev]) => {
            const d = delta(cur, prev);
            return (
              <TR key={label}>
                <TD>{label}</TD>
                <TD className="text-right tabular-nums">{n(cur)}</TD>
                <TD className="text-right tabular-nums">{n(prev)}</TD>
                <TD className={`text-right tabular-nums ${d === null ? "text-muted-foreground" : d >= 0 ? "text-success" : "text-danger"}`}>{d === null ? "—" : `${d >= 0 ? "+" : ""}${d.toLocaleString("fr-FR")} %`}</TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    </Panel>
  );
}

async function GeoTab({ f }: { f: AnalyticsFilters }) {
  const g = await loadGeo(f);
  if (!g) return <Empty>Statistiques indisponibles.</Empty>;
  const values = Object.fromEntries(g.countries.filter((c) => c.country !== "—").map((c) => [c.country, c.visitors]));
  const names = Object.fromEntries(g.countries.map((c) => [c.country, countryName(c.country)]));
  return (
    <div className="grid gap-4" data-testid="analytics-geo">
      <Panel title="Carte des visiteurs" description="Pays déterminé par l'hébergeur à partir de la connexion (adresse IP jamais conservée).">
        <WorldMap values={values} names={names} />
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Répartition par pays">
          {g.countries.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Pays</TH>
                  <TH className="text-right">Visiteurs</TH>
                  <TH className="text-right">Visites</TH>
                  <TH className="text-right">Conversions</TH>
                </TR>
              </THead>
              <tbody>
                {g.countries.map((c) => (
                  <TR key={c.country}>
                    <TD>{countryName(c.country)}</TD>
                    <TD className="text-right tabular-nums">{n(c.visitors)}</TD>
                    <TD className="text-right tabular-nums">{n(c.sessions)}</TD>
                    <TD className="text-right tabular-nums">{n(c.conversions)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : (
            <Empty />
          )}
        </Panel>
        <Panel title="Villes" description="Lorsque l'hébergeur les fournit (Vercel en production).">
          <Bars rows={g.cities.map((c) => ({ label: `${c.city} (${c.country})`, value: c.visitors }))} empty="Aucune ville connue sur la période." />
        </Panel>
      </div>
    </div>
  );
}

async function BehaviorTab({ f }: { f: AnalyticsFilters }) {
  const b = await loadBehavior(f);
  if (!b) return <Empty>Statistiques indisponibles.</Empty>;
  const sections = new Map<string, number>();
  for (const p of b.pages) sections.set(siteSection(p.path), (sections.get(siteSection(p.path)) ?? 0) + p.views);
  return (
    <div className="grid gap-4" data-testid="analytics-behavior">
      <Panel title="Pages consultées" description="Pages vues, visites et temps moyen passé sur la page (temps où la page était visible).">
        {b.pages.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Page</TH>
                <TH className="text-right">Vues</TH>
                <TH className="text-right">Visites</TH>
                <TH className="text-right">Temps moyen</TH>
              </TR>
            </THead>
            <tbody>
              {b.pages.map((p) => (
                <TR key={p.path}>
                  <TD className="max-w-[22rem] truncate font-mono text-xs">{p.path}</TD>
                  <TD className="text-right tabular-nums">{n(p.views)}</TD>
                  <TD className="text-right tabular-nums">{n(p.sessions)}</TD>
                  <TD className="text-right tabular-nums">{fmtDuration(p.avg_duration_ms)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty />
        )}
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Rubriques consultées" description="Modules et rubriques du site, d'après les pages vues.">
          <Bars rows={[...sections.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))} />
        </Panel>
        <Panel title="Boutons cliqués" description="Libellé du bouton (jamais le contenu d'un formulaire).">
          <Bars rows={b.clicks.map((c) => ({ label: c.label, value: c.clicks, hint: `${c.label} — ${c.path}` }))} empty="Aucun clic enregistré." />
        </Panel>
        <Panel title="Liens visités">
          <Bars rows={b.links.map((l) => ({ label: l.target, value: l.clicks, hint: l.label ?? l.target }))} empty="Aucun lien cliqué." />
        </Panel>
        <Panel title="Origine des visites">
          <Bars rows={b.referrers.map((r) => ({ label: r.source, value: r.sessions }))} />
        </Panel>
        <Panel title="Pages d'entrée">
          <Bars rows={b.entries.map((e) => ({ label: e.path, value: e.sessions }))} />
        </Panel>
        <Panel title="Pages de sortie" description="Dernière page vue avant de quitter le site.">
          <Bars rows={b.exits.map((e) => ({ label: e.path, value: e.sessions }))} />
        </Panel>
      </div>
      <Panel title="Parcours des visiteurs" description="Trois premières pages de chaque visite, regroupées.">
        {b.routes.length ? (
          <ul className="grid gap-1 text-sm" data-testid="routes">
            {b.routes.map((r) => (
              <li key={r.route} className="flex justify-between gap-3 border-b border-border py-1">
                <span className="font-mono text-xs">{r.route}</span>
                <span className="tabular-nums">{n(r.sessions)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Panel>
      {b.campaigns.length ? (
        <Panel title="Campagnes (liens suivis)" description="Paramètres utm_source / utm_campaign ou source des liens partagés.">
          <Bars rows={b.campaigns.map((c) => ({ label: `${c.source} · ${c.campaign}`, value: c.sessions, text: `${n(c.sessions)} visite(s), ${n(c.conversions)} conversion(s)` }))} />
        </Panel>
      ) : null}
    </div>
  );
}

async function DevicesTab({ f }: { f: AnalyticsFilters }) {
  const d = await loadDevices(f);
  if (!d) return <Empty>Statistiques indisponibles.</Empty>;
  const rows = (map: Record<string, number>, labels: Record<string, string>) => Object.entries(map).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: labels[k] ?? k, value: v }));
  return (
    <div className="grid gap-4 lg:grid-cols-3" data-testid="analytics-devices">
      <Panel title="Types d'appareils">
        <Bars rows={rows(d.devices, DEVICE_LABELS)} />
      </Panel>
      <Panel title="Systèmes (Android, iPhone, Windows, Mac…)">
        <Bars rows={rows(d.os, OS_LABELS)} />
      </Panel>
      <Panel title="Navigateurs">
        <Bars rows={rows(d.browsers, BROWSER_LABELS)} />
      </Panel>
      <Panel title="Taux de conversion par appareil">
        <Bars rows={Object.entries(d.conversion_by_device).map(([k, v]) => ({ label: DEVICE_LABELS[k] ?? k, value: Number(v), text: `${Number(v).toLocaleString("fr-FR")} %` }))} />
      </Panel>
    </div>
  );
}

async function ConversionTab({ f }: { f: AnalyticsFilters }) {
  const c = await loadConversion(f);
  if (!c) return <Empty>Statistiques indisponibles.</Empty>;
  const b = c.business;
  const funnel = [
    { label: "Visites du site", value: c.sessions },
    { label: "Inscription commencée (page Inscription ouverte)", value: c.signup_started_sessions },
    { label: "Formulaire d'inscription envoyé", value: c.events.signup_submitted ?? 0 },
  ];
  return (
    <div className="grid gap-4" data-testid="analytics-conversion">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label="Taux de conversion des visites" value={`${pct(c.converted_sessions, c.sessions).toLocaleString("fr-FR")} %`} hint={`${n(c.converted_sessions)} visite(s) avec conversion sur ${n(c.sessions)}`} testId="conversion-rate" />
        <Kpi label="Demandes de démonstration" value={n(b.demo_requests)} hint="Formulaires reçus (hors indésirables)" />
        <Kpi label="Demandes de contact" value={n(b.contact_requests)} hint="Formulaires reçus (hors indésirables)" />
        <Kpi label="Inscriptions terminées" value={n(b.signups_completed)} hint="Établissements réellement créés (hors démonstration)" />
        <Kpi label="Abonnements payés" value={n(b.paid_subscriptions)} hint="Établissements avec un paiement confirmé sur la période" />
        <Kpi label="Demandes Discover / comptes particuliers" value={`${n(b.discover_requests)} / ${n(b.public_accounts)}`} />
      </div>
      <Panel title="Entonnoir d'inscription" description="Mesuré sur les visites (filtres pays et appareil appliqués).">
        <Bars rows={funnel.map((s) => ({ label: s.label, value: s.value, text: `${n(s.value)} (${pct(s.value, c.sessions).toLocaleString("fr-FR")} %)` }))} />
      </Panel>
      <Panel title="Formulaires envoyés depuis le site (visites)" description="Conversions déclenchées dans le navigateur au succès de l'envoi.">
        <Bars rows={Object.entries(c.events).map(([k, v]) => ({ label: CONVERSION_LABELS[k] ?? k, value: v }))} empty="Aucune conversion enregistrée sur la période." />
      </Panel>
      <p className="text-xs text-muted-foreground">Les cartes du haut proviennent des tables métier (demandes reçues, établissements créés, paiements) et font foi ; elles ne dépendent pas des filtres pays et appareil.</p>
    </div>
  );
}

async function OrganizationsTab({ f }: { f: AnalyticsFilters }) {
  const o = await loadOrganizations(f);
  if (!o) return <Empty>Statistiques indisponibles.</Empty>;
  return (
    <div className="grid gap-4" data-testid="analytics-organizations">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Établissements actifs" value={n(o.active_organizations)} hint="Hors établissements de démonstration" />
        <Kpi label="Établissements connectés sur la période" value={n(o.organizations_with_activity)} />
        <Kpi label="Connexions" value={n(o.logins)} />
        <Kpi label="Utilisateurs actifs" value={n(o.active_users)} hint="Comptes s'étant connectés sur la période" />
      </div>
      <Panel title="Utilisation des modules" description="Pages de l'application consultées par module (aucun contenu enregistré).">
        <Bars rows={o.modules.map((m) => ({ label: appModuleLabel(m.module), value: m.views, text: `${n(m.views)} vue(s) · ${n(m.organizations)} établ. · ${n(m.users)} util.` }))} empty="Aucune consultation enregistrée sur la période." />
      </Panel>
      <Panel title="Activité par établissement">
        {o.rows.length ? (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Établissement</TH>
                  <TH className="text-right">Connexions</TH>
                  <TH className="text-right">Utilisateurs</TH>
                  <TH className="text-right">Actions</TH>
                  <TH className="text-right">Pages vues</TH>
                  <TH>Modules les plus utilisés</TH>
                  <TH>Dernière connexion</TH>
                </TR>
              </THead>
              <tbody>
                {o.rows.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/plateforme/etablissements/${r.id}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {ORG_TYPE_LABELS[r.type] ?? r.type} · {r.country} {r.status !== "active" ? `· ${r.status}` : ""}
                      </span>
                    </TD>
                    <TD className="text-right tabular-nums">{n(r.logins)}</TD>
                    <TD className="text-right tabular-nums">{n(Math.max(r.login_users, r.usage_users))}</TD>
                    <TD className="text-right tabular-nums">{n(r.actions)}</TD>
                    <TD className="text-right tabular-nums">{n(r.page_views)}</TD>
                    <TD className="text-xs">{r.top_modules.map(appModuleLabel).join(", ") || "—"}</TD>
                    <TD className="text-xs">{r.last_login ? new Date(r.last_login).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "Jamais"}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        ) : (
          <Empty>Aucun établissement.</Empty>
        )}
      </Panel>
    </div>
  );
}

function ReportsTab({ f }: { f: AnalyticsFilters }) {
  const q = filterQuery(f);
  return (
    <Panel title="Exporter un rapport" description="Rapport complet de la période et des filtres choisis : vue d'ensemble, jour par jour, pays, villes, pages, clics, appareils, conversions, établissements." testId="analytics-reports">
      <div className="grid gap-3 sm:grid-cols-2">
        <a href={`/plateforme/analytics/export?${q}&format=xlsx`} className="flex items-center gap-3 rounded-xl border border-border p-4 hover:bg-surface-muted" data-testid="export-xlsx">
          <Download className="size-5 text-primary" aria-hidden />
          <span className="grid">
            <strong>Excel (.xlsx)</strong>
            <span className="text-xs text-muted-foreground">Une feuille par thème, prête pour les tableaux croisés.</span>
          </span>
        </a>
        <a href={`/plateforme/analytics/export?${q}&format=pdf`} className="flex items-center gap-3 rounded-xl border border-border p-4 hover:bg-surface-muted" data-testid="export-pdf">
          <FileText className="size-5 text-primary" aria-hidden />
          <span className="grid">
            <strong>PDF</strong>
            <span className="text-xs text-muted-foreground">Synthèse imprimable avec comparaison des périodes.</span>
          </span>
        </a>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Graphiques journaliers, hebdomadaires ou mensuels : choisissez la période (7 jours, 30 jours, 90 jours, 12 mois ou dates précises) dans les filtres ; la vue d&apos;ensemble compare toujours avec la période précédente de même durée.
      </p>
    </Panel>
  );
}

function SettingsTab({ settings, writable }: { settings: { enabled: boolean; consent_required: boolean; track_clicks: boolean; track_duration: boolean; track_app_usage: boolean; retention_months: number; updated_at: string }; writable: boolean }) {
  const box = (name: string, label: string, hint: string, checked: boolean) => (
    <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} disabled={!writable} className="mt-0.5 size-4" />
      <span className="grid">
        <strong>{label}</strong>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
  return (
    <div className="grid gap-4" data-testid="analytics-settings">
      <Panel title="Réglages de la mesure" description={`Dernière modification : ${new Date(settings.updated_at).toLocaleString("fr-FR")}`}>
        <InlineForm action={saveAnalyticsSettings} submit={writable ? "Enregistrer" : undefined}>
          {box("enabled", "Mesure détaillée activée", "Désactivée : seul le compteur de visites anonyme existant continue ; rien d'autre n'est enregistré.", settings.enabled)}
          {box("consent_required", "Consentement exigé (recommandé)", "Bandeau sur le site ; sans accord, le visiteur reste anonyme (aucun identifiant durable).", settings.consent_required)}
          {box("track_clicks", "Enregistrer les clics", "Libellé des boutons et adresse des liens ; jamais le contenu des formulaires.", settings.track_clicks)}
          {box("track_duration", "Mesurer le temps passé par page", "Durée pendant laquelle la page est visible à l'écran.", settings.track_duration)}
          {box("track_app_usage", "Suivre l'usage des modules par les établissements", "Nombre de pages consultées par module dans l'application (aucun contenu).", settings.track_app_usage)}
          <label className="grid max-w-xs gap-1 text-sm">
            Durée de conservation (mois)
            <input type="number" name="retention_months" min={1} max={25} defaultValue={settings.retention_months} disabled={!writable} className="h-9 rounded-lg border border-border px-2" />
          </label>
        </InlineForm>
      </Panel>
      {writable ? (
        <Panel title="Purge" description="Supprime dès maintenant les données plus anciennes que la durée de conservation (faite aussi automatiquement chaque nuit).">
          <InlineForm action={purgeAnalytics} submit="Purger les données anciennes" variant="secondary" className="flex" />
        </Panel>
      ) : null}
      <Panel title="Ce qui n'est jamais enregistré">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Adresse IP, mot de passe, contenu d&apos;un formulaire ou d&apos;une page.</li>
          <li>Données scolaires (notes, absences, dossiers), finances des familles, messages.</li>
          <li>Visites des visiteurs qui demandent « ne pas me suivre » (DNT / GPC).</li>
          <li>Pages de la console et de l&apos;espace personnel.</li>
        </ul>
      </Panel>
    </div>
  );
}
