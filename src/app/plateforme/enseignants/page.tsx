import { CreditCard, History, Settings2, Users } from "lucide-react";
import type { Metadata } from "next";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { TeacherAccessSettingsForm } from "@/features/teacher-access/components/settings-form";
import { ACCESS_STATE, PAYMENT_STATUS, periodLabel } from "@/features/teacher-access/constants";
import { recordTeacherAccessPayment, setTeacherAccessStatus } from "@/features/teacher-access/platform-actions";
import { getPlatformTeacherAccessData } from "@/features/teacher-access/queries";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Enseignants multi-établissements" };

const fmt = (d: string | null | undefined) => (d ? formatDate(d) : "—");

/**
 * Super Admin : règle de l'abonnement supplémentaire (activer, prix, durée),
 * enseignants concernés et leur statut, paiements, et actions (paiement manuel,
 * suspendre, rétablir, offrir). Toutes les décisions sont appliquées en base.
 */
export default async function PlatformTeachersPage() {
  const { rule, accesses, payments, history } = await getPlatformTeacherAccessData();
  const current = rule ?? { enabled: false, price: 0, currency: "XOF", period_months: 1, grace_days: 0, updated_at: null };
  const blocked = accesses.filter((a) => ["pending", "expired", "suspended"].includes(a.access_state)).length;

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="size-5 text-primary" aria-hidden /> Abonnement enseignant supplémentaire
          </CardTitle>
          <CardDescription>
            Un enseignant garde un seul compte Neoscool pour tous ses établissements. Décidez si l&apos;accès à un établissement supplémentaire demande un
            abonnement.
            {current.enabled ? (
              <>
                {" "}
                <Badge tone="success">Règle active</Badge> {formatMoney(current.price, current.currency)} / {periodLabel(current.period_months)}
              </>
            ) : (
              <>
                {" "}
                <Badge tone="neutral">Règle inactive</Badge> accès libre
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <TeacherAccessSettingsForm rule={current} />
          {history.length > 0 ? (
            <details className="rounded-2xl border border-border p-3 text-sm">
              <summary className="flex cursor-pointer items-center gap-2 font-semibold">
                <History className="size-4 text-muted-foreground" aria-hidden /> Historique des réglages
              </summary>
              <ul className="mt-2 grid gap-1 text-muted-foreground">
                {history.map((h) => (
                  <li key={h.id}>
                    {formatDateTime(h.changed_at)} — {h.enabled ? "active" : "inactive"}, {formatMoney(h.price, h.currency)} / {periodLabel(h.period_months)}, grâce{" "}
                    {h.grace_days} j
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5 text-primary" aria-hidden /> Enseignants concernés ({accesses.length})
          </CardTitle>
          <CardDescription>
            Enseignants dont le même compte travaille dans plusieurs établissements (hors premier établissement).
            {current.enabled && blocked > 0 ? ` ${blocked} accès actuellement suspendu(s) ou en attente de paiement.` : ""}
          </CardDescription>
        </CardHeader>
        {accesses.length === 0 ? (
          <CardContent>
            <EmptyState icon={Users} title="Aucun enseignant multi-établissements" description="Ils apparaissent dès qu'un établissement rattache un compte déjà utilisé ailleurs." />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr className="border-t border-border">
                <TH>Enseignant</TH>
                <TH>Établissement supplémentaire</TH>
                <TH>Statut de l&apos;abonnement</TH>
                <TH>Période payée</TH>
                <TH>Dernier paiement</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {accesses.map((a) => {
                const state = ACCESS_STATE[a.access_state] ?? { label: a.access_state, tone: "neutral" as const, hint: "" };
                const fields = { user_id: a.user_id, organization_id: a.organization_id };
                return (
                  <TR key={`${a.user_id}-${a.organization_id}`}>
                    <TD>
                      <span className="grid">
                        <span className="font-medium">{a.teacher_name ?? "—"}</span>
                        <span className="text-xs text-muted-foreground">{a.email}</span>
                      </span>
                    </TD>
                    <TD>
                      <span className="grid">
                        <span>{a.organization_name}</span>
                        <span className="text-xs text-muted-foreground">Aussi : {a.other_organizations.join(", ") || "—"}</span>
                      </span>
                    </TD>
                    <TD>
                      <span className="grid gap-1">
                        <Badge tone={state.tone}>{state.label}</Badge>
                        {a.status_reason ? <span className="text-xs text-muted-foreground">Motif : {a.status_reason}</span> : null}
                      </span>
                    </TD>
                    <TD className="text-sm">{a.period_end ? `${fmt(a.period_start)} → ${fmt(a.period_end)}` : "—"}</TD>
                    <TD className="text-sm">
                      {a.last_payment ? (
                        <span className="grid">
                          <span className="tabular-nums">{formatMoney(a.last_payment.amount, a.last_payment.currency)}</span>
                          <StatusBadge value={a.last_payment.status} map={PAYMENT_STATUS} />
                        </span>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <QuickFormDialog
                          title={`Paiement reçu — ${a.teacher_name ?? a.email}`}
                          description={`Accès à ${a.organization_name} pour ${periodLabel(current.period_months)}. Le paiement active l'accès (ou prolonge la période en cours).`}
                          trigger={<Button size="sm" variant="secondary">Valider un paiement</Button>}
                          submitLabel="Valider le paiement"
                          action={recordTeacherAccessPayment}
                          hidden={fields}
                          fields={[
                            { name: "reference", label: "Référence du paiement (reçu, virement…)", required: true },
                            { name: "amount", label: `Montant reçu (${current.currency})`, type: "number", required: true, min: 1, defaultValue: String(current.price || "") },
                            { name: "method", label: "Moyen", type: "select", options: [{ value: "especes", label: "Espèces" }, { value: "virement", label: "Virement" }, { value: "mobile_money", label: "Mobile money (hors plateforme)" }, { value: "cheque", label: "Chèque" }] },
                            { name: "note", label: "Note", type: "textarea", wide: true },
                          ]}
                        />
                        {a.access_status === "suspended" ? (
                          <ConfirmAction
                            trigger={<Button size="sm">Rétablir</Button>}
                            title="Rétablir l'accès ?"
                            description="L'accès suit de nouveau la période payée : actif si elle est en cours, sinon paiement requis."
                            confirmLabel="Rétablir"
                            action={setTeacherAccessStatus}
                            fields={{ ...fields, action: "restore" }}
                            reason={{ label: "Motif", required: true }}
                          />
                        ) : (
                          <ConfirmAction
                            trigger={<Button size="sm" variant="ghost" className="text-danger">Suspendre</Button>}
                            title="Suspendre cet accès supplémentaire ?"
                            description="Seul l'accès à cet établissement est suspendu. Le compte de l'enseignant et ses autres établissements ne sont pas touchés ; aucune donnée n'est supprimée."
                            confirmLabel="Suspendre"
                            tone="danger"
                            action={setTeacherAccessStatus}
                            fields={{ ...fields, action: "suspend" }}
                            reason={{ label: "Motif (ex. paiement rejeté)", required: true }}
                          />
                        )}
                        {a.access_status === "exempt" ? (
                          <ConfirmAction
                            trigger={<Button size="sm" variant="ghost">Retirer l&apos;offre</Button>}
                            title="Retirer l'accès offert ?"
                            confirmLabel="Retirer"
                            action={setTeacherAccessStatus}
                            fields={{ ...fields, action: "remove_exemption" }}
                            reason={{ label: "Motif", required: true }}
                          />
                        ) : (
                          <ConfirmAction
                            trigger={<Button size="sm" variant="ghost">Offrir l&apos;accès</Button>}
                            title="Offrir cet accès sans paiement ?"
                            confirmLabel="Offrir"
                            action={setTeacherAccessStatus}
                            fields={{ ...fields, action: "exempt" }}
                            reason={{ label: "Motif (ex. partenariat)", required: true }}
                          />
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-5 text-primary" aria-hidden /> Paiements des accès supplémentaires
          </CardTitle>
        </CardHeader>
        {payments.length === 0 ? (
          <CardContent>
            <EmptyState icon={CreditCard} title="Aucun paiement" />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr className="border-t border-border">
                <TH>Référence</TH>
                <TH>Enseignant</TH>
                <TH>Établissement</TH>
                <TH className="text-right">Montant</TH>
                <TH>Statut</TH>
                <TH>Moyen</TH>
                <TH>Période couverte</TH>
              </tr>
            </THead>
            <tbody>
              {payments.map((p) => (
                <TR key={p.id}>
                  <TD className="font-mono text-xs">{p.reference}</TD>
                  <TD>{p.teacher_name ?? p.email}</TD>
                  <TD>{p.organization_name}</TD>
                  <TD className="text-right font-semibold tabular-nums">{formatMoney(p.amount, p.currency)}</TD>
                  <TD>
                    <StatusBadge value={p.status} map={PAYMENT_STATUS} />
                  </TD>
                  <TD className="text-sm">
                    {p.provider === "manual" ? `Manuel (${p.method ?? "—"})` : p.provider}
                    {p.mode === "test" ? " · test" : ""}
                  </TD>
                  <TD className="text-sm text-muted-foreground">{p.covers_from ? `${fmt(p.covers_from)} → ${fmt(p.covers_to)}` : (p.failure_reason ?? fmt(p.created_at))}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
