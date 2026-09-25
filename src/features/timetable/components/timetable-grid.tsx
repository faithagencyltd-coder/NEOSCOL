import { Clock, DoorOpen, Trash2, UserRound } from "lucide-react";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { deleteSlot } from "@/features/timetable/actions";
import type { Slot } from "@/features/timetable/queries";
import { WEEKDAYS } from "@/lib/dates";
import { cn } from "@/lib/utils/cn";

/**
 * Semaine type : une colonne par jour (empilées sur mobile). Chaque créneau
 * affiche l'horaire, la matière et, selon la vue, la classe ou l'enseignant.
 */
export function TimetableGrid({
  slots,
  mode,
  today,
  canManage,
}: {
  slots: Slot[];
  mode: "class" | "teacher" | "room";
  today: number;
  canManage: boolean;
}) {
  const days = [1, 2, 3, 4, 5, 6, ...(slots.some((s) => s.weekday === 7) ? [7] : [])];
  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      {days.map((day) => {
        const daySlots = slots.filter((s) => s.weekday === day);
        const isToday = day === today;
        return (
          <Card key={day} className={cn("grid content-start gap-2 p-3", isToday && "ring-2 ring-primary")}>
            <h2 className="flex items-center justify-between px-1 text-sm font-semibold">
              {WEEKDAYS[day]}
              {isToday ? <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">Aujourd&apos;hui</span> : null}
            </h2>
            {daySlots.length === 0 ? (
              <p className="px-1 py-3 text-xs text-muted-foreground">Aucun cours</p>
            ) : (
              <ul className="grid gap-2">
                {daySlots.map((slot) => (
                  <li
                    key={slot.id}
                    className="grid gap-1 rounded-xl border-l-4 bg-background p-2.5 text-sm"
                    style={{ borderLeftColor: slot.subjectColor ?? "var(--primary)" }}
                  >
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      <Clock className="size-3.5" aria-hidden />
                      {slot.startsAt}–{slot.endsAt}
                    </span>
                    <span className="font-semibold">{slot.subject ?? "Cours"}</span>
                    {slot.group ? <span className="text-xs font-medium text-primary">{slot.group}</span> : null}
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <UserRound className="size-3.5" aria-hidden />
                      {mode === "class" ? (slot.teacher ?? "Enseignant non affecté") : mode === "room" ? `${slot.className}${slot.teacher ? ` · ${slot.teacher}` : ""}` : slot.className}
                    </span>
                    {slot.room ? (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <DoorOpen className="size-3.5" aria-hidden />
                        {slot.room}
                      </span>
                    ) : null}
                    {canManage ? (
                      <ConfirmAction
                        trigger={
                          <Button variant="ghost" size="sm" className="h-8 justify-self-end px-2 text-danger" aria-label="Supprimer le créneau">
                            <Trash2 aria-hidden />
                          </Button>
                        }
                        title="Supprimer ce créneau ?"
                        description={`${WEEKDAYS[slot.weekday]} ${slot.startsAt}–${slot.endsAt} · ${slot.subject ?? ""} · ${slot.className}`}
                        confirmLabel="Supprimer"
                        tone="danger"
                        action={deleteSlot}
                        fields={{ slot_id: slot.id }}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
