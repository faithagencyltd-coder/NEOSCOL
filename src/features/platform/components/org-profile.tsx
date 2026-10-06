import {
  Building2,
  CreditCard,
  HardDrive,
  LifeBuoy,
  LogIn,
  MessageSquareText,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { StatCard } from "@/features/dashboard/components/stat-card";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
} from "@/lib/utils/format";

export type OrgProfile = {
  organization: {
    id: string;
    name: string;
    code: string;
    type: string;
    city: string | null;
    country: string;
    status: string;
    is_demo: boolean;
    created_at: string;
    email: string | null;
    email_verification: string | null;
    currency: string;
  };
  subscription: {
    status: string;
    plan: string | null;
    interval: string;
    trial_end: string | null;
    period_end: string | null;
    next_billing_date: string | null;
    is_demo: boolean;
    price: number;
    currency: string;
  } | null;
  counts: {
    students: number;
    staff: number;
    members: number;
    files: number;
    storage_bytes: number;
  };
  usage: {
    sms_balance: number | null;
    ai_requests_month: number;
    logins_30d: number;
    last_login: string | null;
  };
  paid: {
    paid_at: string;
    reference: string;
    label: string;
    amount: number;
    currency: string;
  }[];
  members: {
    user_id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    is_active: boolean;
    status: string;
    roles: string | null;
    is_admin: boolean;
    last_sign_in_at: string | null;
  }[];
  tickets: { open: number; total: number };
  events: {
    created_at: string;
    action: string;
    actor_email: string | null;
    result: string;
    summary: string | null;
  }[];
};

const SUB: Record<string, string> = {
  TRIALING: "Essai",
  ACTIVE: "Actif",
  PAST_DUE: "Impayé",
  GRACE_PERIOD: "Délai de grâce",
  RESTRICTED: "Restreint",
  CANCELLED: "Résilié",
  EXPIRED: "Expiré",
};

/** Fiche établissement (Super Admin) : volumes, abonnement, consommation, comptes, événements. Aucune donnée d'élève. */
export function OrganizationProfile({
  p,
  typeLabel,
}: {
  p: OrgProfile;
  typeLabel: string;
}) {
  const s = p.subscription;
  const kb = Math.round(p.counts.storage_bytes / 1024);
  return (
    <div className="grid gap-5" data-testid="org-profile">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Building2 className="size-5 text-primary" aria-hidden />{" "}
              {p.organization.name}
              {p.organization.status === "active" ? (
                <Badge tone="success">Actif</Badge>
              ) : (
                <Badge tone="danger">Suspendu</Badge>
              )}
              {p.organization.is_demo ? <Badge>Démonstration</Badge> : null}
            </CardTitle>
            <CardDescription>
              {typeLabel} · code {p.organization.code} ·{" "}
              {p.organization.city ?? "—"} ({p.organization.country}) · créé le{" "}
              {formatDate(p.organization.created_at)}
              {p.organization.email
                ? ` · ${p.organization.email}${p.organization.email_verification === "pending" ? " (à vérifier)" : ""}`
                : ""}
            </CardDescription>
          </div>
          <Link
            href={`/plateforme/incidents?etablissement=${p.organization.id}&statut=toutes`}
            className="text-sm font-medium text-primary hover:underline"
          >
            <LifeBuoy className="mr-1 inline size-4" aria-hidden />
            {p.tickets.open} demande(s) d&apos;assistance ouverte(s) sur{" "}
            {p.tickets.total}
          </Link>
        </CardHeader>
      </Card>

      <section
        className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Volumes et consommation"
      >
        <StatCard
          label="Élèves / personnel"
          value={`${formatNumber(p.counts.students)} / ${formatNumber(p.counts.staff)}`}
          hint={`${p.counts.members} compte(s) actif(s)`}
          icon={Users}
        />
        <StatCard
          label="Abonnement"
          value={s ? (SUB[s.status] ?? s.status) : "Aucun"}
          hint={
            s
              ? `${s.plan ?? "—"} · ${formatMoney(s.price, s.currency)} / ${s.interval === "YEARLY" ? "an" : "mois"} · échéance ${formatDate((s.status === "TRIALING" ? s.trial_end : s.period_end) ?? p.organization.created_at)}`
              : "Pas d'abonnement propre"
          }
          icon={CreditCard}
          tone={
            s &&
            ["PAST_DUE", "GRACE_PERIOD", "RESTRICTED", "EXPIRED"].includes(
              s.status,
            )
              ? "danger"
              : "success"
          }
        />
        <StatCard
          label="Connexions (30 jours)"
          value={{ count: p.usage.logins_30d }}
          hint={
            p.usage.last_login
              ? `Dernière : ${formatDateTime(p.usage.last_login)}`
              : "Aucune connexion"
          }
          icon={LogIn}
          tone="info"
        />
        <StatCard
          label="Stockage"
          value={
            kb >= 1024
              ? `${(kb / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`
              : `${kb} Ko`
          }
          hint={`${p.counts.files} fichier(s)`}
          icon={HardDrive}
        />
      </section>
      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
        <span>
          <MessageSquareText className="mr-1 inline size-4" aria-hidden />
          SMS restants : {p.usage.sms_balance ?? 0}
        </span>
        <span>
          <Sparkles className="mr-1 inline size-4" aria-hidden />
          Questions à l&apos;assistant ce mois : {p.usage.ai_requests_month}
        </span>
        {p.paid.length ? (
          <span>
            Dernier paiement :{" "}
            {formatMoney(p.paid[0]!.amount, p.paid[0]!.currency)} le{" "}
            {formatDate(p.paid[0]!.paid_at)}
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Comptes ({p.members.length})</CardTitle>
            <CardDescription>
              Pour aider un utilisateur, recherchez-le dans « Comptes ». Aucune
              connexion à sa place n&apos;est possible.
            </CardDescription>
          </CardHeader>
          <Table>
            <THead>
              <tr className="border-t border-border">
                <TH>Compte</TH>
                <TH>Rôles</TH>
                <TH>Dernière connexion</TH>
              </tr>
            </THead>
            <tbody>
              {p.members.map((m) => (
                <TR key={m.user_id}>
                  <TD>
                    <Link
                      href={`/plateforme/comptes?q=${encodeURIComponent(m.email)}`}
                      className="font-medium hover:text-primary"
                    >
                      {[m.first_name, m.last_name].filter(Boolean).join(" ") ||
                        m.email}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {m.email}
                      {!m.is_active
                        ? " · compte suspendu"
                        : m.status !== "active"
                          ? ` · ${m.status}`
                          : ""}
                    </span>
                  </TD>
                  <TD className="text-xs">{m.roles ?? "—"}</TD>
                  <TD className="text-xs">
                    {m.last_sign_in_at
                      ? formatDateTime(m.last_sign_in_at)
                      : "Jamais"}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Événements récents</CardTitle>
            <CardDescription>
              Connexions, paramètres, abonnement, assistance.{" "}
              <Link
                href={`/plateforme/journal?etablissement=${p.organization.id}`}
                className="text-primary hover:underline"
              >
                Journal complet
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1.5 text-xs">
            {p.events.length ? (
              p.events.map((e, i) => (
                <p key={i}>
                  <span className="text-muted-foreground">
                    {formatDateTime(e.created_at)}
                  </span>{" "}
                  · {e.summary ?? e.action}
                  {e.actor_email ? ` — ${e.actor_email}` : ""}
                  {e.result !== "success" ? (
                    <span className="font-semibold text-danger">
                      {" "}
                      ({e.result})
                    </span>
                  ) : null}
                </p>
              ))
            ) : (
              <p className="text-muted-foreground">Aucun événement.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
