import { BookOpen, FileSearch, Lock, NotebookPen, ScanLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { reopenSession, saveLessonAttendance } from "@/features/attendance/actions";
import { RollCall } from "@/features/attendance/components/roll-call";
import { getLesson, LESSON_STATUS, type LessonStatus } from "@/features/attendance/lessons";
import { isIsoDate, isoWeekday, todayIn } from "@/lib/dates";
import { requireOrganization } from "@/lib/auth/guards";
import { can, canAny } from "@/lib/auth/session";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Cours" };

/** Page d'un cours : l'appel n'est accessible qu'une fois le cours déverrouillé par le badge. */
export default async function LessonPage({ params, searchParams }: PageProps<"/mes-cours/[slotId]">) {
  const context = await requireOrganization();
  if (!canAny(context, ["attendance.take", "attendance.manage"])) notFound();
  const { slotId } = await params;
  const query = await searchParams;
  const organization = context.organization;
  const today = todayIn(organization.timezone);
  const requested = param(query, "date");
  const date = isIsoDate(requested) ? requested : today;
  if (!isUuid(slotId)) notFound();
  const lesson = await getLesson(organization.id, slotId, date);
  if (!lesson || isoWeekday(date) !== lesson.slot.weekday) notFound();
  const { slot, unlock, session, students } = lesson;
  const manage = can(context, "attendance.manage");
  const isMine = slot.teacher?.user_id === context.user.id;
  if (!isMine && !manage) notFound();

  const status: LessonStatus =
    session?.status === "validated"
      ? "validated"
      : session
        ? "in_progress"
        : unlock && date === today
          ? "unlocked"
          : date < today || (date === today && slot.ends_at.slice(0, 5) <= new Intl.DateTimeFormat("fr-FR", { timeZone: organization.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date()))
            ? "missed"
            : "pending";
  const canTake = manage || (date === today && Boolean(unlock));
  const subject = slot.class_subject?.subject?.name ?? "Cours";

  return (
    <div className="grid gap-5">
      <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
        <Link href={`/mes-cours?semaine=${date}`} className="hover:text-primary">
          Mes cours
        </Link>{" "}
        / <span className="text-foreground">{subject} · {slot.class?.name}</span>
      </nav>
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">
              {subject} · {slot.class?.name}
            </h1>
            <StatusBadge value={status} map={LESSON_STATUS} />
          </div>
          <p className="text-sm capitalize text-muted-foreground">
            {formatDate(date, "fr-FR", { weekday: "long", day: "numeric", month: "long" })} · {slot.starts_at.slice(0, 5)}–{slot.ends_at.slice(0, 5)}
            {slot.room ? ` · ${slot.room.name}` : ""}
            {slot.teacher ? ` · ${slot.teacher.first_name} ${slot.teacher.last_name}` : ""}
          </p>
          {unlock ? (
            <p className="text-xs text-muted-foreground">
              Déverrouillé {unlock.method === "badge" ? "par scan du badge" : `manuellement (${unlock.reason})`} à{" "}
              {formatDateTime(unlock.unlocked_at, "fr-FR", organization.timezone)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {slot.class_subject_id ? (
            <Button asChild variant="secondary">
              <Link href={`/notes/${slot.class_subject_id}`}>
                <NotebookPen aria-hidden /> Notes
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="secondary">
            <Link href={`/bulletins/apercu?classe=${slot.class_id}`}>
              <FileSearch aria-hidden /> Aperçu du bulletin
            </Link>
          </Button>
        </div>
      </Card>

      {students.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState icon={BookOpen} title="Aucun élève inscrit dans cette classe" />
          </CardContent>
        </Card>
      ) : !session && !canTake ? (
        <Card className="grid justify-items-center gap-3 p-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-surface-muted text-muted-foreground">
            {date === today ? <ScanLine className="size-7" aria-hidden /> : <Lock className="size-7" aria-hidden />}
          </span>
          <h2 className="text-lg font-semibold">Appel verrouillé</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {date === today
              ? "Scannez votre badge sur la tablette « SCANNER LE BADGE » de l'administration à votre arrivée : l'appel de ce cours sera alors débloqué."
              : date > today
                ? "Ce cours n'a pas encore eu lieu."
                : "L'appel de ce cours n'a pas été fait. Seule l'administration peut le régulariser."}
          </p>
          <p className="text-sm">
            <Badge>{students.length} élèves</Badge>
          </p>
        </Card>
      ) : (
        <>
          {session?.status === "validated" && manage ? (
            <div className="flex justify-end">
              <ConfirmAction
                trigger={<Button variant="secondary">Rouvrir l&apos;appel pour correction</Button>}
                title="Rouvrir l'appel ?"
                description="L'appel repasse en brouillon ; la correction sera tracée dans le journal d'audit."
                confirmLabel="Rouvrir"
                action={reopenSession}
                fields={{ session_id: session.id }}
                reason={{ label: "Motif de la correction", required: true }}
              />
            </div>
          ) : null}
          {session?.notes && session.status === "draft" ? <Alert tone="warning">Appel rouvert : {session.notes}</Alert> : null}
          <RollCall
            key={`${slotId}-${date}-${session?.status ?? "new"}`}
            mode="lesson"
            action={saveLessonAttendance}
            locked={session?.status === "validated"}
            students={students}
            existing={session?.attendance_records ?? []}
            hidden={{ slot_id: slotId, date }}
          />
        </>
      )}
    </div>
  );
}
