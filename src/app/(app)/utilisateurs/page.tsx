import { Plus, UserCheck, UserX, UsersRound, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { addMemberRole, removeMemberRole, setMembershipStatus } from "@/features/security/actions";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils/format";
import { normalizeSearch as normalizeText, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Utilisateurs" };

const PERSONAS: Record<string, { label: string; tone: "primary" | "info" | "warning" | "success" }> = {
  staff: { label: "Personnel", tone: "primary" },
  teacher: { label: "Enseignant", tone: "info" },
  parent: { label: "Parent", tone: "warning" },
  student: { label: "Élève", tone: "success" },
};

/** Comptes ayant accès à l'établissement : rôles, statut, dernière activité. */
export default async function UsersPage({ searchParams }: PageProps<"/utilisateurs">) {
  const context = await requirePermission("users.read");
  const manage = can(context, "users.manage");
  const params = await searchParams;
  const q = param(params, "q");
  const persona = param(params, "profil");
  const supabase = await createClient();
  const [{ data: members }, { data: roles }] = await Promise.all([
    supabase
      .from("memberships")
      .select(
        "id, user_id, status, joined_at, profile:profiles!memberships_user_id_fkey(first_name, last_name, email, phone, last_seen_at), membership_roles(role:roles(id, name, persona, key))",
      )
      .eq("organization_id", context.organization.id),
    supabase.from("roles").select("id, name, persona, key").eq("organization_id", context.organization.id).order("name"),
  ]);
  const rows = (members ?? [])
    .map((m) => ({
      ...m,
      name: [m.profile?.first_name, m.profile?.last_name].filter(Boolean).join(" ") || (m.profile?.email ?? "Compte"),
      roles: m.membership_roles.flatMap((mr) => (mr.role ? [mr.role] : [])),
    }))
    .filter((m) => !persona || m.roles.some((r) => r.persona === persona))
    .filter((m) => !q || normalizeText(`${m.name} ${m.profile?.email ?? ""} ${m.profile?.phone ?? ""}`).includes(normalizeText(q)))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const counts = Object.fromEntries(
    Object.keys(PERSONAS).map((p) => [p, (members ?? []).filter((m) => m.membership_roles.some((mr) => mr.role?.persona === p)).length]),
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Utilisateurs"
        description="Comptes ayant accès à l'établissement. Les comptes du personnel se créent depuis sa fiche, ceux des familles depuis le dossier de l'élève ou la fiche du parent."
        actions={
          <Button asChild variant="secondary">
            <Link href="/roles">Rôles et permissions</Link>
          </Button>
        }
      />
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Répartition des comptes">
        {Object.entries(PERSONAS).map(([key, p], i) => (
          <Link
            key={key}
            href={persona === key ? "/utilisateurs" : `/utilisateurs?profil=${key}`}
            className="rise rounded-2xl border border-border bg-surface p-4 transition-all hover:-translate-y-0.5 hover:shadow-md aria-[current=true]:border-primary aria-[current=true]:bg-primary-soft"
            aria-current={persona === key}
            style={{ "--delay": `${i * 40}ms` } as React.CSSProperties}
          >
            <p className="text-xs font-medium text-muted-foreground">{p.label}s</p>
            <p className="text-2xl font-bold tabular-nums">{counts[key]}</p>
          </Link>
        ))}
      </section>
      <Card className="overflow-hidden">
        <Suspense>
          <FilterBar
            placeholder="Nom, e-mail ou téléphone…"
            filters={[{ name: "profil", label: "Tous les profils", options: Object.entries(PERSONAS).map(([value, p]) => ({ value, label: p.label })) }]}
          />
        </Suspense>
        {rows.length === 0 ? (
          <EmptyState icon={UsersRound} title="Aucun compte" description="Aucun compte ne correspond à ces critères." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Utilisateur</TH>
                <TH>Rôles</TH>
                <TH>Statut</TH>
                <TH>Dernière activité</TH>
                {manage ? <TH className="text-right">Actions</TH> : null}
              </tr>
            </THead>
            <tbody>
              {rows.map((m) => {
                const self = m.user_id === context.user.id;
                const available = (roles ?? []).filter((r) => !m.roles.some((x) => x.id === r.id));
                return (
                  <TR key={m.id}>
                    <TD>
                      <span className="flex items-center gap-3">
                        <Avatar name={m.name} className="size-9 text-xs" />
                        <span className="grid min-w-0">
                          <span className="truncate font-medium">
                            {m.name} {self ? <span className="text-xs text-muted-foreground">(vous)</span> : null}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">{m.profile?.email ?? (m.profile?.phone ? `+${m.profile.phone.replace(/^\+/, "")}` : "—")}</span>
                        </span>
                      </span>
                    </TD>
                    <TD>
                      <span className="flex flex-wrap gap-1.5">
                        {m.roles.map((r) => (
                          <span key={r.id} className="inline-flex items-center gap-1">
                            <Badge tone={PERSONAS[r.persona]?.tone ?? "neutral"}>{r.name}</Badge>
                            {manage && !self ? (
                              <ConfirmAction
                                trigger={
                                  <button type="button" className="rounded-full p-0.5 text-muted-foreground hover:bg-danger-soft hover:text-danger" aria-label={`Retirer le rôle ${r.name} à ${m.name}`}>
                                    <X className="size-3.5" aria-hidden />
                                  </button>
                                }
                                title={`Retirer le rôle « ${r.name} » ?`}
                                description={`${m.name} perdra immédiatement les droits de ce rôle.`}
                                confirmLabel="Retirer"
                                tone="danger"
                                action={removeMemberRole}
                                fields={{ membership_id: m.id, role_id: r.id }}
                              />
                            ) : null}
                          </span>
                        ))}
                      </span>
                    </TD>
                    <TD>{m.status === "active" ? <Badge tone="success">Actif</Badge> : <Badge tone="danger">Suspendu</Badge>}</TD>
                    <TD className="whitespace-nowrap text-muted-foreground">
                      {m.profile?.last_seen_at ? formatDateTime(m.profile.last_seen_at, "fr-FR", context.organization.timezone) : "—"}
                    </TD>
                    {manage ? (
                      <TD>
                        {self ? null : (
                          <span className="flex justify-end gap-1.5">
                            {available.length ? (
                              <QuickFormDialog
                                title={`Attribuer un rôle — ${m.name}`}
                                description="Vous ne pouvez attribuer que des rôles dont vous possédez toutes les permissions."
                                trigger={
                                  <Button size="sm" variant="secondary" aria-label={`Attribuer un rôle à ${m.name}`}>
                                    <Plus aria-hidden /> Rôle
                                  </Button>
                                }
                                action={addMemberRole}
                                hidden={{ membership_id: m.id }}
                                fields={[{ name: "role_id", label: "Rôle", type: "select", required: true, options: available.map((r) => ({ value: r.id, label: r.name })) }]}
                                submitLabel="Attribuer"
                              />
                            ) : null}
                            <ConfirmAction
                              trigger={
                                <Button size="sm" variant="ghost" aria-label={`${m.status === "active" ? "Suspendre" : "Réactiver"} ${m.name}`}>
                                  {m.status === "active" ? <UserX aria-hidden /> : <UserCheck aria-hidden />}
                                </Button>
                              }
                              title={m.status === "active" ? `Suspendre l'accès de ${m.name} ?` : `Réactiver l'accès de ${m.name} ?`}
                              description={m.status === "active" ? "La connexion à l'établissement est bloquée ; aucune donnée n'est supprimée." : undefined}
                              confirmLabel={m.status === "active" ? "Suspendre" : "Réactiver"}
                              tone={m.status === "active" ? "danger" : "primary"}
                              action={setMembershipStatus}
                              fields={{ membership_id: m.id, active: m.status === "active" ? "false" : "true" }}
                            />
                          </span>
                        )}
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
