import { Calculator, FileDown, FileText, Send, Settings2 } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkSelect } from "@/components/shared/link-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { getClasses, getCurrentYear, getPeriods } from "@/features/academic/queries";
import { computeReportCards, publishReportCards } from "@/features/report-cards/actions";
import { AppreciationDialog } from "@/features/report-cards/components/appreciation-dialog";
import { listReportCards, reportClassAverage } from "@/features/report-cards/queries";
import { todayIn } from "@/lib/dates";
import { featureEnabled } from "@/lib/features";
import { requireOrganization } from "@/lib/auth/guards";
import { can, canAny } from "@/lib/auth/session";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Bulletins" };

const fmt = (n: number | null) => (n === null ? "—" : n.toFixed(2).replace(".", ","));

export default async function ReportCardsPage({ searchParams }: PageProps<"/bulletins">) {
  const context = await requireOrganization();
  if (!canAny(context, ["report_cards.manage", "grades.read"])) notFound();
  const organizationId = context.organization.id;
  const params = await searchParams;
  const year = await getCurrentYear(organizationId);
  if (!year) notFound();
  const [classes, periods] = await Promise.all([getClasses(organizationId, year.id), getPeriods(organizationId, year.id)]);
  const today = todayIn(context.organization.timezone);
  const classe = param(params, "classe");
  const periode = param(params, "periode");
  const classId = isUuid(classe) && classes.some((c) => c.id === classe) ? classe : classes[0]?.id;
  const period =
    periods.find((p) => p.id === periode) ?? periods.find((p) => p.starts_on <= today && p.ends_on >= today) ?? periods[0];
  const cards = classId && period ? await listReportCards(organizationId, classId, period.id) : [];
  const ranking = featureEnabled(context.organization, "ranking");
  const canManage = can(context, "report_cards.manage");
  const canPdf = can(context, "documents.generate") && (canManage || can(context, "report_cards.publish"));
  const drafts = cards.filter((c) => c.status === "draft").length;
  const classAverage = cards[0] ? reportClassAverage(cards[0].data) : null;
  const query = (c?: string, p?: string) => `/bulletins?classe=${c ?? classId ?? ""}&periode=${p ?? period?.id ?? ""}`;

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">Pédagogie</p>
          <h1 className="text-2xl font-semibold sm:text-[26px]">Bulletins</h1>
          <p className="text-sm text-muted-foreground">
            Moyennes pondérées par coefficient{ranking ? ", rang dans la classe" : ""}, appréciations et publication aux familles.
          </p>
        </div>
        {classId && period ? (
          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <Button asChild variant="ghost">
                <Link href="/bulletins/configuration">
                  <Settings2 aria-hidden /> Configurer le bulletin
                </Link>
              </Button>
            ) : null}
            {canManage ? (
              <ConfirmAction
                trigger={
                  <Button variant="secondary">
                    <Calculator aria-hidden /> {cards.length ? "Recalculer" : "Calculer"}
                  </Button>
                }
                title="Calculer les bulletins ?"
                description="Les moyennes et rangs sont calculés à partir de toutes les notes de la période. Les bulletins déjà publiés ne sont pas modifiés ; les appréciations sont conservées."
                confirmLabel="Calculer"
                action={computeReportCards}
                fields={{ class_id: classId, period_id: period.id }}
              />
            ) : null}
            {canPdf && cards.length - drafts > 0 ? (
              <Button asChild variant="secondary">
                <a href={`/api/documents/bulletins?classe=${classId}&periode=${period.id}`} target="_blank" rel="noopener">
                  <FileDown aria-hidden /> Générer les bulletins de la classe
                </a>
              </Button>
            ) : null}
            {can(context, "report_cards.publish") && drafts > 0 ? (
              <ConfirmAction
                trigger={
                  <Button>
                    <Send aria-hidden /> Publier ({drafts})
                  </Button>
                }
                title="Publier les bulletins ?"
                description="Les élèves et leurs parents pourront consulter les bulletins et seront notifiés. Un bulletin publié n'est plus modifiable."
                confirmLabel="Publier"
                action={publishReportCards}
                fields={{ class_id: classId, period_id: period.id }}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <LinkSelect
          label="Classe"
          className="w-full sm:w-56"
          value={classId ?? ""}
          options={classes.map((c) => ({ value: c.id, label: c.name, href: query(c.id) }))}
        />
        <LinkSelect
          label="Période"
          className="w-full sm:w-56"
          value={period?.id ?? ""}
          options={periods.map((p) => ({ value: p.id, label: p.name, href: query(undefined, p.id) }))}
        />
      </div>

      {cards.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Élèves", String(cards.length)],
            ["Moyenne de classe", fmt(classAverage)],
            ["Publiés", `${cards.length - drafts} / ${cards.length}`],
            ["Moyenne ≥ 10", String(cards.filter((c) => (c.average ?? 0) >= 10).length)],
          ].map(([label, value]) => (
            <Card key={label} className="grid gap-0.5 p-4">
              <span className="text-sm text-muted-foreground">{label}</span>
              <strong className="font-display text-xl tabular-nums">{value}</strong>
            </Card>
          ))}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        {!period ? (
          <CardContent className="pt-5">
            <EmptyState icon={FileText} title="Aucune période définie" />
          </CardContent>
        ) : cards.length === 0 ? (
          <CardContent className="pt-5">
            <EmptyState
              icon={FileText}
              title="Aucun bulletin pour cette classe et cette période"
              description={canManage ? "Lancez le calcul une fois les notes saisies." : undefined}
            />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr>
                {ranking ? <TH className="w-16">Rang</TH> : null}
                <TH>Élève</TH>
                <TH className="text-right">Moyenne</TH>
                <TH>Appréciation / décision</TH>
                <TH>Statut</TH>
                <TH className="sr-only">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {cards.map((card) => {
                const name = card.student ? `${card.student.last_name} ${card.student.first_name}` : "—";
                return (
                  <TR key={card.id}>
                    {ranking ? (
                      <TD className="font-semibold tabular-nums">
                        {card.rank ? `${card.rank}${card.rank === 1 ? "er" : "e"}` : "—"}
                      </TD>
                    ) : null}
                    <TD>
                      <span className="grid">
                        <span className="font-semibold">{name}</span>
                        <span className="text-xs text-muted-foreground">{card.student?.matricule}</span>
                      </span>
                    </TD>
                    <TD className="text-right font-display text-base font-semibold tabular-nums">{fmt(card.average)}</TD>
                    <TD className="max-w-xs">
                      <span className="line-clamp-2 text-sm text-muted-foreground">
                        {[card.decision, card.appreciation].filter(Boolean).join(" — ") || "—"}
                      </span>
                    </TD>
                    <TD>{card.status === "published" ? <Badge tone="success">Publié</Badge> : <Badge>Brouillon</Badge>}</TD>
                    <TD className="text-right">
                      <span className="inline-flex gap-1">
                        {canManage && card.status === "draft" ? (
                          <AppreciationDialog
                            reportCardId={card.id}
                            studentName={name}
                            values={{ appreciation: card.appreciation, head_teacher_comment: card.head_teacher_comment, decision: card.decision }}
                          />
                        ) : null}
                        {canPdf ? (
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            aria-label={`${card.status === "published" ? "Générer le bulletin PDF" : "Aperçu PDF provisoire"} — ${name}`}
                          >
                            <a href={`/api/documents/bulletins/${card.id}`} target="_blank" rel="noopener">
                              <FileDown aria-hidden />
                            </a>
                          </Button>
                        ) : null}
                      </span>
                    </TD>
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
