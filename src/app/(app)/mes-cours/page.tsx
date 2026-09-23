import { CalendarDays, ChevronLeft, ChevronRight, Lock, ScanLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getMyLessons, LESSON_STATUS } from "@/features/attendance/lessons";
import { isIsoDate, isoWeekday, todayIn } from "@/lib/dates";
import { requireOrganization } from "@/lib/auth/guards";
import { canAny } from "@/lib/auth/session";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Mes cours" };

const shift = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/** Emploi du temps daté de l'enseignant : chaque cours est cliquable et indique l'état de l'appel. */
export default async function MyLessonsPage({ searchParams }: PageProps<"/mes-cours">) {
  const context = await requireOrganization();
  if (!canAny(context, ["attendance.take", "grades.enter"])) notFound();
  const params = await searchParams;
  const today = todayIn(context.organization.timezone);
  const requested = param(params, "semaine");
  const anchor = isIsoDate(requested) ? requested : today;
  const monday = shift(anchor, 1 - isoWeekday(anchor));
  const sunday = shift(monday, 6);
  const lessons = await getMyLessons(monday, sunday);
  const days = Array.from({ length: 6 }, (_, i) => shift(monday, i));

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">Pédagogie</p>
          <h1 className="text-2xl font-semibold sm:text-[26px]">Mes cours</h1>
          <p className="text-sm text-muted-foreground">
            L&apos;appel devient disponible après le scan de votre badge sur la tablette de l&apos;administration, pour le cours correspondant uniquement.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" size="icon" aria-label="Semaine précédente">
            <Link href={`/mes-cours?semaine=${shift(monday, -7)}`}>
              <ChevronLeft aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/mes-cours">Cette semaine</Link>
          </Button>
          <Button asChild variant="secondary" size="icon" aria-label="Semaine suivante">
            <Link href={`/mes-cours?semaine=${shift(monday, 7)}`}>
              <ChevronRight aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
      <p className="text-sm font-medium">
        Semaine du {formatDate(monday, "fr-FR", { day: "numeric", month: "long" })} au {formatDate(sunday, "fr-FR", { day: "numeric", month: "long", year: "numeric" })}
      </p>

      {lessons.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarDays} title="Aucun cours cette semaine" description="Votre emploi du temps est défini par l'administration." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {days.map((day) => {
            const items = lessons.filter((l) => l.lesson_date === day);
            if (items.length === 0) return null;
            return (
              <Card key={day} className={cn("grid content-start gap-3 p-4", day === today && "ring-2 ring-primary")}>
                <p className="font-semibold capitalize">
                  {formatDate(day, "fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                  {day === today ? <span className="ml-2 text-xs font-medium text-primary">Aujourd&apos;hui</span> : null}
                </p>
                <ul className="grid gap-2">
                  {items.map((lesson) => (
                    <li key={`${lesson.slot_id}-${day}`}>
                      <Link
                        href={`/mes-cours/${lesson.slot_id}?date=${day}`}
                        className="grid gap-1.5 rounded-xl border border-border p-3 transition-colors hover:border-primary"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-primary">
                            {lesson.starts_at}–{lesson.ends_at}
                          </span>
                          <StatusBadge value={lesson.status} map={LESSON_STATUS} />
                        </span>
                        <span className="font-semibold">
                          {lesson.subject_name} · {lesson.class_name}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {lesson.room_name ? <span>{lesson.room_name}</span> : null}
                          {lesson.room_name && lesson.status === "pending" ? <span aria-hidden>·</span> : null}
                          {lesson.status === "pending" && day === today ? (
                            <>
                              <ScanLine className="size-3.5" aria-hidden /> Scannez votre badge pour débloquer l&apos;appel
                            </>
                          ) : lesson.status === "pending" ? (
                            <>
                              <Lock className="size-3.5" aria-hidden /> Verrouillé
                            </>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
