import { AlertTriangle, CircleCheck, Clock, LifeBuoy, UserX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { createPlatformIncident } from "@/features/support/actions";
import { options, TICKET_CATEGORIES, TICKET_SEVERITIES, TICKET_STATUSES } from "@/features/support/constants";
import { canWritePlatform, getPlatformRole } from "@/lib/auth/platform";
import { createClient } from "@/lib/supabase/server";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Assistance et incidents — Plateforme" };

type Overview = { open: number; critical_open: number; unassigned: number; resolved_30d: number; avg_resolution_hours: number | null; recurring: { category: string; n: number; organizations: number }[] };

/** Centre d'assistance : demandes des établissements et incidents de la plateforme. */
export default async function PlatformIncidentsPage({ searchParams }: PageProps<"/plateforme/incidents">) {
  const params = await searchParams;
  const status = param(params, "statut") ?? "actives";
  const severity = param(params, "gravite");
  const org = param(params, "etablissement");
  const supabase = await createClient();
  let query = supabase
    .from("support_tickets")
    .select("id, number, kind, title, category, severity, status, created_at, updated_at, assigned_to, organization:organizations(name)")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (status === "actives") query = query.in("status", ["open", "in_progress", "waiting"]);
  else if (status in TICKET_STATUSES) query = query.eq("status", status);
  if (severity && severity in TICKET_SEVERITIES) query = query.eq("severity", severity);
  if (isUuid(org)) query = query.eq("organization_id", org);
  const [{ data: tickets }, { data: overview }, { data: orgs }, role] = await Promise.all([
    query,
    supabase.rpc("platform_support_overview"),
    supabase.from("organizations").select("id, name").order("name"),
    getPlatformRole(),
  ]);
  const o = (overview ?? { open: 0, critical_open: 0, unassigned: 0, resolved_30d: 0, avg_resolution_hours: null, recurring: [] }) as unknown as Overview;

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-2xl font-bold">Assistance et incidents</h2>
          <p className="text-sm text-muted-foreground">Demandes envoyées par les établissements (menu « Assistance ») et incidents déclarés par l&apos;équipe. Aucune demande n&apos;est inventée.</p>
        </div>
        {canWritePlatform(role) ? (
          <QuickFormDialog
            title="Déclarer un incident"
            description="Panne, interruption, problème touchant un ou plusieurs établissements."
            triggerLabel="Déclarer un incident"
            action={createPlatformIncident}
            fields={[
              { name: "title", label: "Titre", type: "text", required: true, wide: true },
              { name: "category", label: "Catégorie", type: "select", required: true, options: options(TICKET_CATEGORIES), defaultValue: "bug" },
              { name: "severity", label: "Gravité", type: "select", required: true, options: options(TICKET_SEVERITIES), defaultValue: "high" },
              { name: "organization_id", label: "Établissement concerné (facultatif)", type: "select", options: (orgs ?? []).map((x) => ({ value: x.id, label: x.name })), wide: true },
              { name: "description", label: "Description", type: "textarea", required: true, wide: true },
            ]}
          />
        ) : null}
      </div>

      <section className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicateurs">
        <StatCard label="Demandes actives" value={{ count: o.open }} hint={`${o.unassigned} non prise(s) en charge`} icon={LifeBuoy} />
        <StatCard label="Urgentes (élevée / critique)" value={{ count: o.critical_open }} icon={AlertTriangle} tone={o.critical_open ? "danger" : "primary"} />
        <StatCard label="Résolues (30 jours)" value={{ count: o.resolved_30d }} icon={CircleCheck} tone="success" />
        <StatCard label="Délai moyen de résolution" value={o.avg_resolution_hours == null ? "—" : `${o.avg_resolution_hours} h`} icon={Clock} tone="info" />
      </section>

      {o.recurring.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserX className="size-5 text-warning" aria-hidden /> Problèmes récurrents (30 jours)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {o.recurring.map((r) => (
              <Badge key={r.category} tone="warning">
                {TICKET_CATEGORIES[r.category] ?? r.category} : {r.n} demande(s), {r.organizations} établissement(s)
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm font-medium">
              Statut
              <Select name="statut" defaultValue={status} className="w-48">
                <option value="actives">Actives</option>
                {Object.entries(TICKET_STATUSES).map(([v, s]) => (
                  <option key={v} value={v}>
                    {s.label}
                  </option>
                ))}
                <option value="toutes">Toutes</option>
              </Select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Gravité
              <Select name="gravite" defaultValue={severity ?? ""} className="w-40">
                <option value="">Toutes</option>
                {Object.entries(TICKET_SEVERITIES).map(([v, s]) => (
                  <option key={v} value={v}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Établissement
              <Select name="etablissement" defaultValue={isUuid(org) ? org : ""} className="w-64">
                <option value="">Tous</option>
                {(orgs ?? []).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </label>
            <Button type="submit" variant="secondary">
              Filtrer
            </Button>
          </form>
        </CardHeader>
        {(tickets ?? []).length === 0 ? (
          <CardContent>
            <EmptyState icon={LifeBuoy} title="Aucune demande pour ces filtres" />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr className="border-t border-border">
                <TH>N°</TH>
                <TH>Sujet</TH>
                <TH>Établissement</TH>
                <TH>Gravité</TH>
                <TH>Statut</TH>
                <TH>Mise à jour</TH>
              </tr>
            </THead>
            <tbody>
              {(tickets ?? []).map((t) => (
                <TR key={t.id} data-testid="ticket-row">
                  <TD className="tabular-nums">{t.number}</TD>
                  <TD>
                    <Link href={`/plateforme/incidents/${t.id}`} className="font-medium hover:text-primary">
                      {t.title}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {t.kind === "incident" ? "Incident plateforme · " : ""}
                      {TICKET_CATEGORIES[t.category]}
                      {t.assigned_to ? "" : " · non pris en charge"}
                    </span>
                  </TD>
                  <TD className="text-xs">{(t.organization as { name: string } | null)?.name ?? "Plateforme"}</TD>
                  <TD>
                    <Badge tone={TICKET_SEVERITIES[t.severity]?.tone}>{TICKET_SEVERITIES[t.severity]?.label}</Badge>
                  </TD>
                  <TD>
                    <Badge tone={TICKET_STATUSES[t.status]?.tone}>{TICKET_STATUSES[t.status]?.label}</Badge>
                  </TD>
                  <TD className="text-xs">{new Date(t.updated_at).toLocaleString("fr-FR")}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
