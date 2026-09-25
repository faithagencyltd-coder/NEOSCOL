import { Building2, GraduationCap, Users, UserRoundCog } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { SUBSCRIPTION_STATUS } from "@/features/billing/constants";
import { setOrganizationStatus } from "@/features/platform/actions";
import { AddAdminDialog, CreateOrganizationDialog, ORG_TYPE_LABELS } from "@/features/platform/components/org-dialogs";
import { requireSession } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Plateforme NéoScol" };

/** Console du Super Administrateur : tous les établissements de la plateforme. */
export default async function PlatformPage() {
  await requireSession();
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) notFound();
  const [{ data: orgs }, { data: subs }] = await Promise.all([
    supabase.rpc("platform_overview"),
    supabase.from("subscriptions").select("organization_id, status, is_demo, plan:subscription_plans(name)"),
  ]);
  const rows = orgs ?? [];
  const subscriptionOf = new Map((subs ?? []).map((s) => [s.organization_id, s]));
  const total = (key: "students" | "staff" | "members") => rows.reduce((sum, o) => sum + Number(o[key]), 0);

  return (
    <div className="grid gap-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Indicateurs">
          {[
            { label: "Établissements", value: rows.length, icon: Building2 },
            { label: "Élèves", value: total("students"), icon: GraduationCap },
            { label: "Personnel", value: total("staff"), icon: UserRoundCog },
            { label: "Comptes actifs", value: total("members"), icon: Users },
          ].map((s, i) => (
            <Card key={s.label} className="rise flex items-center gap-3 p-4" style={{ "--delay": `${i * 40}ms` } as React.CSSProperties}>
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <s.icon className="size-5" aria-hidden />
              </span>
              <span className="grid">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <span className="text-2xl font-bold tabular-nums">{formatNumber(s.value)}</span>
              </span>
            </Card>
          ))}
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
