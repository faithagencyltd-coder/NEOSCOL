import { CalendarCheck, CheckCircle2, ClipboardCheck, FileCheck2, KeyRound, Paperclip } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { TabNav } from "@/components/shared/tab-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { getClasses, getCurrentYear } from "@/features/academic/queries";
import { justifyAbsence, reviewJustification, saveRollCall, submitJustification, unlockLesson, validateSession } from "@/features/attendance/actions";
import { RollCall } from "@/features/attendance/components/roll-call";
import { JustificationForm } from "@/features/attendance/components/justification-form";
import { getDayLessons, LESSON_STATUS, listJustifications, listStudentsForJustification } from "@/features/attendance/lessons";
import { getDaySlots, getRollCall, getRollCallClasses, listAbsences } from "@/features/attendance/queries";
import { isIsoDate, isoWeekday, isTime, todayIn, WEEKDAYS } from "@/lib/dates";
import { JUSTIFICATION_STATUS } from "@/lib/labels";
import { requireOrganization } from "@/lib/auth/guards";
import { can, canAny } from "@/lib/auth/session";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Présences" };

const STATUS = {
  absent: { label: "Absent", tone: "danger" },
  late: { label: "Retard", tone: "warning" },
} as const;

export default async function AttendancePage({ searchParams }: PageProps<"/presences">) {
  const context = await requireOrganization();
  const manage = can(context, "attendance.manage");
  const canRead = canAny(context, ["attendance.read", "attendance.manage"]);
  const canJustify = canAny(context, ["attendance.justify", "attendance.manage"]);
  // Enseignant : l'appel se fait depuis « Mes cours », cours déverrouillé par le badge.
  if (!manage && !canRead && !canJustify) {
    if (can(context, "attendance.take")) redirect("/mes-cours");
    notFound();
  }

  const params = await searchParams;
  const tabs = [
    ...(manage ? [{ key: "cours", label: "Cours du jour", href: "/presences?onglet=cours" }] : []),
    ...(manage ? [{ key: "appel", label: "Appel libre", href: "/presences?onglet=appel" }] : []),
    ...(canRead ? [{ key: "registre", label: "Registre des absences", href: "/presences?onglet=registre" }] : []),
    ...(canJustify || canRead ? [{ key: "justificatifs", label: "Justificatifs", href: "/presences?onglet=justificatifs" }] : []),
  ];
  const requestedTab = param(params, "onglet");
  const tab = tabs.some((t) => t.key === requestedTab) ? requestedTab! : tabs[0]!.key;

  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <p className="text-sm text-muted-foreground">Pédagogie</p>
        <h1 className="text-2xl font-semibold sm:text-[26px]">Présences</h1>
      </div>
      <TabNav label="Rubriques des présences" active={tab} tabs={tabs} />
      {tab === "cours" ? <DayLessonsSection params={params} /> : null}
      {tab === "appel" ? <RollCallSection params={params} /> : null}
      {tab === "registre" ? <RegisterSection params={params} /> : null}
      {tab === "justificatifs" ? <JustificationsSection params={params} /> : null}
    </div>
  );
}

/** Cours du jour (administration) : déverrouillage par badge, appel, déverrouillage exceptionnel. */
async function DayLessonsSection({ params }: { params: Record<string, string | string[] | undefined> }) {
  const context = await requireOrganization();
  const organizationId = context.organization.id;
  const year = await getCurrentYear(organizationId);
  if (!year) return <EmptyState icon={CalendarCheck} title="Aucune année scolaire" />;
  const today = todayIn(context.organization.timezone);
  const requestedDate = param(params, "date");
  const date = isIsoDate(requestedDate) && requestedDate <= today ? requestedDate : today;
  const lessons = await getDayLessons(organizationId, year.id, date, isoWeekday(date));
  return (
    <div className="grid gap-4">
      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="onglet" value="cours" />
          <div className="grid gap-1.5">
            <Label htmlFor="date-cours">Date</Label>
            <Input id="date-cours" name="date" type="date" defaultValue={date} max={today} className="w-44" />
          </div>
          <Button type="submit" variant="secondary">
            Afficher
          </Button>
          <p className="text-sm text-muted-foreground">
            {lessons.filter((l) => l.unlock).length} / {lessons.length} cours déverrouillés ·{" "}
            {lessons.filter((l) => l.session?.status === "validated").length} appels validés
          </p>
        </form>
      </Card>
      <Card className="overflow-hidden">
        {lessons.length === 0 ? (
          <EmptyState icon={CalendarCheck} title="Aucun cours à l'emploi du temps ce jour-là" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Horaire</TH>
                <TH>Cours</TH>
                <TH>Enseignant</TH>
                <TH>État</TH>
                <TH className="sr-only">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {lessons.map((lesson) => {
                const status = lesson.session?.status === "validated" ? "validated" : lesson.session ? "in_progress" : lesson.unlock ? "unlocked" : "pending";
                return (
                  <TR key={lesson.id}>
                    <TD className="tabular-nums">
                      {lesson.starts_at}–{lesson.ends_at}
                    </TD>
                    <TD>
                      <span className="grid">
                        <span className="font-medium">
                          {lesson.class_subject?.subject?.name ?? "Cours"} · {lesson.class?.name}
                        </span>
                        <span className="text-xs text-muted-foreground">{lesson.room?.name ?? ""}</span>
                      </span>
                    </TD>
                    <TD>{lesson.teacher ? `${lesson.teacher.last_name} ${lesson.teacher.first_name}` : <Badge tone="warning">Non affecté</Badge>}</TD>
                    <TD>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge value={status} map={LESSON_STATUS} />
                        {lesson.unlock?.method === "manual" ? <Badge tone="warning">Manuel</Badge> : null}
                      </span>
                    </TD>
                    <TD className="text-right">
                      <span className="inline-flex gap-1">
                        {!lesson.unlock && lesson.teacher && date === today ? (
                          <ConfirmAction
                            trigger={
                              <Button variant="secondary" size="sm">
                                <KeyRound aria-hidden /> Déverrouiller
                              </Button>
                            }
                            title="Déverrouillage exceptionnel"
                            description="À utiliser uniquement si l'enseignant est présent sans son badge. L'opération est tracée dans le journal d'audit."
                            confirmLabel="Déverrouiller"
                            action={unlockLesson}
                            fields={{ slot_id: lesson.id, date }}
                            reason={{ label: "Motif (badge oublié, badge détérioré…)", required: true }}
                          />
                        ) : null}
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/mes-cours/${lesson.id}?date=${date}`}>Ouvrir</Link>
                        </Button>
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

async function RollCallSection({ params }: { params: Record<string, string | string[] | undefined> }) {
  const context = await requireOrganization();
  const organizationId = context.organization.id;
  const year = await getCurrentYear(organizationId);
  if (!year) return <EmptyState icon={CalendarCheck} title="Aucune année scolaire" />;

  const classes = await getRollCallClasses(organizationId, year.id, context.user.id, can(context, "attendance.manage"));
  if (classes.length === 0) {
    return (
      <Card>
        <CardContent className="pt-5">
          <EmptyState icon={ClipboardCheck} title="Aucune classe affectée" description="Vous n'êtes affecté à aucune classe cette année." />
        </CardContent>
      </Card>
    );
  }

  const today = todayIn(context.organization.timezone);
  const requestedClass = param(params, "classe");
  const classId = isUuid(requestedClass) && classes.some((c) => c.id === requestedClass) ? requestedClass : classes[0]!.id;
  const requestedDate = param(params, "date");
  const date = isIsoDate(requestedDate) && requestedDate <= today ? requestedDate : today;
  const slots = await getDaySlots(classId, isoWeekday(date));
  const start = param(params, "debut");
  const end = param(params, "fin");
  const selected = isTime(start) && isTime(end) && end > start ? { start, end } : null;
  const slot = selected ? slots.find((s) => s.startsAt === selected.start) : undefined;
  const rollCall = selected ? await getRollCall(organizationId, classId, date, selected.start) : null;
  const href = (s: { startsAt: string; endsAt: string }) =>
    `/presences?onglet=appel&classe=${classId}&date=${date}&debut=${s.startsAt}&fin=${s.endsAt}`;

  return (
    <div className="grid gap-4">
      <Card className="grid gap-4 p-4 sm:p-5">
        <form method="get" className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
          <input type="hidden" name="onglet" value="appel" />
          <div className="grid gap-1.5">
            <Label htmlFor="classe">Classe</Label>
            <Select id="classe" name="classe" defaultValue={classId}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="date">Date</Label>
            <Input id="date" name="date" type="date" defaultValue={date} max={today} />
          </div>
          <Button type="submit" variant="secondary">
            Afficher les créneaux
          </Button>
        </form>

        <div className="grid gap-2">
          <p className="text-sm font-semibold">
            Créneaux du {WEEKDAYS[isoWeekday(date)]?.toLowerCase()} {formatDate(date, "fr-FR", { day: "numeric", month: "long" })}
          </p>
          {slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun cours à l&apos;emploi du temps ce jour-là : indiquez l&apos;horaire ci-dessous.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => {
                const active = selected?.start === s.startsAt;
                return (
                  <Link
                    key={s.id}
                    href={href(s)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium",
                      active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary",
                    )}
                  >
                    {s.startsAt}–{s.endsAt}
                    {s.subject ? <span className={active ? "" : "text-muted-foreground"}>· {s.subject}</span> : null}
                  </Link>
                );
              })}
            </div>
          )}
          <form method="get" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="onglet" value="appel" />
            <input type="hidden" name="classe" value={classId} />
            <input type="hidden" name="date" value={date} />
            <div className="grid gap-1">
              <Label htmlFor="debut" className="text-xs">
                Début
              </Label>
              <Input id="debut" name="debut" type="time" defaultValue={selected?.start ?? "08:00"} className="h-11 w-32" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="fin" className="text-xs">
                Fin
              </Label>
              <Input id="fin" name="fin" type="time" defaultValue={selected?.end ?? "10:00"} className="h-11 w-32" />
            </div>
            <Button type="submit" variant="ghost">
              Autre horaire
            </Button>
          </form>
        </div>
      </Card>

      {selected && rollCall ? (
        rollCall.students.length === 0 ? (
          <Card>
            <CardContent className="pt-5">
              <EmptyState icon={ClipboardCheck} title="Aucun élève inscrit dans cette classe" />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
          {rollCall.session?.status === "draft" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm">
              <span>Appel enregistré en brouillon : validez-le pour prévenir les familles et l&apos;intégrer aux statistiques.</span>
              <ConfirmAction
                trigger={<Button size="sm">Valider l&apos;appel</Button>}
                title="Valider cet appel ?"
                description="L'appel est verrouillé et les familles des élèves absents ou en retard sont prévenues."
                confirmLabel="Valider"
                action={validateSession}
                fields={{ session_id: rollCall.session.id }}
              />
            </div>
          ) : null}
          <RollCall
            key={`${classId}-${date}-${selected.start}-${rollCall.session?.status ?? "new"}`}
            mode="free"
            action={saveRollCall}
            locked={rollCall.session?.status === "validated"}
            students={rollCall.students}
            existing={rollCall.session?.attendance_records ?? []}
            hidden={{
              class_id: classId,
              date,
              starts_at: selected.start,
              ends_at: selected.end,
              class_subject_id: slot?.classSubjectId ?? "",
            }}
          />
          </div>
        )
      ) : (
        <p className="text-sm text-muted-foreground">Choisissez un créneau pour afficher la liste d&apos;appel.</p>
      )}
    </div>
  );
}

async function RegisterSection({ params }: { params: Record<string, string | string[] | undefined> }) {
  const context = await requireOrganization();
  const organizationId = context.organization.id;
  const year = await getCurrentYear(organizationId);
  const classes = year ? await getClasses(organizationId, year.id) : [];
  const today = todayIn(context.organization.timezone);
  const weekAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10);
  const from = param(params, "du");
  const to = param(params, "au");
  const classe = param(params, "classe");
  const type = param(params, "type");
  const filters = {
    from: isIsoDate(from) ? from : weekAgo,
    to: isIsoDate(to) ? to : today,
    classId: isUuid(classe) ? classe : undefined,
    status: type === "absent" || type === "late" ? type : undefined,
    unjustified: param(params, "non_justifiees") === "1",
  } as const;
  const rows = await listAbsences(organizationId, filters);
  const canJustify = canAny(context, ["attendance.justify", "attendance.manage"]);

  return (
    <div className="grid gap-4">
      <Card className="p-4 sm:p-5">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
          <input type="hidden" name="onglet" value="registre" />
          <div className="grid gap-1.5">
            <Label htmlFor="du">Du</Label>
            <Input id="du" name="du" type="date" defaultValue={filters.from} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="au">Au</Label>
            <Input id="au" name="au" type="date" defaultValue={filters.to} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="classe-r">Classe</Label>
            <Select id="classe-r" name="classe" defaultValue={filters.classId ?? ""}>
              <option value="">Toutes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="type">Type</Label>
            <Select id="type" name="type" defaultValue={filters.status ?? ""}>
              <option value="">Absences et retards</option>
              <option value="absent">Absences</option>
              <option value="late">Retards</option>
            </Select>
          </div>
          <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-1">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="non_justifiees" value="1" defaultChecked={filters.unjustified} className="size-4 accent-[var(--primary)]" />
              Non justifiées
            </label>
            <Button type="submit" variant="secondary">
              Filtrer
            </Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <CardContent className="pt-5">
            <EmptyState icon={CheckCircle2} title="Aucune absence ni retard sur la période" />
          </CardContent>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr>
                    <TH>Date</TH>
                    <TH>Élève</TH>
                    <TH>Classe</TH>
                    <TH>Statut</TH>
                    <TH>Justification</TH>
                  </tr>
                </THead>
                <tbody>
                  {rows.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        <span className="grid">
                          <span>{formatDate(row.session.session_date, "fr-FR", { dateStyle: "medium" })}</span>
                          <span className="text-xs text-muted-foreground">
                            {row.session.starts_at.slice(0, 5)}–{row.session.ends_at.slice(0, 5)}
                          </span>
                        </span>
                      </TD>
                      <TD>
                        {row.student ? (
                          <Link href={`/eleves/${row.student.id}?onglet=presences`} className="font-semibold hover:text-primary">
                            {row.student.last_name} {row.student.first_name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD>{row.session.class?.name ?? "—"}</TD>
                      <TD>
                        <StatusBadge value={row.status} map={STATUS} />
                        {row.minutes_late ? <span className="ml-2 text-xs text-muted-foreground">{row.minutes_late} min</span> : null}
                      </TD>
                      <TD>
                        <Justification row={row} canJustify={canJustify} />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
            <ul className="grid gap-2 p-3 md:hidden">
              {rows.map((row) => (
                <li key={row.id} className="grid gap-2 rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {row.student?.last_name} {row.student?.first_name}
                    </span>
                    <StatusBadge value={row.status} map={STATUS} />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(row.session.session_date, "fr-FR", { dateStyle: "medium" })} · {row.session.starts_at.slice(0, 5)} ·{" "}
                    {row.session.class?.name}
                  </span>
                  <Justification row={row} canJustify={canJustify} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}

function Justification({
  row,
  canJustify,
}: {
  row: { id: string; is_justified: boolean; justification: string | null; student: { first_name: string; last_name: string } | null };
  canJustify: boolean;
}) {
  if (row.is_justified) {
    return (
      <span className="flex items-center gap-2 text-sm">
        <Badge tone="success">Justifiée</Badge>
        <span className="text-muted-foreground">{row.justification}</span>
      </span>
    );
  }
  if (!canJustify) return <Badge tone="warning">Non justifiée</Badge>;
  return (
    <ConfirmAction
      trigger={
        <Button variant="secondary" size="sm">
          Justifier
        </Button>
      }
      title={`Justifier — ${row.student?.first_name ?? ""} ${row.student?.last_name ?? ""}`}
      confirmLabel="Enregistrer"
      action={justifyAbsence}
      fields={{ record_id: row.id }}
      reason={{ label: "Motif (certificat médical, convocation…)", required: true }}
    />
  );
}

/** Justificatifs : dépôt, examen (accepter / refuser / demander une correction). */
async function JustificationsSection({ params }: { params: Record<string, string | string[] | undefined> }) {
  const context = await requireOrganization();
  const organizationId = context.organization.id;
  const status = param(params, "statut");
  const filter = status && status in JUSTIFICATION_STATUS ? status : status === "tous" ? undefined : "pending";
  const rows = await listJustifications(organizationId, filter);
  const canReview = can(context, "attendance.justify");
  const year = await getCurrentYear(organizationId);
  const students = canReview && year ? await listStudentsForJustification(organizationId, year.id) : [];
  const today = todayIn(context.organization.timezone);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filtrer par statut" className="flex flex-wrap gap-2">
          {[["pending", "À examiner"], ["correction_requested", "Correction demandée"], ["accepted", "Acceptées"], ["rejected", "Refusées"], ["tous", "Toutes"]].map(([key, label]) => (
            <Link
              key={key}
              href={`/presences?onglet=justificatifs&statut=${key}`}
              aria-current={(filter ?? "tous") === key ? "true" : undefined}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium",
                (filter ?? "tous") === key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        {canReview ? <JustificationForm action={submitJustification} students={students} today={today} /> : null}
      </div>
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <CardContent className="pt-5">
            <EmptyState icon={FileCheck2} title="Aucun justificatif" />
          </CardContent>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
                <div className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {row.student ? (
                      <Link href={`/eleves/${row.student.id}?onglet=presences`} className="font-semibold hover:text-primary">
                        {row.student.last_name} {row.student.first_name}
                      </Link>
                    ) : null}
                    <StatusBadge value={row.status} map={JUSTIFICATION_STATUS} />
                    <Badge>{row.submitted_via === "portal" ? "Déposé par la famille" : "Saisi par l'administration"}</Badge>
                  </div>
                  <p className="text-sm">
                    Du {formatDate(row.starts_on, "fr-FR", { dateStyle: "medium" })} au {formatDate(row.ends_on, "fr-FR", { dateStyle: "medium" })} — {row.reason}
                  </p>
                  {row.review_comment ? <p className="text-xs text-muted-foreground">Commentaire : {row.review_comment}</p> : null}
                  {row.status === "accepted" ? <p className="text-xs text-success">{row.records_justified ?? 0} absence(s) ou retard(s) justifié(s)</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {row.file_id ? (
                    <Button asChild variant="ghost" size="sm">
                      <a href={`/api/fichiers/${row.file_id}`} target="_blank" rel="noopener">
                        <Paperclip aria-hidden /> Pièce jointe
                      </a>
                    </Button>
                  ) : null}
                  {canReview && (row.status === "pending" || row.status === "correction_requested") ? (
                    <>
                      <ConfirmAction
                        trigger={<Button size="sm">Accepter</Button>}
                        title="Accepter le justificatif ?"
                        description="Les absences et retards de la période deviennent justifiés ; la famille est prévenue."
                        confirmLabel="Accepter"
                        action={reviewJustification}
                        fields={{ justification_id: row.id, decision: "accepted" }}
                        reason={{ label: "Commentaire (facultatif)" }}
                      />
                      <ConfirmAction
                        trigger={<Button variant="secondary" size="sm">Demander une correction</Button>}
                        title="Demander une correction"
                        confirmLabel="Envoyer"
                        action={reviewJustification}
                        fields={{ justification_id: row.id, decision: "correction_requested" }}
                        reason={{ label: "Ce qu'il faut corriger ou compléter", required: true }}
                      />
                      <ConfirmAction
                        trigger={<Button variant="ghost" size="sm" className="text-danger">Refuser</Button>}
                        title="Refuser le justificatif ?"
                        confirmLabel="Refuser"
                        tone="danger"
                        action={reviewJustification}
                        fields={{ justification_id: row.id, decision: "rejected" }}
                        reason={{ label: "Motif du refus", required: true }}
                      />
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
