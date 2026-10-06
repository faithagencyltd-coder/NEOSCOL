import { Document, renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";

import { BROWSER_LABELS, DEVICE_LABELS, OS_LABELS } from "@/features/analytics/agent";
import { countryName, loadBehavior, loadConversion, loadDevices, loadGeo, loadOrganizations, loadOverview } from "@/features/analytics/data";
import { AnalyticsReportPage, type ReportSection } from "@/features/analytics/report-pdf";
import { appModuleLabel, CONVERSION_LABELS, delta, fmtDuration, parseFilters, pct } from "@/features/analytics/shared";
import { pdfResponse } from "@/features/documents/server";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { buildXlsx, XLSX_MIME } from "@/lib/xlsx/write";

/** Export du rapport Analytics (Excel ou PDF) : réservé à l'administration de la plateforme, revérifié en base. */
export async function GET(request: NextRequest) {
  if (!(await getSessionContext())) return new Response("Session expirée.", { status: 401 });
  const { data: isAdmin } = await (await createClient()).rpc("is_platform_admin");
  if (!isAdmin) return new Response("Introuvable.", { status: 404 });
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const f = parseFilters(params);
  const [o, g, b, d, c, orgs] = await Promise.all([loadOverview(f), loadGeo(f), loadBehavior(f), loadDevices(f), loadConversion(f), loadOrganizations(f)]);
  if (!o || !g || !b || !d || !c || !orgs) return new Response("Statistiques indisponibles.", { status: 500 });

  const fr = (s: string) => new Date(s).toLocaleDateString("fr-FR");
  const filtersText = [f.country ? `pays : ${countryName(f.country)}` : null, f.device ? `appareil : ${DEVICE_LABELS[f.device]}` : null].filter(Boolean).join(", ");
  const period = `Période du ${fr(f.from)} au ${fr(f.to)}${filtersText ? ` (${filtersText})` : ""}`;
  const dict = (m: Record<string, number>, labels: Record<string, string>) => Object.entries(m).sort((a, b2) => b2[1] - a[1]).map(([k, v]) => [labels[k] ?? k, v]);
  const evo = (cur: number, prev: number) => {
    const x = delta(cur, prev);
    return x === null ? "—" : `${x >= 0 ? "+" : ""}${x} %`;
  };

  const sections: ReportSection[] = [
    {
      title: "Vue d'ensemble",
      header: ["Indicateur", "Période", "Période précédente", "Évolution"],
      rows: [
        ["Visiteurs", o.visitors, o.previous.visitors, evo(o.visitors, o.previous.visitors)],
        ["Visites", o.sessions, o.previous.sessions, evo(o.sessions, o.previous.sessions)],
        ["Pages vues", o.pageviews, o.previous.pageviews, evo(o.pageviews, o.previous.pageviews)],
        ["Visites avec conversion", o.conversions, o.previous.conversions, evo(o.conversions, o.previous.conversions)],
        ["Durée moyenne d'une page", fmtDuration(o.avg_duration_ms), "", ""],
        ["Visites d'une seule page (%)", o.bounce_rate ?? "—", "", ""],
        ["Nouveaux visiteurs (avec consentement)", o.new_sessions, "", ""],
        ["Visiteurs qui reviennent (avec consentement)", o.returning_sessions, "", ""],
      ],
    },
    { title: "Jour par jour", header: ["Jour", "Visiteurs", "Visites", "Pages vues"], rows: o.by_day.map((x) => [fr(x.day), x.visitors, x.sessions, x.pageviews]) },
    { title: "Pays", header: ["Pays", "Visiteurs", "Visites", "Conversions"], rows: g.countries.map((x) => [countryName(x.country), x.visitors, x.sessions, x.conversions]) },
    { title: "Villes", header: ["Ville", "Pays", "Visiteurs"], rows: g.cities.map((x) => [x.city, x.country, x.visitors]) },
    { title: "Pages consultées", header: ["Page", "Vues", "Visites", "Temps moyen"], rows: b.pages.map((x) => [x.path, x.views, x.sessions, fmtDuration(x.avg_duration_ms)]) },
    { title: "Boutons cliqués", header: ["Bouton", "Page", "Clics"], rows: b.clicks.map((x) => [x.label, x.path, x.clicks]) },
    { title: "Liens visités", header: ["Lien", "Libellé", "Clics"], rows: b.links.map((x) => [x.target, x.label ?? "", x.clicks]) },
    { title: "Pages de sortie", header: ["Page", "Visites"], rows: b.exits.map((x) => [x.path, x.sessions]) },
    { title: "Parcours (3 premières pages)", header: ["Parcours", "Visites"], rows: b.routes.map((x) => [x.route, x.sessions]) },
    { title: "Origine des visites", header: ["Source", "Visites"], rows: b.referrers.map((x) => [x.source, x.sessions]) },
    { title: "Appareils", header: ["Type", "Visites"], rows: dict(d.devices, DEVICE_LABELS) },
    { title: "Systèmes", header: ["Système", "Visites"], rows: dict(d.os, OS_LABELS) },
    { title: "Navigateurs", header: ["Navigateur", "Visites"], rows: dict(d.browsers, BROWSER_LABELS) },
    {
      title: "Conversion",
      header: ["Indicateur", "Nombre"],
      rows: [
        ["Taux de conversion des visites (%)", pct(c.converted_sessions, c.sessions)],
        ["Inscription commencée (visites)", c.signup_started_sessions],
        ...Object.entries(c.events).map(([k, v]) => [`${CONVERSION_LABELS[k] ?? k} (visites)`, v] as [string, number]),
        ["Demandes de démonstration reçues", c.business.demo_requests],
        ["Demandes de contact reçues", c.business.contact_requests],
        ["Demandes d'information Discover", c.business.discover_requests],
        ["Inscriptions terminées (établissements créés)", c.business.signups_completed],
        ["Abonnements payés", c.business.paid_subscriptions],
        ["Comptes particuliers créés", c.business.public_accounts],
      ],
    },
    { title: "Utilisation des modules (établissements)", header: ["Module", "Vues", "Établissements", "Utilisateurs"], rows: orgs.modules.map((m) => [appModuleLabel(m.module), m.views, m.organizations, m.users]) },
    {
      title: "Activité par établissement",
      header: ["Établissement", "Connexions", "Actions", "Pages vues", "Dernière connexion"],
      rows: orgs.rows.map((r) => [r.name, r.logins, r.actions, r.page_views, r.last_login ? fr(r.last_login) : "Jamais"]),
    },
  ];

  const stamp = `${f.from}_${f.to}`;
  if (params.format === "pdf") {
    const pdf = await renderToBuffer(
      <Document title="Rapport Analytics NeoScool">
        <AnalyticsReportPage title="Rapport Analytics — NeoScool" period={period} generatedAt={new Date().toLocaleString("fr-FR")} sections={sections} />
      </Document>,
    );
    return pdfResponse(pdf, `analytics-${stamp}`, true);
  }
  const sheetName = (s: string) => s.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
  const xlsx = buildXlsx(sections.map((s) => ({ name: sheetName(s.title), rows: [s.header, ...s.rows], autoFilter: s.rows.length > 0, widths: s.header.map((_, i) => (i === 0 ? 42 : 16)) })));
  return new Response(new Uint8Array(xlsx), {
    headers: { "Content-Type": XLSX_MIME, "Content-Disposition": `attachment; filename="analytics-${stamp}.xlsx"`, "Cache-Control": "private, no-store" },
  });
}
