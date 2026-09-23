import { Building2, GraduationCap, Users, UserRoundCog } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { Logo } from "@/components/shared/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { UserMenu } from "@/components/layout/user-menu";
import { setOrganizationStatus } from "@/features/platform/actions";
import { AddAdminDialog, CreateOrganizationDialog, ORG_TYPE_LABELS } from "@/features/platform/components/org-dialogs";
import { requireSession } from "@/lib/auth/guards";
import { displayName } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Plateforme NéoScol" };

/** Console du Super Administrateur : tous les établissements de la plateforme. */
export default async function PlatformPage() {
  const context = await requireSession();
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) notFound();
  const { data: orgs } = await supabase.rpc("platform_overview");
  const rows = orgs ?? [];
  const total = (key: "students" | "staff" | "members") => rows.reduce((sum, o) => sum + Number(o[key]), 0);

  return (
    <div className="min-h-dvh bg-background">
      <header className="bg-gradient-to-br from-[#07142b] via-[#0b2559] to-[#0e4a9a] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <Logo inverted tagline />
          <div className="rounded-xl bg-white text-foreground">
            <UserMenu name={displayName(context)} email={context.user.email} roleLabel="Super administrateur" organizations={context.organizations} activeOrganizationId={context.organization?.id ?? ""} />
          </div>
        </div>
        <div className="mx-auto grid max-w-7xl gap-1 px-4 pb-8 pt-2 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Plateforme</p>
          <h1 className="text-3xl font-bold">Établissements NéoScol</h1>
          <p className="text-white/75">Création, suspension et premiers administrateurs. Les données de chaque établissement restent strictement séparées.</p>
        </div>
      </header>
      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-8">
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
      </main>
    </div>
  );
}
