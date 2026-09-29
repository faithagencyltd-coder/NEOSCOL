import { FileText, Gavel, Lock, RefreshCcw, Unlock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { closeDeliberation, decideDeliberation, prepareDeliberation, reopenDeliberation } from "@/features/university/actions";
import { UniversityHeader } from "@/features/university/components/university-header";
import { fmtCredits, fmtNote } from "@/features/university/config";
import { requireUniversity } from "@/features/university/guard";
import { deliberationDetail, person } from "@/features/university/queries";
import { can } from "@/lib/auth/session";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Délibération" };

export default async function DeliberationPage({ params }: PageProps<"/universite/deliberations/[id]">) {
  const context = await requireUniversity(["deliberations.read"]);
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const detail = await deliberationDetail(context.organization.id, id);
  if (!detail) notFound();
  const { deliberation: d, current, history } = detail;
  const tz = context.organization.timezone;
  const manage = can(context, "deliberations.manage");
  const open = d.status === "open";
  const decisionOptions = Object.values(context.university.decisions).map((label) => ({ value: label, label }));
  const decided = current.filter((c) => c.decision).length;

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
        <Link href="/universite/deliberations" className="hover:text-primary">
          Délibérations
        </Link>{" "}
        / <span className="text-foreground">{d.title}</span>
      </nav>
      <UniversityHeader
        eyebrow="Jury de délibération"
        title={d.title}
        description={`${d.class?.name ?? ""} · ${d.class?.program?.name ?? ""} · ${d.period?.name ?? "Délibération annuelle"} · session ${d.session === "retake" ? "de rattrapage" : "normale"}${d.held_on ? ` · ${formatDate(d.held_on, "fr-FR", { dateStyle: "long" })}` : ""}`}
        actions={
          <>
            {context.university.features.documents && can(context, "documents.generate") ? (
              <Button asChild variant="secondary" size="sm">
                <a href={`/api/documents/universite/pv/${d.id}`} target="_blank" rel="noreferrer">
                  <FileText aria-hidden /> Procès-verbal (PDF)
                </a>
              </Button>
            ) : null}
            {manage && open ? (
              <>
                <ConfirmAction
                  trigger={
                    <Button variant="secondary" size="sm">
                      <RefreshCcw aria-hidden /> Recalculer
                    </Button>
                  }
                  title="Recalculer les résultats ?"
                  description="Les moyennes et crédits sont recalculés ; une proposition est ajoutée pour les nouveaux étudiants. Les décisions déjà prises sont conservées."
                  confirmLabel="Recalculer"
                  action={prepareDeliberation}
                  fields={{ id: d.id }}
                />
                <ConfirmAction
                  trigger={
                    <Button size="sm">
                      <Lock aria-hidden /> Clôturer et publier
                    </Button>
                  }
                  title="Clôturer la délibération ?"
                  description={`${decided}/${current.length} décision(s) prise(s) ; les propositions restantes deviennent les décisions. Les résultats sont publiés aux étudiants et les crédits accordés par le jury sont capitalisés.`}
                  confirmLabel="Clôturer"
                  action={closeDeliberation}
                  fields={{ id: d.id }}
                />
              </>
            ) : null}
            {manage && !open ? (
              <ConfirmAction
                trigger={
                  <Button variant="secondary" size="sm">
                    <Unlock aria-hidden /> Rouvrir
                  </Button>
                }
                title="Rouvrir la délibération ?"
                description="Les résultats restent publiés jusqu'à la nouvelle clôture ; le motif est tracé dans le journal d'audit."
                confirmLabel="Rouvrir"
                action={reopenDeliberation}
                fields={{ id: d.id }}
                reason={{ label: "Motif de la réouverture", required: true }}
              />
            ) : null}
          </>
        }
      />
      <div className="grid gap-4 md:grid-cols-3 [&>*]:min-w-0">
        <Card>
          <CardContent className="grid gap-1 pt-5 text-sm">
            <p className="text-muted-foreground">Statut</p>
            <p>{open ? <Badge tone="warning">Ouverte</Badge> : <Badge tone="success">Close le {d.closed_at ? formatDateTime(d.closed_at, "fr-FR", tz) : "—"}</Badge>}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-1 pt-5 text-sm">
            <p className="text-muted-foreground">Président du jury</p>
            <p className="font-medium">{d.president ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-1 pt-5 text-sm">
            <p className="text-muted-foreground">Membres</p>
            <p className="whitespace-pre-line">{d.members ?? "—"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Décisions du jury</CardTitle>
          <CardDescription>
            {decided}/{current.length} décision(s) prise(s). La proposition découle des règles de calcul ; le jury peut la modifier et accorder les crédits.
          </CardDescription>
        </CardHeader>
        {current.length === 0 ? (
          <CardContent>
            <EmptyState icon={Gavel} title="Aucun étudiant" description="Calculez les résultats de la promotion puis recalculez la délibération." />
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Étudiant</TH>
                  <TH className="text-center">Moyenne</TH>
                  <TH className="text-center">Crédits</TH>
                  <TH className="text-center">Absences</TH>
                  <TH>Proposition</TH>
                  <TH>Décision du jury</TH>
                  {manage && open ? <TH className="text-right">Action</TH> : null}
                </TR>
              </THead>
              <tbody>
                {current.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <Link href={`/eleves/${c.student_id}?onglet=resultats`} className="grid hover:text-primary">
                        <span className="font-medium">
                          {c.student?.last_name} {c.student?.first_name}
                        </span>
                        <span className="text-xs text-muted-foreground">{c.student?.matricule}</span>
                      </Link>
                    </TD>
                    <TD className="text-center font-semibold tabular-nums">{fmtNote(c.average)}</TD>
                    <TD className="text-center tabular-nums">
                      {fmtCredits(c.credits_earned)}/{fmtCredits(c.credits_total)}
                    </TD>
                    <TD className="text-center tabular-nums">{c.absences ?? 0}</TD>
                    <TD className="text-sm text-muted-foreground">{c.proposed_decision ?? "—"}</TD>
                    <TD className="text-sm">
                      {c.decision ? (
                        <span className="grid">
                          <span className="font-medium">{c.decision}</span>
                          <span className="text-xs text-muted-foreground">
                            v{c.version}
                            {c.validate_credits ? " · crédits accordés par le jury" : ""}
                            {c.decider ? ` · ${person(c.decider)}` : ""}
                            {c.decided_at ? ` · ${formatDateTime(c.decided_at, "fr-FR", tz)}` : ""}
                          </span>
                          {c.comment ? <span className="text-xs italic text-muted-foreground">« {c.comment} »</span> : null}
                        </span>
                      ) : (
                        <Badge tone="neutral">À décider</Badge>
                      )}
                    </TD>
                    {manage && open ? (
                      <TD className="text-right">
                        <QuickFormDialog
                          title={`Décision — ${c.student?.first_name} ${c.student?.last_name}`}
                          description={`Moyenne ${fmtNote(c.average)}/20 · ${fmtCredits(c.credits_earned)}/${fmtCredits(c.credits_total)} crédits · proposition : ${c.proposed_decision ?? "—"}`}
                          action={decideDeliberation}
                          hidden={{ id: d.id, student_id: c.student_id }}
                          submitLabel="Enregistrer la décision"
                          fields={[
                            { name: "decision", label: "Décision", type: "select", required: true, options: decisionOptions, defaultValue: c.decision ?? c.proposed_decision ?? undefined, wide: true },
                            { name: "validate_credits", label: "Le jury accorde les crédits manquants (UE validées par le jury)", type: "checkbox", defaultValue: c.validate_credits ? "true" : undefined },
                            { name: "comment", label: "Motivation / observation", type: "textarea", defaultValue: c.comment ?? undefined },
                          ]}
                          trigger={
                            <Button variant="ghost" size="sm">
                              <Gavel aria-hidden /> Décider
                            </Button>
                          }
                        />
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historique des décisions</CardTitle>
          <CardDescription>Versions antérieures remplacées : rien n&apos;est effacé.</CardDescription>
        </CardHeader>
        {history.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">Aucune modification de décision.</p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Étudiant</TH>
                  <TH>Version</TH>
                  <TH>Décision</TH>
                  <TH>Par</TH>
                  <TH>Date</TH>
                </TR>
              </THead>
              <tbody>
                {history.map((h) => (
                  <TR key={h.id}>
                    <TD className="text-sm">
                      {h.student?.last_name} {h.student?.first_name}
                    </TD>
                    <TD className="text-sm">v{h.version}</TD>
                    <TD className="text-sm">{h.decision ?? h.proposed_decision ?? "—"}</TD>
                    <TD className="text-sm">{person(h.decider) ?? "Proposition automatique"}</TD>
                    <TD className="text-sm">{h.decided_at ? formatDateTime(h.decided_at, "fr-FR", tz) : "—"}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
