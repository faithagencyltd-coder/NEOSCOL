"use client";

import { CheckCheck, Lock, MessageSquare } from "lucide-react";
import { useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ActionResult } from "@/lib/utils/action-result";
import { cn } from "@/lib/utils/cn";
import { useFeedbackAction } from "@/components/motion/use-feedback-action";

type Status = "present" | "absent" | "late" | "excused";
type Student = { id: string; first_name: string; last_name: string; matricule: string; photo_path?: string | null };
type Existing = {
  student_id: string;
  status: Status;
  minutes_late: number | null;
  arrived_at?: string | null;
  comment?: string | null;
  is_justified: boolean;
};
type Line = { status: Status; minutes: string; arrived: string; comment: string; showComment: boolean };

const STATUSES: { value: Status; label: string; short: string; active: string }[] = [
  { value: "present", label: "Présent", short: "P", active: "bg-success text-white border-success" },
  { value: "late", label: "Retard", short: "R", active: "bg-warning text-white border-warning" },
  { value: "absent", label: "Absent", short: "A", active: "bg-danger text-white border-danger" },
  { value: "excused", label: "Absence justifiée", short: "J", active: "bg-info text-white border-info" },
];

/**
 * Feuille d'appel (téléphone ou tablette) : un élève par ligne, 4 statuts,
 * heure d'arrivée et commentaire. Mode « cours » : brouillon puis validation
 * (verrouillage). Mode libre : saisie par l'administration.
 */
export function RollCall({
  students,
  existing,
  hidden,
  action,
  mode,
  locked = false,
}: {
  students: Student[];
  existing: Existing[];
  hidden: Record<string, string>;
  action: (state: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  mode: "lesson" | "free";
  locked?: boolean;
}) {
  const [lines, setLines] = useState<Record<string, Line>>(() =>
    Object.fromEntries(
      students.map((s) => {
        const record = existing.find((r) => r.student_id === s.id);
        return [
          s.id,
          {
            status: record?.status ?? "present",
            minutes: record?.minutes_late ? String(record.minutes_late) : "",
            arrived: record?.arrived_at?.slice(0, 5) ?? "",
            comment: record?.comment ?? "",
            showComment: Boolean(record?.comment),
          },
        ];
      }),
    ),
  );
  const [state, formAction, pending] = useFeedbackAction(action);
  const update = (id: string, patch: Partial<Line>) => setLines((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));
  const counts = STATUSES.map((s) => ({ ...s, count: Object.values(lines).filter((v) => v.status === s.value).length }));
  const records = students.map((s) => {
    const line = lines[s.id]!;
    return {
      student_id: s.id,
      status: line.status,
      minutes_late: line.status === "late" && line.minutes ? Number(line.minutes) : null,
      arrived_at: line.status === "late" && line.arrived ? line.arrived : null,
      comment: line.comment.trim() || null,
    };
  });

  return (
    <ActionForm dispatch={formAction} pending={pending} className="grid gap-4">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="records" value={JSON.stringify(records)} />
      {state ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      {locked ? (
        <Alert tone="info" title="Appel validé">
          <span className="flex items-center gap-2">
            <Lock className="size-4" aria-hidden /> L&apos;appel est verrouillé ; seule l&apos;administration peut le rouvrir pour correction.
          </span>
        </Alert>
      ) : existing.length > 0 && !state ? (
        <Alert tone="info">Brouillon enregistré : vous pouvez corriger avant de valider.</Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm" aria-live="polite">
          {counts.map((c) => (
            <span key={c.value} className="rounded-full bg-surface-muted px-3 py-1 font-medium">
              {c.label} : {c.count}
            </span>
          ))}
        </div>
        {!locked ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setLines((prev) => Object.fromEntries(Object.entries(prev).map(([id, l]) => [id, { ...l, status: "present" as Status }])))}
          >
            <CheckCheck aria-hidden /> Tous présents
          </Button>
        ) : null}
      </div>

      <Card className="divide-y divide-border">
        {students.map((student) => {
          const line = lines[student.id]!;
          const justified = existing.find((r) => r.student_id === student.id)?.is_justified;
          const name = `${student.first_name} ${student.last_name}`;
          return (
            <fieldset key={student.id} disabled={locked} className="grid gap-2 p-3 sm:px-5">
              <legend className="sr-only">{name}</legend>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={name} photoId={student.photo_path} className="size-9 text-xs" />
                  <span className="grid min-w-0">
                    <span className="truncate font-semibold">
                      {student.last_name} {student.first_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {student.matricule}
                      {justified ? " · justifié par l'administration" : ""}
                    </span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="grid flex-1 grid-cols-4 gap-1.5 sm:flex-none">
                    {STATUSES.map((s) => {
                      const selected = line.status === s.value;
                      return (
                        <button
                          key={s.value}
                          type="button"
                          aria-pressed={selected}
                          aria-label={`${s.label} — ${name}`}
                          onClick={() => update(student.id, { status: s.value })}
                          className={cn(
                            "h-11 min-w-11 rounded-xl border px-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed sm:px-3",
                            selected ? s.active : "border-border bg-surface text-muted-foreground hover:bg-surface-muted",
                          )}
                        >
                          <span className="sm:hidden">{s.short}</span>
                          <span className="hidden sm:inline">{s.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Commentaire — ${name}`}
                    aria-pressed={line.showComment}
                    onClick={() => update(student.id, { showComment: !line.showComment })}
                  >
                    <MessageSquare aria-hidden />
                  </Button>
                </div>
              </div>
              {line.status === "late" || line.showComment ? (
                <div className="flex flex-wrap items-center gap-3 pl-12 text-sm">
                  {line.status === "late" ? (
                    <>
                      <label className="flex items-center gap-2 text-muted-foreground">
                        Arrivé à
                        <input
                          type="time"
                          value={line.arrived}
                          onChange={(e) => update(student.id, { arrived: e.target.value })}
                          className="h-10 rounded-xl border border-input bg-surface px-2 text-foreground"
                          aria-label={`Heure d'arrivée — ${name}`}
                        />
                      </label>
                      <label className="flex items-center gap-2 text-muted-foreground">
                        <input
                          type="number"
                          min={0}
                          max={600}
                          inputMode="numeric"
                          value={line.minutes}
                          onChange={(e) => update(student.id, { minutes: e.target.value })}
                          className="h-10 w-16 rounded-xl border border-input bg-surface px-2 text-foreground"
                          aria-label={`Minutes de retard — ${name}`}
                        />
                        min de retard
                      </label>
                    </>
                  ) : null}
                  {line.showComment ? (
                    <input
                      type="text"
                      maxLength={500}
                      value={line.comment}
                      onChange={(e) => update(student.id, { comment: e.target.value })}
                      placeholder="Commentaire (facultatif)"
                      className="h-10 min-w-56 flex-1 rounded-xl border border-input bg-surface px-3 text-foreground"
                      aria-label={`Commentaire — ${name}`}
                    />
                  ) : null}
                </div>
              ) : null}
            </fieldset>
          );
        })}
      </Card>
      {!locked ? (
        <div className="sticky bottom-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {mode === "lesson" ? (
            <>
              <SubmitButton name="intent" value="draft" variant="secondary" size="lg" className="shadow-lg" pendingLabel="Enregistrement…">
                Enregistrer le brouillon
              </SubmitButton>
              <SubmitButton name="intent" value="validate" size="lg" className="shadow-lg" pendingLabel="Validation…">
                Valider l&apos;appel ({students.length} élèves)
              </SubmitButton>
            </>
          ) : (
            <SubmitButton size="lg" className="w-full shadow-lg sm:w-auto" pendingLabel="Enregistrement…">
              Enregistrer l&apos;appel ({students.length} élèves)
            </SubmitButton>
          )}
        </div>
      ) : null}
    </ActionForm>
  );
}
