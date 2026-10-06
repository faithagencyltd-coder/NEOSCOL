import { Search, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { revokeUserSessions } from "@/features/platform/integration-actions";
import { setUserActive } from "@/features/platform/team-actions";
import { canWritePlatform, getPlatformRole, PLATFORM_ROLE_LABELS, type PlatformRole } from "@/lib/auth/platform";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils/format";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Comptes — Plateforme" };

type Found = {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  is_active: boolean;
  last_sign_in_at: string | null;
  created_at: string | null;
  platform_role: PlatformRole | null;
  mfa: boolean;
  sessions: number;
  memberships: { organization_id: string; organization: string; status: string; roles: string | null }[];
};

/** Recherche d'un compte sur toute la plateforme, pour aider un utilisateur ou bloquer un compte compromis. */
export default async function PlatformAccountsPage({ searchParams }: PageProps<"/plateforme/comptes">) {
  const q = param(await searchParams, "q") ?? "";
  const supabase = await createClient();
  const [{ data }, role] = await Promise.all([supabase.rpc("platform_user_search", { p_query: q }), getPlatformRole()]);
  const found = (data ?? []) as unknown as Found[];
  const writable = canWritePlatform(role);

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="grid gap-1">
        <h2 className="text-2xl font-bold">Comptes</h2>
        <p className="text-sm text-muted-foreground">
          Retrouvez un utilisateur par e-mail, nom ou téléphone : établissements, rôles, double authentification, dernière connexion. Pour des raisons de confidentialité, il n&apos;est pas possible de se connecter à la place d&apos;un utilisateur.
        </p>
      </div>
      <Card>
        <CardContent className="pt-5">
          <form method="get" className="flex flex-wrap items-end gap-2" role="search">
            <label className="grid flex-1 gap-1 text-sm font-medium">
              Rechercher (3 caractères minimum)
              <Input name="q" defaultValue={q} placeholder="ex. direction@, Koné, +225…" minLength={3} maxLength={100} data-testid="account-search" />
            </label>
            <Button type="submit">
              <Search aria-hidden /> Rechercher
            </Button>
          </form>
        </CardContent>
      </Card>

      {q.length >= 3 && found.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState icon={UserRound} title="Aucun compte trouvé" />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3">
        {found.map((u) => (
          <Card key={u.user_id} data-testid="account-card">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div className="grid gap-1">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email}
                  {u.is_active ? <Badge tone="success">Actif</Badge> : <Badge tone="danger">Suspendu</Badge>}
                  {u.platform_role ? <Badge tone="primary">Équipe : {PLATFORM_ROLE_LABELS[u.platform_role]}</Badge> : null}
                  {u.mfa ? <Badge tone="success">Double authentification</Badge> : null}
                </CardTitle>
                <CardDescription>
                  {u.email}
                  {u.phone ? ` · ${u.phone}` : ""} · dernière connexion : {u.last_sign_in_at ? formatDateTime(u.last_sign_in_at) : "jamais"} · {u.sessions} session(s) ouverte(s)
                </CardDescription>
              </div>
              {writable ? (
                <div className="flex flex-wrap gap-2">
                  {u.sessions > 0 ? (
                    <ConfirmAction
                      trigger={
                        <Button size="sm" variant="secondary">
                          Fermer les sessions
                        </Button>
                      }
                      title={`Fermer les sessions de ${u.email} ?`}
                      description="Il devra se reconnecter sur tous ses appareils (utile après un vol de téléphone ou un mot de passe divulgué)."
                      confirmLabel="Fermer les sessions"
                      action={revokeUserSessions}
                      fields={{ user_id: u.user_id }}
                    />
                  ) : null}
                  <ConfirmAction
                    trigger={
                      <Button size="sm" variant={u.is_active ? "ghost" : "primary"} className={u.is_active ? "text-danger" : ""}>
                        {u.is_active ? "Suspendre le compte" : "Réactiver le compte"}
                      </Button>
                    }
                    title={u.is_active ? `Suspendre ${u.email} ?` : `Réactiver ${u.email} ?`}
                    description={u.is_active ? "Le compte perd immédiatement l'accès à tous ses établissements. Ses données sont conservées." : "Le compte retrouve l'accès à ses établissements."}
                    confirmLabel={u.is_active ? "Suspendre" : "Réactiver"}
                    tone={u.is_active ? "danger" : "primary"}
                    action={setUserActive}
                    fields={{ user_id: u.user_id, active: u.is_active ? "false" : "true" }}
                    reason={{ label: "Motif (conservé dans le journal)", required: true }}
                  />
                </div>
              ) : null}
            </CardHeader>
            <CardContent>
              {u.memberships.length ? (
                <ul className="flex flex-wrap gap-2 text-sm">
                  {u.memberships.map((m) => (
                    <li key={m.organization_id} className="rounded-xl border border-border px-3 py-1.5">
                      <Link href={`/plateforme/etablissements/${m.organization_id}`} className="font-medium hover:text-primary">
                        {m.organization}
                      </Link>
                      <span className="text-muted-foreground">
                        {" "}
                        · {m.roles ?? "sans rôle"}
                        {m.status !== "active" ? ` · ${m.status}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Rattaché à aucun établissement (parent ou élève via un portail, ou membre de l&apos;équipe).</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
