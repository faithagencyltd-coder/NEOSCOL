import { KeyRound, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { AddTeamMemberDialog } from "@/features/platform/components/team-dialogs";
import { removeTeamMember, setTeamRole } from "@/features/platform/team-actions";
import { getPlatformRole, PLATFORM_ROLE_HINTS, PLATFORM_ROLE_LABELS, type PlatformRole } from "@/lib/auth/platform";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Équipe — Plateforme" };

const TONES: Record<PlatformRole, "primary" | "info" | "neutral"> = { owner: "primary", admin: "info", viewer: "neutral" };

/** Équipe de la plateforme : qui accède à la console, avec quel rôle. Gérée par les propriétaires. */
export default async function PlatformTeamPage() {
  const [supabase, role, context] = await Promise.all([createClient(), getPlatformRole(), getSessionContext()]);
  const { data, error } = await supabase.rpc("platform_team");
  const team = data ?? [];
  const owner = role === "owner";
  const owners = team.filter((m) => m.role === "owner" && m.is_active).length;

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-2xl font-bold">Équipe de la plateforme</h2>
          <p className="text-sm text-muted-foreground">Personnes qui accèdent à la console NeoScool. Les rôles sont appliqués par la base de données, pas seulement par l&apos;affichage.</p>
        </div>
        {owner ? <AddTeamMemberDialog /> : null}
      </div>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Rôles">
        {(Object.keys(PLATFORM_ROLE_LABELS) as PlatformRole[]).map((r) => (
          <Card key={r}>
            <CardContent className="grid gap-1 pt-5">
              <p className="flex items-center justify-between gap-2 font-semibold">
                {PLATFORM_ROLE_LABELS[r]} <Badge tone={TONES[r]}>{team.filter((m) => m.role === r).length}</Badge>
              </p>
              <p className="text-sm text-muted-foreground">{PLATFORM_ROLE_HINTS[r]}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5 text-primary" aria-hidden /> Membres ({team.length})
          </CardTitle>
          <CardDescription>
            {owner
              ? "Il reste toujours au moins un propriétaire actif. Retirer un membre ferme son accès à la console ; son compte est conservé."
              : "Seuls les propriétaires peuvent ajouter, modifier ou retirer un membre."}
          </CardDescription>
        </CardHeader>
        {error ? (
          <CardContent>
            <p className="text-sm text-danger">Équipe indisponible.</p>
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr className="border-t border-border">
                <TH>Membre</TH>
                <TH>Rôle</TH>
                <TH>Double authentification</TH>
                <TH>Dernière connexion</TH>
                <TH>Ajouté</TH>
                {owner ? <TH /> : null}
              </tr>
            </THead>
            <tbody>
              {team.map((m) => {
                const r = m.role as PlatformRole;
                const self = m.user_id === context?.user.id;
                const lastOwner = r === "owner" && owners <= 1;
                return (
                  <TR key={m.user_id} data-testid="team-row">
                    <TD>
                      <span className="grid">
                        <span className="font-medium">
                          {[m.first_name, m.last_name].filter(Boolean).join(" ") || m.email} {self ? <span className="text-xs text-muted-foreground">(vous)</span> : null}
                        </span>
                        <span className="text-xs text-muted-foreground">{m.email}</span>
                        {!m.is_active ? <span className="text-xs text-danger">Compte désactivé</span> : null}
                      </span>
                    </TD>
                    <TD>
                      <Badge tone={TONES[r]}>{PLATFORM_ROLE_LABELS[r] ?? m.role}</Badge>
                    </TD>
                    <TD>
                      {m.mfa ? (
                        <Badge tone="success">
                          <ShieldCheck className="size-3.5" aria-hidden /> Activée
                        </Badge>
                      ) : (
                        <Badge tone="warning">
                          <KeyRound className="size-3.5" aria-hidden /> À activer
                        </Badge>
                      )}
                    </TD>
                    <TD className="text-xs">{m.last_sign_in_at ? new Date(m.last_sign_in_at).toLocaleString("fr-FR") : "Jamais"}</TD>
                    <TD className="text-xs">
                      {new Date(m.created_at).toLocaleDateString("fr-FR")}
                      {m.added_by_email ? <span className="block text-muted-foreground">par {m.added_by_email}</span> : null}
                    </TD>
                    {owner ? (
                      <TD>
                        <div className="flex flex-wrap justify-end gap-1">
                          <QuickFormDialog
                            title={`Rôle de ${m.email}`}
                            trigger={
                              <Button size="sm" variant="secondary">
                                Rôle
                              </Button>
                            }
                            action={setTeamRole}
                            hidden={{ user_id: m.user_id }}
                            fields={[
                              {
                                name: "role",
                                label: "Rôle",
                                type: "select",
                                required: true,
                                defaultValue: m.role,
                                options: (Object.keys(PLATFORM_ROLE_LABELS) as PlatformRole[]).map((v) => ({ value: v, label: `${PLATFORM_ROLE_LABELS[v]} — ${PLATFORM_ROLE_HINTS[v]}` })),
                              },
                            ]}
                          />
                          {!lastOwner ? (
                            <ConfirmAction
                              trigger={
                                <Button size="sm" variant="ghost" className="text-danger">
                                  Retirer
                                </Button>
                              }
                              title={`Retirer ${m.email} de l'équipe ?`}
                              description="Son accès à la console est fermé immédiatement. Son compte et son historique sont conservés."
                              confirmLabel="Retirer"
                              tone="danger"
                              action={removeTeamMember}
                              fields={{ user_id: m.user_id }}
                              reason={{ label: "Motif (conservé dans le journal)", required: true }}
                            />
                          ) : null}
                        </div>
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
