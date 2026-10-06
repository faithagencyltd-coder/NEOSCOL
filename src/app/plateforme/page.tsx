import { Activity, Bell, Building2, CalendarClock, CircleAlert, CircleCheck, Gem, ShieldAlert, Sparkles, TrendingUp, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { SUBSCRIPTION_STATUS } from "@/features/billing/constants";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { setOrganizationStatus } from "@/features/platform/actions";
import { AddAdminDialog, CreateOrganizationDialog } from "@/features/platform/components/org-dialogs";
import { ORG_TYPE_LABELS } from "@/features/platform/org-types";
import { requireSession } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils/format";

type Dashboard = {
  organizations: { total: number; active: number; suspended: number; demo: number; new_30d: number; new_7d: number };
  users: { total: number; logins_today: number; online_estimate: number; failed_logins_24h: number };
  subscriptions: { active: number; trialing: number; unpaid: number; ended: number };
  expiring: { id: string; name: string; status: string; ends_at: string }[];
  alerts: { level: "danger" | "warning" | "info"; title: string; href: string }[];
};

const ALERT_TONES: Record<string, string> = {
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
};

export const metadata: Metadata = { title: { absolute: "Établissements · NeoScool Console" } };

/** Console du Super Administrateur : tous les établissements de la plateforme. */
export default async function PlatformPage() {
  await requireSession();
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) notFound();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: orgs }, { data: subs }, { data: dashboard }, { data: summary }] = await Promise.all([
    supabase.rpc("platform_overview"),
    supabase.from("subscriptions").select("organization_id, status, is_demo, plan:subscription_plans(name)"),
    supabase.rpc("platform_dashboard"),
    supabase.rpc("platform_revenue_summary", { p_from: `${today.slice(0, 7)}-01`, p_to: today }),
  ]);
  const d = dashboard as unknown as Dashboard;
  const revenue = ((summary as { totals?: { currency: string; amount: number }[] } | null)?.totals ?? []);
  const rows = orgs ?? [];
  const subscriptionOf = new Map((subs ?? []).map((s) => [s.organization_id, s]));
  const total = (key: "students" | "staff" | "members") => rows.reduce((sum, o) => sum + Number(o[key]), 0);

  return (
    <div className="grid gap-6">
        <section className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicateurs">
          <StatCard label="Établissements" value={{ count: d.organizations.total }} hint={`${d.organizations.active} actif(s) · ${d.organizations.suspended} suspendu(s)`} icon={Building2} />
          <StatCard label="Nouveaux (30 jours)" value={{ count: d.organizations.new_30d }} hint={`${d.organizations.new_7d} cette semaine`} icon={Sparkles} tone="info" />
          <StatCard label="Utilisateurs" value={{ count: d.users.total }} hint={`${formatNumber(total("students"))} élève(s) · ${formatNumber(total("staff"))} personnel`} icon={Users} />
          <StatCard label="Connectés aujourd'hui" value={{ count: d.users.logins_today }} hint={`≈ ${d.users.online_estimate} actif(s) ces 15 dernières minutes`} icon={Activity} tone="success" />
          <StatCard label="Abonnements actifs" value={{ count: d.subscriptions.active }} hint={`${d.subscriptions.trialing} en essai`} icon={Gem} tone="success" />
          <StatCard label="Impayés ou restreints" value={{ count: d.subscriptions.unpaid }} hint={`${d.subscriptions.ended} résilié(s) ou expiré(s)`} icon={CircleAlert} tone={d.subscriptions.unpaid ? "danger" : "primary"} />
          <StatCard
            label="Revenus du mois"
            value={revenue[0] ? { amount: Number(revenue[0].amount), currency: revenue[0].currency } : "0"}
            hint={revenue.length > 1 ? revenue.slice(1).map((r) => formatMoney(Number(r.amount), r.currency)).join(" · ") : "Abonnements NeoScool encaissés (hors frais de scolarité)"}
            icon={TrendingUp}
            tone="primary"
          />
          <StatCard label="Échecs de connexion (24 h)" value={{ count: d.users.failed_logins_24h }} hint="Détail dans Sécurité" icon={ShieldAlert} tone={d.users.failed_logins_24h ? "warning" : "primary"} />
        </section>
        <section className="grid gap-4 lg:grid-cols-2" aria-label="Alertes et échéances">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="size-5 text-primary" aria-hidden /> Alertes ({d.alerts.length})
              </CardTitle>
              <CardDescription>Calculées à l&apos;instant sur les données réelles.</CardDescription>
            </CardHeader>
            <CardContent>
              {d.alerts.length ? (
                <ul className="grid gap-2" data-testid="dashboard-alerts">
                  {d.alerts.map((a) => (
                    <li key={a.title}>
                      <Link href={a.href} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium hover:opacity-90 ${ALERT_TONES[a.level] ?? ALERT_TONES.info}`}>
                        <CircleAlert className="size-4 shrink-0" aria-hidden /> {a.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 text-sm text-success">
                  <CircleCheck className="size-4" aria-hidden /> Aucune alerte : la plateforme fonctionne normalement.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="size-5 text-primary" aria-hidden /> Échéances des 30 prochains jours
              </CardTitle>
              <CardDescription>Abonnements et essais qui arrivent à leur terme.</CardDescription>
            </CardHeader>
            <CardContent>
              {d.expiring.length ? (
                <ul className="grid gap-1.5 text-sm">
                  {d.expiring.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3">
                      <Link href={`/plateforme/etablissements/${e.id}`} className="font-medium hover:text-primary">
                        {e.name}
                      </Link>
                      <span className="text-muted-foreground">
                        {e.status === "TRIALING" ? "Essai" : "Abonnement"} · {formatDate(e.ends_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Aucune échéance dans les 30 prochains jours.</p>
              )}
            </CardContent>
          </Card>
        </section>
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
            <h2 className="font-semibold">Tous les établissements</h2>
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
                        {o.code} · {o.city ?? "—"} · créé le {formatDate(o.created_at)}
                        {o.is_demo ? " · démonstration" : ""}
                      </span>
                    </span>
                  </TD>
                  <TD>{ORG_TYPE_LABELS[o.type] ?? o.type}</TD>
                  <TD className="tabular-nums">{formatNumber(Number(o.students))}</TD>
                  <TD className="tabular-nums">{formatNumber(Number(o.staff))}</TD>
                  <TD className="tabular-nums">
                    {formatNumber(Number(o.members))} <span className="text-xs text-muted-foreground">({Number(o.admins)} admin.)</span>
                  </TD>
                  <TD>
                    {subscriptionOf.get(o.id) ? (
                      <span className="grid gap-0.5">
                        <span className="text-xs">{subscriptionOf.get(o.id)?.plan?.name}</span>
                        {subscriptionOf.get(o.id)?.is_demo ? <Badge>Démonstration</Badge> : <StatusBadge value={subscriptionOf.get(o.id)!.status} map={SUBSCRIPTION_STATUS} />}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD>{o.status === "active" ? <Badge tone="success">Actif</Badge> : <Badge tone="danger">Suspendu</Badge>}</TD>
                  <TD>
                    <span className="flex justify-end gap-2">
                      <Button asChild size="sm" variant="secondary">
                        <a href={`/plateforme/etablissements/${o.id}`}>Fonctionnalités</a>
                      </Button>
                      <AddAdminDialog organizationId={o.id} name={o.name} />
                      <ConfirmAction
                        trigger={
                          <Button size="sm" variant={o.status === "active" ? "ghost" : "secondary"} className={o.status === "active" ? "text-danger" : undefined}>
                            {o.status === "active" ? "Suspendre" : "Réactiver"}
                          </Button>
                        }
                        title={o.status === "active" ? `Suspendre ${o.name} ?` : `Réactiver ${o.name} ?`}
                        description={o.status === "active" ? "Tous ses utilisateurs perdent immédiatement l'accès ; aucune donnée n'est supprimée." : undefined}
                        confirmLabel={o.status === "active" ? "Suspendre" : "Réactiver"}
                        tone={o.status === "active" ? "danger" : "primary"}
                        action={setOrganizationStatus}
                        fields={{ organization_id: o.id, status: o.status === "active" ? "suspended" : "active" }}
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
