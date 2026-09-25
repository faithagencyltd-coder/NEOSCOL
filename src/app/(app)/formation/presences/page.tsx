import { DoorOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMinutes, SCAN_REJECTIONS } from "@/features/training/config";
import { requireTraining } from "@/features/training/guard";
import { learnerAttendanceJournal, learnerScanRejections, referenceNow } from "@/features/training/queries";
import { isIsoDate, todayIn } from "@/lib/dates";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Entrées et sorties des apprenants" };

export default async function LearnerAttendancePage({ searchParams }: PageProps<"/formation/presences">) {
  const context = await requireTraining("attendance.read");
  const organization = context.organization;
  const tz = organization.timezone;
  const today = todayIn(tz);
  const requested = param(await searchParams, "date");
  const date = isIsoDate(requested) && requested <= today ? requested : today;
  const [rows, rejections, now] = await Promise.all([learnerAttendanceJournal(organization.id, date), learnerScanRejections(organization.id, date, tz), referenceNow()]);
  const time = (iso: string | null) => (iso ? new Intl.DateTimeFormat("fr-FR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : null);
  const minutes = (r: (typeof rows)[number]) => Math.floor(((r.exited_at ? new Date(r.exited_at).getTime() : date === today ? now : new Date(r.entered_at).getTime()) - new Date(r.entered_at).getTime()) / 60000);
  const perLearner = new Map<string, number>();
  for (const r of rows) if (r.student) perLearner.set(r.student.id, (perLearner.get(r.student.id) ?? 0) + minutes(r));

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Entrées et sorties des apprenants"
        description="Chaque scan de badge enregistre une ENTRÉE puis une SORTIE ; plusieurs périodes par jour sont additionnées."
        actions={
          <form className="flex items-center gap-2" action="/formation/presences">
            <label htmlFor="jour" className="sr-only">
              Jour
            </label>
            <input id="jour" type="date" name="date" defaultValue={date} max={today} className="h-10 rounded-xl border border-border bg-surface px-3 text-sm" />
            <Button type="submit" variant="secondary" size="sm">
              Afficher
            </Button>
          </form>
        }
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={DoorOpen} title="Aucune entrée ce jour" description="Les apprenants pointent en scannant leur badge sur la tablette." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Apprenant</TH>
                <TH>Session</TH>
                <TH>Cours</TH>
                <TH>Entrée</TH>
                <TH>Sortie</TH>
                <TH className="text-right">Durée</TH>
                <TH className="text-right">Total du jour</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    {r.student ? (
                      <Link href={`/eleves/${r.student.id}?onglet=assiduite`} className="grid hover:text-primary">
                        <span className="font-medium">
                          {r.student.last_name} {r.student.first_name}
                        </span>
                        <span className="text-xs text-muted-foreground">{r.student.matricule}</span>
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="text-sm">
                    {r.session?.name}
                    {r.group ? <span className="block text-xs text-muted-foreground">{r.group.name}</span> : null}
                  </TD>
                  <TD className="text-sm">
                    {r.slot?.class_subject?.subject?.name ?? "Hors cours"}
                    {r.room ? <span className="block text-xs text-muted-foreground">{r.room.name}</span> : null}
                  </TD>
                  <TD className="tabular-nums">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {time(r.entered_at)}
                      {r.minutes_late > 0 ? <Badge tone="warning">Retard {r.minutes_late} min</Badge> : <Badge tone="success">À l&apos;heure</Badge>}
                    </span>
                  </TD>
                  <TD className="tabular-nums">
                    {r.exited_at ? (
                      <span className="flex items-center gap-1.5">
                        {time(r.exited_at)}
                        {r.auto_closed ? <Badge tone="neutral">Clôture auto.</Badge> : null}
                      </span>
                    ) : (
                      <Badge tone="info">Sur place</Badge>
                    )}
                  </TD>
                  <TD className="text-right tabular-nums">{formatMinutes(minutes(r))}</TD>
                  <TD className="text-right tabular-nums">{r.student ? formatMinutes(perLearner.get(r.student.id)) : "—"}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Scans refusés</CardTitle>
          <CardDescription>Badge désactivé, QR invalide, aucun cours prévu, mauvaise salle, double scan…</CardDescription>
        </CardHeader>
        {rejections.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">Aucun refus ce jour.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Heure</TH>
                <TH>Apprenant</TH>
                <TH>Motif</TH>
              </tr>
            </THead>
            <tbody>
              {rejections.map((r) => (
                <TR key={r.id}>
                  <TD className="tabular-nums">{time(r.scanned_at)}</TD>
                  <TD className="text-sm">{r.student ? `${r.student.last_name} ${r.student.first_name}` : "—"}</TD>
                  <TD className="text-sm">
                    <Badge tone="danger">{SCAN_REJECTIONS[r.reason] ?? r.reason}</Badge> <span className="text-muted-foreground">{r.message}</span>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
