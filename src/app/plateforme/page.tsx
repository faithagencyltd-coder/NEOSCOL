import {
  Activity,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CreditCard,
  FileBarChart,
  Gem,
  GraduationCap,
  HandCoins,
  Handshake,
  Plus,
  Settings2,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { DailyChart, Donut } from "@/features/analytics/charts";
import { SUBSCRIPTION_STATUS } from "@/features/billing/constants";
import { setOrganizationStatus } from "@/features/platform/actions";
import {
  DashPanel,
  KpiTile,
  MiniStat,
  ModuleCard,
  QuickAction,
  QuickActionButton,
  SeeMore,
} from "@/features/platform/components/dashboard-widgets";
import {
  AddAdminDialog,
  CreateOrganizationDialog,
} from "@/features/platform/components/org-dialogs";
import { ORG_TYPE_LABELS } from "@/features/platform/org-types";
import { requireSession } from "@/lib/auth/guards";
import { displayName } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils/format";

type Dashboard = {
  organizations: {
    total: number;
    active: number;
    suspended: number;
    demo: number;
    new_30d: number;
    new_7d: number;
  };
  users: {
    total: number;
    logins_today: number;
    online_estimate: number;
    failed_logins_24h: number;
  };
  subscriptions: {
    active: number;
    trialing: number;
    unpaid: number;
    ended: number;
  };
  expiring: { id: string; name: string; status: string; ends_at: string }[];
  alerts: {
    level: "danger" | "warning" | "info";
    title: string;
    href: string;
  }[];
};

const ALERT_TONES: Record<string, string> = {
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
};
const TZ = "Africa/Abidjan";
const ago = (iso: string) => {
  const m = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 60000),
  );
  if (m < 60) return `il y a ${m} min`;
  if (m < 1440) return `il y a ${Math.round(m / 60)} h`;
  return `il y a ${Math.round(m / 1440)} j`;
};

export const metadata: Metadata = {
  title: { absolute: "Établissements · NeoScool Console" },
};

/** Console du Super Administrateur : tableau de bord et tous les établissements de la plateforme. */
export default async function PlatformPage() {
  const context = await requireSession();
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) notFound();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const [
    { data: orgs },
    { data: subs },
    { data: dashboard },
    { data: summary },
    { data: affiliate },
    { data: tutorRules },
    { data: tutor },
    { data: activity },
  ] = await Promise.all([
    supabase.rpc("platform_overview"),
    supabase
      .from("subscriptions")
      .select(
        "organization_id, status, is_demo, plan:subscription_plans(name)",
      ),
    supabase.rpc("platform_dashboard"),
    supabase.rpc("platform_revenue_summary", {
      p_from: `${today.slice(0, 7)}-01`,
      p_to: today,
    }),
    supabase
      .from("affiliate_settings")
      .select("enabled")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("platform_feature_rules")
      .select("scope, enabled, until")
      .eq("feature_key", "tutor_match"),
    supabase
      .from("tutor_settings")
      .select("suggestions_enabled")
      .eq("id", 1)
      .maybeSingle(),
    supabase.rpc("platform_activity_log", { p_limit: 5, p_offset: 0 }),
  ]);
  const d = dashboard as unknown as Dashboard;
  const revenue =
    (summary as { totals?: { currency: string; amount: number }[] } | null)
      ?.totals ?? [];
  const rows = orgs ?? [];
  const subscriptionOf = new Map(
    (subs ?? []).map((s) => [s.organization_id, s]),
  );
  const total = (key: "students" | "staff" | "members") =>
    rows.reduce((sum, o) => sum + Number(o[key]), 0);

  // État réel des modules (Affiliation : réglage ; Tutor Match : règles du Contrôle des modules).
  const liveRules = (tutorRules ?? []).filter(
    (r) => !r.until || new Date(r.until) > now,
  );
  const tutorGlobal =
    liveRules.find((r) => r.scope === "global")?.enabled === true;
  const tutorPartial = !tutorGlobal && liveRules.some((r) => r.enabled);
  const healthy = !d.alerts.some((a) => a.level === "danger");

  // Évolution réelle : établissements créés sur 90 jours (cumul et nouveaux par jour).
  const days = Array.from({ length: 90 }, (_, i) =>
    new Date(now.getTime() - (89 - i) * 86_400_000).toISOString().slice(0, 10),
  );
  const createdOn = new Map<string, number>();
  for (const o of rows)
    createdOn.set(
      o.created_at.slice(0, 10),
      (createdOn.get(o.created_at.slice(0, 10)) ?? 0) + 1,
    );
  const before = rows.filter(
    (o) => o.created_at.slice(0, 10) < days[0]!,
  ).length;
  let running = before;
  const cumulative = days.map((day) => (running += createdOn.get(day) ?? 0));
  const byType = Object.entries(
    rows.reduce<Record<string, number>>(
      (acc, o) => ({ ...acc, [o.type]: (acc[o.type] ?? 0) + 1 }),
      {},
    ),
  )
    .sort((a, b) => b[1] - a[1])
    .map(([type, value]) => ({ label: ORG_TYPE_LABELS[type] ?? type, value }));
  const latest = [...rows]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-w-0 content-start gap-6">
          {/* Bienvenue */}
          <section
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#07142b] via-[#0b2559] to-[#0e4a9a] p-6 text-white shadow-[0_20px_40px_-24px_rgba(7,20,43,0.9)] sm:p-7"
            aria-label="Bienvenue"
          >
            <div
              className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-[#1d63ed]/35 blur-3xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-28 left-1/3 size-64 rounded-full bg-cyan-400/15 blur-3xl"
              aria-hidden
            />
            <div className="relative grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="grid gap-1.5">
                <h1
                  className="text-2xl font-bold tracking-tight sm:text-[1.7rem]"
                  data-testid="console-welcome"
                >
                  Bonjour, {displayName(context)}
                </h1>
                <p className="font-medium text-cyan-200">
                  Super Admin — Plateforme NeoScool
                </p>
                <p className="max-w-xl text-sm text-white/75">
                  Établissements, abonnements, paiements, formules, intégrations
                  et sécurité. Les données de chaque établissement restent
                  strictement séparées.
                </p>
              </div>
              <div className="grid gap-2 rounded-2xl border border-white/15 bg-white/[0.06] p-4 backdrop-blur-sm md:min-w-56">
                <p className="text-sm text-white/80 first-letter:uppercase">
                  {now.toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    timeZone: TZ,
                  })}
                </p>
                <p className="text-xs text-white/60">
                  Données à{" "}
                  {now.toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: TZ,
                  })}{" "}
                  (GMT)
                </p>
                <span
                  className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${healthy ? "bg-emerald-400/15 text-emerald-200" : "bg-amber-400/15 text-amber-200"}`}
                >
                  <span
                    className={`size-1.5 rounded-full ${healthy ? "bg-emerald-300" : "bg-amber-300"}`}
                    aria-hidden
                  />
                  {healthy
                    ? "Système opérationnel"
                    : "Points d'attention ci-dessous"}
                </span>
              </div>
            </div>
          </section>

          {/* Indicateurs clés */}
          <section className="grid gap-3" aria-label="Indicateurs">
            <div className="stagger grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
              <KpiTile
                label="Établissements"
                value={{ count: d.organizations.total }}
                hint={`${d.organizations.active} actif(s) · +${d.organizations.new_30d} sur 30 jours`}
                icon={Building2}
                tone="blue"
              />
              <KpiTile
                label="Élèves et apprenants"
                value={{ count: total("students") }}
                hint={`${formatNumber(d.users.total)} utilisateur(s) au total`}
                icon={UserRound}
                tone="orange"
              />
              <KpiTile
                label="Personnel et enseignants"
                value={{ count: total("staff") }}
                hint={`${formatNumber(total("members"))} compte(s) rattaché(s)`}
                icon={Users}
                tone="sky"
              />
              <KpiTile
                label="Revenus du mois"
                value={
                  revenue[0]
                    ? {
                        amount: Number(revenue[0].amount),
                        currency: revenue[0].currency,
                      }
                    : { amount: 0, currency: "XOF" }
                }
                hint={
                  revenue.length > 1
                    ? revenue
                        .slice(1)
                        .map((r) => formatMoney(Number(r.amount), r.currency))
                        .join(" · ")
                    : "Abonnements NeoScool encaissés (hors frais de scolarité)"
                }
                icon={TrendingUp}
                tone="violet"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <MiniStat
                label="Nouveaux (7 jours)"
                value={formatNumber(d.organizations.new_7d)}
              />
              <MiniStat
                label="Connectés aujourd'hui"
                value={formatNumber(d.users.logins_today)}
                tone="success"
              />
              <MiniStat
                label="Actifs (15 min)"
                value={`≈ ${formatNumber(d.users.online_estimate)}`}
                tone="success"
              />
              <MiniStat
                label="Abonnements actifs"
                value={`${formatNumber(d.subscriptions.active)} · ${formatNumber(d.subscriptions.trialing)} essai`}
                tone="success"
                href="/plateforme/abonnements"
              />
              <MiniStat
                label="Impayés ou restreints"
                value={formatNumber(d.subscriptions.unpaid)}
                tone={d.subscriptions.unpaid ? "danger" : "neutral"}
                href="/plateforme/abonnements"
              />
              <MiniStat
                label="Échecs de connexion (24 h)"
                value={formatNumber(d.users.failed_logins_24h)}
                tone={d.users.failed_logins_24h ? "warning" : "neutral"}
                href="/plateforme/securite"
              />
            </div>
          </section>

          {/* Gestion des modules */}
          <DashPanel
            title="Gestion des modules"
            subtitle="État réel de chaque module. L'activation se règle dans sa page ou dans le Contrôle des modules."
            action={{
              href: "/plateforme/modules",
              label: "Contrôle des modules",
            }}
            testId="dashboard-modules"
          >
            <div className="grid gap-3 md:grid-cols-3">
              <ModuleCard
                title="NEOSCOOL Affiliates"
                description="Programme de recommandation de NeoScool aux établissements."
                icon={HandCoins}
                tone="blue"
                isNew
                state={affiliate?.enabled ? "on" : "off"}
                stateLabel={affiliate?.enabled ? "Actif" : "Inactif"}
                configureHref="/plateforme/affiliation?onglet=reglages"
                statsHref="/plateforme/affiliation"
                testId="module-card-affiliates"
              />
              <ModuleCard
                title="NEOSCOOL Tutor Match"
                description="Soutien scolaire : mise en relation des familles avec des tuteurs."
                icon={GraduationCap}
                tone="violet"
                isNew
                state={tutorGlobal ? "on" : tutorPartial ? "partial" : "off"}
                stateLabel={
                  tutorGlobal
                    ? "Ouvert partout"
                    : tutorPartial
                      ? "Ouvert en partie (pays, type ou pilote)"
                      : "Fermé"
                }
                configureHref="/plateforme/modules"
                statsHref="/plateforme/tutorat"
                testId="module-card-tutor"
              />
              <ModuleCard
                title="Recommandations de soutien scolaire"
                description="Suggestions facultatives fondées sur les bulletins publiés."
                icon={Sparkles}
                tone="green"
                state={tutor?.suggestions_enabled ? "on" : "off"}
                stateLabel={
                  tutor?.suggestions_enabled ? "Actives" : "Inactives"
                }
                configureHref="/plateforme/tutorat?onglet=reglages"
                statsHref="/plateforme/tutorat"
                testId="module-card-suggestions"
              />
            </div>
          </DashPanel>

          {/* Vue d'ensemble */}
          <DashPanel
            title="Vue d'ensemble de la plateforme"
            subtitle="Calculée sur les établissements réellement inscrits."
            action={{
              href: "/plateforme/analyses",
              label: "Analyses détaillées",
            }}
          >
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div className="grid gap-2">
                <p className="text-sm font-medium">
                  Établissements inscrits (90 derniers jours)
                </p>
                <DailyChart
                  days={days}
                  series={[
                    {
                      label: "Total des établissements",
                      color: "#1d63ed",
                      values: cumulative,
                    },
                    {
                      label: "Nouveaux par jour",
                      color: "#f59e0b",
                      values: days.map((day) => createdOn.get(day) ?? 0),
                    },
                  ]}
                />
              </div>
              <div className="grid content-start gap-2">
                <p className="text-sm font-medium">
                  Répartition par type d&apos;établissement
                </p>
                <Donut rows={byType} centerLabel="établissements" />
              </div>
            </div>
          </DashPanel>

          <section
            className="grid gap-4 lg:grid-cols-2"
            aria-label="Alertes et échéances"
          >
            <DashPanel
              title={`Alertes (${d.alerts.length})`}
              subtitle="Calculées à l'instant sur les données réelles."
            >
              {d.alerts.length ? (
                <ul className="grid gap-2" data-testid="dashboard-alerts">
                  {d.alerts.map((a) => (
                    <li key={a.title}>
                      <Link
                        href={a.href}
                        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium hover:opacity-90 ${ALERT_TONES[a.level] ?? ALERT_TONES.info}`}
                      >
                        <CircleAlert className="size-4 shrink-0" aria-hidden />{" "}
                        {a.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 text-sm text-success">
                  <CircleCheck className="size-4" aria-hidden /> Aucune alerte :
                  la plateforme fonctionne normalement.
                </p>
              )}
            </DashPanel>
            <DashPanel
              title="Échéances des 30 prochains jours"
              subtitle="Abonnements et essais qui arrivent à leur terme."
            >
              {d.expiring.length ? (
                <ul className="grid gap-1.5 text-sm">
                  {d.expiring.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-muted"
                    >
                      <Link
                        href={`/plateforme/etablissements/${e.id}`}
                        className="flex items-center gap-2 font-medium hover:text-primary"
                      >
                        <CalendarClock
                          className="size-4 text-primary"
                          aria-hidden
                        />{" "}
                        {e.name}
                      </Link>
                      <span className="text-muted-foreground">
                        {e.status === "TRIALING" ? "Essai" : "Abonnement"} ·{" "}
                        {formatDate(e.ends_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aucune échéance dans les 30 prochains jours.
                </p>
              )}
            </DashPanel>
          </section>
        </div>

        {/* Colonne de droite */}
        <aside
          className="grid content-start gap-6"
          aria-label="Raccourcis et activité"
        >
          <DashPanel title="Actions rapides">
            <div className="grid grid-cols-3 gap-2">
              <CreateOrganizationDialog
                trigger={
                  <QuickActionButton
                    label="Ajouter un établissement"
                    icon={Plus}
                    tone="blue"
                  />
                }
              />
              <QuickAction
                href="/plateforme/affiliation?onglet=affilies"
                label="Gérer les affiliés"
                icon={HandCoins}
                tone="violet"
              />
              <QuickAction
                href="/plateforme/tutorat?onglet=tuteurs"
                label="Gérer les tuteurs"
                icon={GraduationCap}
                tone="green"
              />
              <QuickAction
                href="/plateforme/paiements"
                label="Voir les transactions"
                icon={CreditCard}
                tone="orange"
              />
              <QuickAction
                href="/plateforme/revenus"
                label="Rapports et exports"
                icon={FileBarChart}
                tone="sky"
              />
              <QuickAction
                href="/plateforme/modules"
                label="Paramètres des modules"
                icon={Settings2}
                tone="red"
              />
            </div>
          </DashPanel>

          <DashPanel
            title="Activité récente"
            action={{ href: "/plateforme/journal", label: "Voir tout" }}
            testId="dashboard-activity"
          >
            {(activity ?? []).length ? (
              <ul className="grid gap-3">
                {(activity ?? []).map((a) => (
                  <li key={a.id} className="flex gap-3">
                    <span
                      className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${a.severity === "critical" || a.result === "failure" ? "bg-danger-soft text-danger" : a.severity === "warning" ? "bg-warning-soft text-warning" : "bg-primary-soft text-primary"}`}
                    >
                      {a.severity === "critical" || a.result === "failure" ? (
                        <ShieldAlert className="size-4" aria-hidden />
                      ) : (
                        <Activity className="size-4" aria-hidden />
                      )}
                    </span>
                    <span className="grid min-w-0 gap-0.5">
                      <span className="line-clamp-2 text-sm font-medium">
                        {a.summary}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {a.organization_name ?? "Plateforme"} ·{" "}
                        {ago(a.created_at)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucune activité enregistrée.
              </p>
            )}
          </DashPanel>

          <DashPanel
            title="Derniers établissements"
            action={{ href: "#tous-les-etablissements", label: "Voir tout" }}
          >
            <ul className="grid gap-2.5">
              {latest.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/plateforme/etablissements/${o.id}`}
                    className="flex items-center gap-3 rounded-xl p-1.5 hover:bg-surface-muted"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <Building2 className="size-4" aria-hidden />
                    </span>
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-sm font-medium">
                        {o.name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {o.city ?? "—"} · {formatDate(o.created_at)}
                      </span>
                    </span>
                    {o.status === "active" ? (
                      <Badge tone="success">Actif</Badge>
                    ) : (
                      <Badge tone="danger">Suspendu</Badge>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </DashPanel>

          <DashPanel
            title="Abonnements"
            action={{ href: "/plateforme/abonnements", label: "Gérer" }}
          >
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2 text-success">
                <Gem className="size-4" aria-hidden />{" "}
                {formatNumber(d.subscriptions.active)} actif(s)
              </span>
              <span className="flex items-center gap-2 rounded-xl bg-info-soft px-3 py-2 text-info">
                <Sparkles className="size-4" aria-hidden />{" "}
                {formatNumber(d.subscriptions.trialing)} en essai
              </span>
              <span className="flex items-center gap-2 rounded-xl bg-danger-soft px-3 py-2 text-danger">
                <CircleAlert className="size-4" aria-hidden />{" "}
                {formatNumber(d.subscriptions.unpaid)} impayé(s)
              </span>
              <span className="flex items-center gap-2 rounded-xl bg-surface-muted px-3 py-2 text-muted-foreground">
                <Bell className="size-4" aria-hidden />{" "}
                {formatNumber(d.subscriptions.ended)} terminé(s)
              </span>
            </div>
          </DashPanel>
        </aside>
      </div>

      {/* Écosystème */}
      <section
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-[#0b2559] via-[#0e4a9a] to-[#1d63ed] px-6 py-5 text-white"
        aria-label="Écosystème NeoScool"
      >
        <div className="flex items-center gap-4">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-white/10">
            <Handshake className="size-6" aria-hidden />
          </span>
          <div>
            <p className="font-semibold">
              NEOSCOOL : plus qu&apos;une plateforme, un écosystème éducatif
            </p>
            <p className="text-sm text-white/75">
              Affiliation · Tutorat · Analytics · Annuaire et opportunités ·
              Gestion centralisée
            </p>
          </div>
        </div>
        <SeeMore href="/plateforme/ecosysteme">Voir l&apos;écosystème</SeeMore>
      </section>

      <Card
        className="overflow-hidden rounded-2xl"
        id="tous-les-etablissements"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-4 sm:px-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Building2 className="size-5 text-primary" aria-hidden /> Tous les
            établissements{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({rows.length})
            </span>
          </h2>
          <CreateOrganizationDialog />
        </div>
        <Table>
          <THead>
            <tr>
              <TH>Établissement</TH>
              <TH>Type</TH>
              <TH>Élèves</TH>
              <TH>Personnel</TH>
              <TH>Comptes</TH>
              <TH>Abonnement</TH>
              <TH>Statut</TH>
              <TH className="text-right">Actions</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((o) => (
              <TR key={o.id}>
                <TD>
                  <span className="grid">
                    <span className="font-semibold">{o.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {o.code} · {o.city ?? "—"} · créé le{" "}
                      {formatDate(o.created_at)}
                      {o.is_demo ? " · démonstration" : ""}
                    </span>
                  </span>
                </TD>
                <TD>{ORG_TYPE_LABELS[o.type] ?? o.type}</TD>
                <TD className="tabular-nums">
                  {formatNumber(Number(o.students))}
                </TD>
                <TD className="tabular-nums">
                  {formatNumber(Number(o.staff))}
                </TD>
                <TD className="tabular-nums">
                  {formatNumber(Number(o.members))}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({Number(o.admins)} admin.)
                  </span>
                </TD>
                <TD>
                  {subscriptionOf.get(o.id) ? (
                    <span className="grid gap-0.5">
                      <span className="text-xs">
                        {subscriptionOf.get(o.id)?.plan?.name}
                      </span>
                      {subscriptionOf.get(o.id)?.is_demo ? (
                        <Badge>Démonstration</Badge>
                      ) : (
                        <StatusBadge
                          value={subscriptionOf.get(o.id)!.status}
                          map={SUBSCRIPTION_STATUS}
                        />
                      )}
                    </span>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD>
                  {o.status === "active" ? (
                    <Badge tone="success">Actif</Badge>
                  ) : (
                    <Badge tone="danger">Suspendu</Badge>
                  )}
                </TD>
                <TD>
                  <span className="flex justify-end gap-2">
                    <Button asChild size="sm" variant="secondary">
                      <a href={`/plateforme/etablissements/${o.id}`}>
                        Fonctionnalités{" "}
                        <ArrowUpRight className="size-3.5" aria-hidden />
                      </a>
                    </Button>
                    <AddAdminDialog organizationId={o.id} name={o.name} />
                    <ConfirmAction
                      trigger={
                        <Button
                          size="sm"
                          variant={
                            o.status === "active" ? "ghost" : "secondary"
                          }
                          className={
                            o.status === "active" ? "text-danger" : undefined
                          }
                        >
                          {o.status === "active" ? "Suspendre" : "Réactiver"}
                        </Button>
                      }
                      title={
                        o.status === "active"
                          ? `Suspendre ${o.name} ?`
                          : `Réactiver ${o.name} ?`
                      }
                      description={
                        o.status === "active"
                          ? "Tous ses utilisateurs perdent immédiatement l'accès ; aucune donnée n'est supprimée."
                          : undefined
                      }
                      confirmLabel={
                        o.status === "active" ? "Suspendre" : "Réactiver"
                      }
                      tone={o.status === "active" ? "danger" : "primary"}
                      action={setOrganizationStatus}
                      fields={{
                        organization_id: o.id,
                        status: o.status === "active" ? "suspended" : "active",
                      }}
                    />
                  </span>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
