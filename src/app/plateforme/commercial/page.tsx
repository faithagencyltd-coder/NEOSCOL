import { AlarmClock, Handshake, Target, UserX } from "lucide-react";
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
import { updateCrmLead } from "@/features/platform/crm-actions";
import { CRM_EVENT_KINDS, CRM_STATUS } from "@/features/platform/crm";
import { canWritePlatform, getPlatformRole } from "@/lib/auth/platform";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Suivi commercial — Plateforme" };

type Report = { total: number; won: number; lost: number; by_status: Record<string, number>; by_kind: Record<string, number>; by_country: { country: string; n: number; won: number }[]; overdue: number; unassigned: number };

/** Suivi commercial : prospects et demandes de démonstration venus du site, jusqu'à la conversion en établissement client. */
export default async function PlatformCommercialPage({ searchParams }: PageProps<"/plateforme/commercial">) {
  const params = await searchParams;
  const status = param(params, "statut") ?? "actifs";
  const view = param(params, "vue");
  const year = new Date().getFullYear();
  const [supabase, role, context] = await Promise.all([createClient(), getPlatformRole(), getSessionContext()]);
  let query = supabase
    .from("site_leads")
    .select("id, kind, full_name, email, phone, organization, organization_type, country, message, status, admin_note, created_at, assigned_to, next_action, next_action_at, organization_id")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status === "actifs") query = query.not("status", "in", "(won,lost,done,spam)");
  else if (status in CRM_STATUS) query = query.eq("status", status);
  if (view === "moi" && context) query = query.eq("assigned_to", context.user.id);
  if (view === "retard") query = query.lt("next_action_at", new Date().toISOString().slice(0, 10));
  const [{ data: leads }, { data: report }, { data: orgs }] = await Promise.all([
    query,
    supabase.rpc("platform_crm_report", { p_from: `${year}-01-01`, p_to: `${year}-12-31` }),
    supabase.from("organizations").select("id, name").eq("is_demo", false).order("name"),
  ]);
  const ids = (leads ?? []).map((l) => l.id);
  const { data: events } = ids.length ? await supabase.from("site_lead_events").select("lead_id, kind, body, created_at").in("lead_id", ids).order("created_at", { ascending: false }) : { data: [] };
  const r = (report ?? { total: 0, won: 0, lost: 0, by_status: {}, by_kind: {}, by_country: [], overdue: 0, unassigned: 0 }) as unknown as Report;
  const conversion = r.total ? Math.round((r.won / r.total) * 100) : 0;
  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const writable = canWritePlatform(role);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="grid gap-1">
        <h2 className="text-2xl font-bold">Suivi commercial</h2>
        <p className="text-sm text-muted-foreground">Prospects et demandes de démonstration reçus par le site NeoScool, jusqu&apos;à la signature. Les mêmes demandes restent visibles dans « Site web ».</p>
      </div>

      <section className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={`Synthèse ${year}`}>
        <StatCard label={`Prospects ${year}`} value={{ count: r.total }} hint={`${r.by_kind.demo ?? 0} démo(s), ${r.by_kind.contact ?? 0} contact(s)`} icon={Target} />
        <StatCard label="Taux de conversion" value={`${conversion} %`} hint={`${r.won} gagné(s), ${r.lost} perdu(s)`} icon={Handshake} tone="success" />
        <StatCard label="Actions en retard" value={{ count: r.overdue }} hint="Date de relance dépassée" icon={AlarmClock} tone={r.overdue ? "danger" : "primary"} />
        <StatCard label="Sans responsable" value={{ count: r.unassigned }} icon={UserX} tone={r.unassigned ? "warning" : "primary"} />
      </section>

      {r.by_country.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prospects par pays ({year})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {r.by_country.map((c) => (
              <Badge key={c.country}>
                {c.country} : {c.n} ({c.won} gagné{c.won > 1 ? "s" : ""})
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm font-medium">
              État
              <Select name="statut" defaultValue={status} className="w-52">
                <option value="actifs">En cours (non clos)</option>
                {Object.entries(CRM_STATUS).map(([v, s]) => (
                  <option key={v} value={v}>
                    {s.label}
                  </option>
                ))}
                <option value="tous">Tous</option>
              </Select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Affichage
              <Select name="vue" defaultValue={view ?? ""} className="w-52">
                <option value="">Toutes les demandes</option>
                <option value="moi">Suivies par moi</option>
                <option value="retard">Relances en retard</option>
              </Select>
            </label>
            <Button type="submit" variant="secondary">
              Filtrer
            </Button>
          </form>
        </CardHeader>
        {(leads ?? []).length === 0 ? (
          <CardContent>
            <EmptyState icon={Target} title="Aucun prospect pour ces filtres" description="Les demandes arrivent par les formulaires Contact et Démo du site." />
          </CardContent>
        ) : (
          <Table data-testid="crm-list">
            <THead>
              <tr className="border-t border-border">
                <TH>Prospect</TH>
                <TH>Demande</TH>
                <TH>État</TH>
                <TH>Prochaine action</TH>
                <TH>Historique</TH>
                {writable ? <TH /> : null}
              </tr>
            </THead>
            <tbody>
              {(leads ?? []).map((l) => {
                const history = (events ?? []).filter((e) => e.lead_id === l.id);
                const late = l.next_action_at && l.next_action_at < today && !["won", "lost", "done", "spam"].includes(l.status);
                return (
                  <TR key={l.id} data-testid="crm-row">
                    <TD>
                      <span className="grid text-sm">
                        <span className="font-semibold">{l.full_name}</span>
                        <a href={`mailto:${l.email}`} className="text-primary hover:underline">
                          {l.email}
                        </a>
                        {l.phone ? <span className="text-xs text-muted-foreground">{l.phone}</span> : null}
                        <span className="text-xs text-muted-foreground">{formatDateTime(l.created_at)}</span>
                      </span>
                    </TD>
                    <TD>
                      <span className="grid max-w-xs text-sm">
                        <span className="font-medium">
                          {l.kind === "demo" ? "Démonstration" : "Contact"}
                          {l.organization ? ` · ${l.organization}` : ""}
                          {l.country ? ` · ${l.country}` : ""}
                        </span>
                        {l.message ? <span className="line-clamp-2 text-xs text-muted-foreground">{l.message}</span> : null}
                      </span>
                    </TD>
                    <TD>
                      <span className="grid gap-1">
                        <Badge tone={CRM_STATUS[l.status]?.tone ?? "neutral"}>{CRM_STATUS[l.status]?.label ?? l.status}</Badge>
                        {l.organization_id ? (
                          <Link href={`/plateforme/etablissements/${l.organization_id}`} className="text-xs text-primary hover:underline">
                            {orgName.get(l.organization_id) ?? "Établissement"}
                          </Link>
                        ) : null}
                        {l.assigned_to ? <span className="text-xs text-muted-foreground">{l.assigned_to === context?.user.id ? "Suivi par moi" : "Suivi attribué"}</span> : null}
                      </span>
                    </TD>
                    <TD className="text-xs">
                      {l.next_action ? (
                        <span className={late ? "font-semibold text-danger" : ""}>
                          {l.next_action}
                          {l.next_action_at ? ` — ${formatDate(l.next_action_at)}` : ""}
                          {late ? " (en retard)" : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TD>
                    <TD className="max-w-xs text-xs">
                      {history.slice(0, 3).map((e, i) => (
                        <p key={i} className="truncate">
                          <span className="text-muted-foreground">{formatDate(e.created_at)} · {CRM_EVENT_KINDS[e.kind]} :</span> {e.body}
                        </p>
                      ))}
                      {history.length > 3 ? <p className="text-muted-foreground">+ {history.length - 3} autre(s)</p> : null}
                      {history.length === 0 && l.admin_note ? <p className="truncate text-muted-foreground">{l.admin_note}</p> : null}
                    </TD>
                    {writable ? (
                      <TD>
                        <QuickFormDialog
                          title={`Suivi : ${l.full_name}`}
                          description={l.message ?? undefined}
                          action={updateCrmLead}
                          hidden={{ id: l.id }}
                          trigger={
                            <Button size="sm" variant="secondary">
                              Suivre
                            </Button>
                          }
                          fields={[
                            { name: "status", label: "État", type: "select", required: true, options: Object.entries(CRM_STATUS).map(([value, s]) => ({ value, label: s.label })), defaultValue: l.status },
                            { name: "organization_id", label: "Établissement client (si gagné)", type: "select", options: (orgs ?? []).map((o) => ({ value: o.id, label: o.name })), defaultValue: l.organization_id ?? "" },
                            { name: "next_action", label: "Prochaine action", type: "text", defaultValue: l.next_action ?? "" },
                            { name: "next_action_at", label: "Date de relance", type: "date", defaultValue: l.next_action_at ?? "" },
                            { name: "event_kind", label: "Type d'échange", type: "select", required: true, defaultValue: "note", options: Object.entries(CRM_EVENT_KINDS).filter(([k]) => k !== "status").map(([value, label]) => ({ value, label })) },
                            { name: "event_body", label: "Compte rendu (ajouté à l'historique)", type: "textarea", wide: true },
                            { name: "assign_me", label: "Je suis responsable de ce prospect", type: "checkbox", wide: true, defaultValue: l.assigned_to ? "false" : "true" },
                          ]}
                        />
                      </TD>
                    ) : null}
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
