import { ArrowRight, Building2, CalendarClock, Check, CreditCard, Info, MailOpen, Receipt, X } from "lucide-react";
import type { Metadata } from "next";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { SubmitButton } from "@/components/shared/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { switchOrganization } from "@/features/auth/actions";
import { respondInvitation, startTeacherAccessCheckout } from "@/features/teacher-access/actions";
import { ACCESS_STATE, PAYABLE_STATES, PAYMENT_STATUS, periodLabel } from "@/features/teacher-access/constants";
import { getMyOrganizationAccesses } from "@/features/teacher-access/queries";
import { requireOrganization } from "@/lib/auth/guards";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { ORGANIZATION_TYPE_LABELS } from "@/lib/vocabulary";

export const metadata: Metadata = { title: "Mes établissements" };

const fmt = (d: string | null | undefined) => (d ? formatDate(d, "fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—");

/**
 * Compte unique Neoscool : tous les établissements du compte, les invitations
 * à accepter et, si le Super Admin l'exige, l'abonnement d'accès supplémentaire
 * (paiement, renouvellement, état). Tout est calculé et contrôlé en base.
 */
export default async function MyEstablishmentsPage() {
  const context = await requireOrganization();
  const data = await getMyOrganizationAccesses();
  const memberships = data?.memberships ?? [];
  const invitations = memberships.filter((m) => m.status === "invited");
  const establishments = memberships.filter((m) => m.status === "active");
  const rule = data?.rule;
  const accessible = new Set(context.organizations.map((o) => o.id));

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Mes établissements"
        description="Un seul compte Neoscool pour tous les établissements où vous travaillez. Vos droits sont propres à chaque établissement."
      />

      {invitations.length > 0 ? (
        <Card className="border-info/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MailOpen className="size-5 text-info" aria-hidden /> Invitations à accepter
            </CardTitle>
            <CardDescription>Acceptez avec votre compte actuel : aucun nouveau compte ni mot de passe n&apos;est créé.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {invitations.map((inv) => (
              <div key={inv.membership_id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-4">
                <span className="flex size-10 items-center justify-center rounded-xl bg-info-soft text-info">
                  <Building2 className="size-5" aria-hidden />
                </span>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <p className="font-semibold">{inv.organization_name}</p>
                  <p className="text-sm text-muted-foreground">
                    Rôle proposé : {inv.roles.join(", ") || "—"}
                    {inv.invited_by ? ` · invité par ${inv.invited_by}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ConfirmAction
                    trigger={
                      <Button size="sm">
                        <Check aria-hidden /> Accepter
                      </Button>
                    }
                    title={`Rejoindre ${inv.organization_name} ?`}
                    description={
                      rule?.enabled
                        ? `Vous accéderez à cet établissement avec votre compte actuel. S'il s'agit d'un établissement supplémentaire, l'accès demande un abonnement de ${formatMoney(rule.price, rule.currency)} par ${periodLabel(rule.period_months)}.`
                        : "Vous accéderez à cet établissement avec votre compte actuel et le rôle proposé."
                    }
                    confirmLabel="Accepter l'invitation"
                    action={respondInvitation}
                    fields={{ membership_id: inv.membership_id, accept: "true" }}
                  />
                  <ConfirmAction
                    trigger={
                      <Button size="sm" variant="ghost">
                        <X aria-hidden /> Refuser
                      </Button>
                    }
                    title="Refuser l'invitation ?"
                    description="Votre compte et vos autres établissements ne sont pas modifiés. L'établissement pourra vous réinviter."
                    confirmLabel="Refuser"
                    tone="danger"
                    action={respondInvitation}
                    fields={{ membership_id: inv.membership_id, accept: "false" }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {rule?.enabled ? (
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-sm">
          <Info className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <p>
            Votre <strong>premier établissement reste toujours inclus</strong>. L&apos;accès d&apos;un enseignant à chaque établissement supplémentaire demande un
            abonnement de <strong>{formatMoney(rule.price, rule.currency)}</strong> par {periodLabel(rule.period_months)}
            {rule.grace_days > 0 ? `, avec ${rule.grace_days} jour(s) de grâce après la fin de période` : ""}. Sans abonnement, seul cet accès est suspendu : votre
            compte n&apos;est jamais supprimé.
          </p>
        </div>
      ) : null}

      {establishments.length === 0 ? (
        <EmptyState icon={Building2} title="Aucun établissement" />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {establishments.map((m) => {
            const state = ACCESS_STATE[m.access_state ?? "not_required"] ?? ACCESS_STATE.not_required!;
            const isActive = m.organization_id === context.organization.id;
            const canOpen = accessible.has(m.organization_id);
            const payable = Boolean(rule?.enabled && m.extra && PAYABLE_STATES.has(m.access_state ?? ""));
            return (
              <li key={m.membership_id} className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-5 shadow-sm" data-testid="establishment-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid min-w-0 gap-0.5">
                    <h2 className="truncate font-bold">{m.organization_name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {ORGANIZATION_TYPE_LABELS[m.organization_type] ?? m.organization_type}
                      {m.city ? ` · ${m.city}` : ""}
                    </p>
                  </div>
                  {isActive ? <Badge tone="primary">Établissement actif</Badge> : null}
                </div>
                <p className="text-sm">
                  <span className="text-muted-foreground">Rôle(s) : </span>
                  {m.roles.join(", ") || "—"}
                  {m.extra ? <span className="text-muted-foreground"> · établissement supplémentaire</span> : <span className="text-muted-foreground"> · établissement principal</span>}
                </p>
                <div className="grid gap-1 rounded-2xl bg-surface-muted p-3 text-sm">
                  <span>
                    <Badge tone={state.tone}>{state.label}</Badge>
                  </span>
                  <span className="text-muted-foreground">{state.hint}</span>
                  {m.period_end && m.access_state !== "not_required" ? (
                    <span className="flex items-center gap-1.5">
                      <CalendarClock className="size-4 text-muted-foreground" aria-hidden /> Période payée jusqu&apos;au {fmt(m.period_end)}
                    </span>
                  ) : null}
                  {m.status_reason && ["suspended", "exempt"].includes(m.access_state ?? "") ? <span className="text-muted-foreground">Motif : {m.status_reason}</span> : null}
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  {canOpen && !isActive ? (
                    <form action={switchOrganization}>
                      <input type="hidden" name="organizationId" value={m.organization_id} />
                      <SubmitButton size="sm" variant="secondary">
                        Ouvrir <ArrowRight aria-hidden />
                      </SubmitButton>
                    </form>
                  ) : null}
                  {payable && rule ? (
                    <ConfirmAction
                      trigger={
                        <Button size="sm">
                          <CreditCard aria-hidden /> {m.access_state === "active" ? "Renouveler" : "Payer l'abonnement"} — {formatMoney(rule.price, rule.currency)}
                        </Button>
                      }
                      title={`Accès à ${m.organization_name}`}
                      description={`Abonnement enseignant supplémentaire : ${formatMoney(rule.price, rule.currency)} pour ${rule.period_months === 1 ? "1 mois" : `${rule.period_months} mois`}. L'accès est activé dès la confirmation du paiement par le fournisseur.`}
                      confirmLabel="Continuer vers le paiement"
                      action={startTeacherAccessCheckout}
                      fields={{ organization_id: m.organization_id }}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data && data.payments.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="size-5 text-primary" aria-hidden /> Mes paiements d&apos;accès
            </CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <tr className="border-t border-border">
                <TH>Référence</TH>
                <TH>Établissement</TH>
                <TH className="text-right">Montant</TH>
                <TH>Statut</TH>
                <TH>Période</TH>
              </tr>
            </THead>
            <tbody>
              {data.payments.map((p) => (
                <TR key={p.reference}>
                  <TD className="font-mono text-xs">{p.reference}</TD>
                  <TD>{p.organization_name}</TD>
                  <TD className="text-right font-semibold tabular-nums">{formatMoney(p.amount, p.currency)}</TD>
                  <TD>
                    <StatusBadge value={p.status} map={PAYMENT_STATUS} />
                  </TD>
                  <TD className="text-sm text-muted-foreground">{p.covers_from ? `${fmt(p.covers_from)} → ${fmt(p.covers_to)}` : fmt(p.created_at)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
