import { ClipboardCheck, Paperclip } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { TabNav } from "@/components/shared/tab-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { submitJustification } from "@/features/attendance/actions";
import { JustificationForm } from "@/features/attendance/components/justification-form";
import { requirePortal } from "@/features/portal/context";
import { getStudentAttendance, getStudentJustifications } from "@/features/portal/queries";
import { todayIn } from "@/lib/dates";
import { ATTENDANCE_STATUS, JUSTIFICATION_STATUS } from "@/lib/labels";
import { formatDate } from "@/lib/utils/format";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Présences" };

const FILTERS = [
  { key: "tout", label: "Tout" },
  { key: "absences", label: "Absences" },
  { key: "retards", label: "Retards" },
] as const;

/** Présences validées — JAMAIS restreintes, même en cas d'impayé. */
export default async function PortalAttendancePage({ searchParams }: PageProps<"/portail/presences">) {
  const { organization, student } = await requirePortal();
  if (!student) return <EmptyState icon={ClipboardCheck} title="Aucun dossier rattaché" />;
  const params = await searchParams;
  const filter = FILTERS.find((f) => f.key === param(params, "filtre"))?.key ?? "tout";
  const today = todayIn(organization.timezone);
  const [records, justifications] = await Promise.all([
    getStudentAttendance(organization.id, student.id),
    getStudentJustifications(organization.id, student.id),
  ]);
  const shown = records.filter((r) => (filter === "absences" ? r.status === "absent" || r.status === "excused" : filter === "retards" ? r.status === "late" : true));
  const byDate = new Map<string, typeof shown>();
  for (const r of shown) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
  const pendingAbsence = records.find((r) => r.status === "absent" && !r.isJustified);
  const studentOption = [{ id: student.id, name: `${student.first_name} ${student.last_name}` }];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-xl font-bold">Présences</h1>
          <p className="text-sm text-muted-foreground">
            {student.first_name} · appels validés par les enseignants ({records.filter((r) => r.status === "absent").length} absences,{" "}
            {records.filter((r) => r.status === "late").length} retards)
          </p>
        </div>
        <JustificationForm
          action={submitJustification}
          students={studentOption}
          today={today}
          defaults={pendingAbsence ? { studentId: student.id, startsOn: pendingAbsence.date, endsOn: pendingAbsence.date } : { studentId: student.id }}
        />
      </div>

      {justifications.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Justificatifs déposés</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {justifications.map((j) => (
              <div key={j.id} className="grid gap-1.5 rounded-xl border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {j.starts_on === j.ends_on ? `Le ${formatDate(j.starts_on)}` : `Du ${formatDate(j.starts_on)} au ${formatDate(j.ends_on)}`}
                  </span>
                  <StatusBadge value={j.status} map={JUSTIFICATION_STATUS} />
                </div>
                <p className="text-muted-foreground">{j.reason}</p>
                {j.review_comment ? <p className="rounded-lg bg-surface-muted px-3 py-2">Réponse de l&apos;établissement : {j.review_comment}</p> : null}
                <div className="flex flex-wrap items-center gap-3">
                  {j.file_id ? (
                    <a href={`/api/fichiers/${j.file_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
                      <Paperclip className="size-4" aria-hidden /> Pièce jointe
                    </a>
                  ) : null}
                  {j.status === "accepted" ? <span className="text-success">{j.records_justified} absence(s) justifiée(s)</span> : null}
                  {j.status === "correction_requested" ? (
                    <JustificationForm
                      action={submitJustification}
                      students={studentOption}
                      today={today}
                      justificationId={j.id}
                      defaults={{ studentId: student.id, startsOn: j.starts_on, endsOn: j.ends_on, reason: j.reason }}
                      trigger={
                        <Button size="sm" variant="secondary">
                          Compléter le justificatif
                        </Button>
                      }
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <TabNav
        label="Filtrer les présences"
        active={filter}
        tabs={FILTERS.map((f) => ({ key: f.key, label: f.label, href: f.key === "tout" ? "/portail/presences" : `/portail/presences?filtre=${f.key}` }))}
      />
      {byDate.size === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Aucun enregistrement" description="Les appels apparaissent ici dès leur validation par l'enseignant." />
      ) : (
        <div className="grid gap-3">
          {[...byDate.entries()].map(([date, rows]) => (
            <Card key={date}>
              <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold capitalize">
                {formatDate(date, "fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </h2>
              <ul className="divide-y divide-border">
                {rows.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span className="w-24 shrink-0 text-xs font-semibold text-muted-foreground">
                      {r.startsAt ? `${r.startsAt}–${r.endsAt}` : "—"}
                    </span>
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate font-medium">{r.subject ?? "Cours"}</span>
                      {r.status === "late" && (r.arrivedAt || r.minutesLate) ? (
                        <span className="text-xs text-muted-foreground">
                          {r.arrivedAt ? `Arrivé à ${r.arrivedAt}` : ""}
                          {r.minutesLate ? ` · ${r.minutesLate} min de retard` : ""}
                        </span>
                      ) : null}
                      {r.comment ? <span className="text-xs text-muted-foreground">« {r.comment} »</span> : null}
                      {r.isJustified && r.justification ? <span className="text-xs text-info">Justifiée : {r.justification}</span> : null}
                    </span>
                    <StatusBadge value={r.isJustified && r.status === "absent" ? "excused" : r.status} map={ATTENDANCE_STATUS} />
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
