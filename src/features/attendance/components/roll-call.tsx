"use client";

import { CheckCheck } from "lucide-react";
import { useActionState, useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { saveRollCall } from "@/features/attendance/actions";
import { cn } from "@/lib/utils/cn";

type Status = "present" | "absent" | "late" | "excused";
type Student = { id: string; first_name: string; last_name: string; matricule: string };
type Existing = { student_id: string; status: Status; minutes_late: number | null; is_justified: boolean };

const STATUSES: { value: Status; label: string; short: string; active: string }[] = [
  { value: "present", label: "Présent", short: "P", active: "bg-success text-white border-success" },
  { value: "absent", label: "Absent", short: "A", active: "bg-danger text-white border-danger" },
  { value: "late", label: "Retard", short: "R", active: "bg-warning text-white border-warning" },
  { value: "excused", label: "Excusé", short: "E", active: "bg-info text-white border-info" },
];

/** Feuille d'appel pensée pour le téléphone : un élève par ligne, 4 boutons larges. */
export function RollCall({
  students,
  existing,
  hidden,
}: {
  students: Student[];
  existing: Existing[];
  hidden: Record<string, string>;
}) {
  const [statuses, setStatuses] = useState<Record<string, { status: Status; minutes: string }>>(() =>
    Object.fromEntries(
      students.map((s) => {
        const record = existing.find((r) => r.student_id === s.id);
        return [s.id, { status: record?.status ?? "present", minutes: record?.minutes_late ? String(record.minutes_late) : "" }];
      }),
    ),
  );
  const [state, action, pending] = useActionState(saveRollCall, null);
  const counts = STATUSES.map((s) => ({ ...s, count: Object.values(statuses).filter((v) => v.status === s.value).length }));
  const records = students.map((s) => ({
    student_id: s.id,
    status: statuses[s.id]!.status,
    minutes_late: statuses[s.id]!.status === "late" && statuses[s.id]!.minutes ? Number(statuses[s.id]!.minutes) : null,
  }));

  return (
    <ActionForm dispatch={action} pending={pending} className="grid gap-4">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="records" value={JSON.stringify(records)} />
      {state ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      {existing.length > 0 && !state ? <Alert tone="info">Un appel existe déjà pour ce créneau : vous le modifiez.</Alert> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm" aria-live="polite">
          {counts.map((c) => (
            <span key={c.value} className="rounded-full bg-surface-muted px-3 py-1 font-medium">
              {c.label}s : {c.count}
            </span>
          ))}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setStatuses((prev) => Object.fromEntries(Object.keys(prev).map((id) => [id, { status: "present", minutes: "" }])))}
        >
          <CheckCheck aria-hidden /> Tous présents
        </Button>
      </div>

      <Card className="divide-y divide-border">
        {students.map((student) => {
          const current = statuses[student.id]!;
          const justified = existing.find((r) => r.student_id === student.id)?.is_justified;
          return (
            <fieldset key={student.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:px-5">
              <legend className="sr-only">
                {student.last_name} {student.first_name}
              </legend>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={`${student.first_name} ${student.last_name}`} className="size-9 text-xs" />
                <span className="grid min-w-0">
                  <span className="truncate font-semibold">
                    {student.last_name} {student.first_name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {student.matricule}
                    {justified ? " · justifié" : ""}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="grid flex-1 grid-cols-4 gap-1.5 sm:flex-none">
                  {STATUSES.map((s) => {
                    const selected = current.status === s.value;
                    return (
                      <button
                        key={s.value}
                        type="button"
                        aria-pressed={selected}
                        aria-label={`${s.label} — ${student.first_name} ${student.last_name}`}
                        onClick={() => setStatuses((prev) => ({ ...prev, [student.id]: { ...prev[student.id]!, status: s.value } }))}
                        className={cn(
                          "h-11 min-w-11 rounded-xl border px-2 text-sm font-semibold transition-colors sm:px-3",
                          selected ? s.active : "border-border bg-surface text-muted-foreground hover:bg-surface-muted",
                        )}
                      >
                        <span className="sm:hidden">{s.short}</span>
                        <span className="hidden sm:inline">{s.label}</span>
                      </button>
                    );
                  })}
                </div>
                {current.status === "late" ? (
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input
                      type="number"
                      min={0}
                      max={600}
                      inputMode="numeric"
                      value={current.minutes}
                      onChange={(e) => setStatuses((prev) => ({ ...prev, [student.id]: { ...prev[student.id]!, minutes: e.target.value } }))}
                      className="h-11 w-16 rounded-xl border border-input bg-surface px-2 text-sm text-foreground"
                      aria-label={`Minutes de retard — ${student.first_name}`}
                    />
                    min
                  </label>
                ) : null}
              </div>
            </fieldset>
          );
        })}
      </Card>
      <div className="sticky bottom-3 flex justify-end">
        <SubmitButton size="lg" className="w-full shadow-lg sm:w-auto" pendingLabel="Enregistrement…">
          Enregistrer l&apos;appel ({students.length} élèves)
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
