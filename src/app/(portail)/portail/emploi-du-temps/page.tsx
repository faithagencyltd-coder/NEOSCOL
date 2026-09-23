import { CalendarClock, DoorOpen, UserRound } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { Card } from "@/components/ui/card";
import { LockedFeature } from "@/features/portal/components/locked-feature";
import { requirePortal } from "@/features/portal/context";
import { getPortalTimetable } from "@/features/portal/queries";
import { isoWeekday, todayIn, WEEKDAYS } from "@/lib/dates";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Emploi du temps" };

export default async function PortalTimetablePage() {
  const { organization, parent, student, status } = await requirePortal();
  if (!student) return <EmptyState icon={CalendarClock} title="Aucun dossier rattaché" />;
  const header = (
    <div className="grid gap-1">
      <h1 className="text-xl font-bold">Emploi du temps</h1>
      <p className="text-sm text-muted-foreground">
        {student.first_name} · {student.class_name ?? "classe non affectée"}
      </p>
    </div>
  );
  if (status?.features.timetable) {
    return (
      <>
        {header}
        <LockedFeature feature="Emploi du temps" overdue={status.overdue_amount} currency={organization.currency} parent={parent} />
      </>
    );
  }
  const slots = await getPortalTimetable(student.id);
  const today = isoWeekday(todayIn(organization.timezone));
  const days = [1, 2, 3, 4, 5, 6, ...(slots.some((s) => s.weekday === 7) ? [7] : [])].filter((d) => d !== 6 || slots.some((s) => s.weekday === 6));
  // Aujourd'hui en premier sur téléphone.
  const ordered = [...days.filter((d) => d >= today), ...days.filter((d) => d < today)];

  return (
    <>
      {header}
      {slots.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Emploi du temps non publié" description="L'établissement n'a pas encore saisi l'emploi du temps de la classe." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {ordered.map((day) => {
            const daySlots = slots.filter((s) => s.weekday === day);
            return (
              <Card key={day} className={cn("grid content-start gap-2 p-3", day === today && "ring-2 ring-primary")}>
                <h2 className="flex items-center justify-between px-1 text-sm font-semibold">
                  {WEEKDAYS[day]}
                  {day === today ? <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">Aujourd&apos;hui</span> : null}
                </h2>
                {daySlots.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-muted-foreground">Aucun cours</p>
                ) : (
                  <ul className="grid grid-cols-1 gap-2">
                    {daySlots.map((s) => (
                      <li key={s.id} className="grid gap-1 rounded-xl border-l-4 bg-background p-2.5 text-sm" style={{ borderLeftColor: s.color ?? "var(--primary)" }}>
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{s.subject ?? "Cours"}</span>
                          <span className="text-xs font-semibold text-muted-foreground">
                            {s.starts_at}–{s.ends_at}
                          </span>
                        </span>
                        <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          {s.teacher ? (
                            <span className="flex items-center gap-1">
                              <UserRound className="size-3.5" aria-hidden /> {s.teacher}
                            </span>
                          ) : null}
                          {s.room ? (
                            <span className="flex items-center gap-1">
                              <DoorOpen className="size-3.5" aria-hidden /> {s.room}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
