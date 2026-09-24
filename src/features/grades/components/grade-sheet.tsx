"use client";

import { useRef, useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { saveGradeSheet } from "@/features/grades/actions";
import { cn } from "@/lib/utils/cn";
import { useFeedbackAction } from "@/components/motion/use-feedback-action";

type Student = { id: string; first_name: string; last_name: string; matricule: string };
type Grade = { student_id: string; score: number | null; is_absent: boolean; is_exempt: boolean; comment: string | null };
type Row = { score: string; mention: "" | "absent" | "exempt"; comment: string };

const toNumber = (value: string): number | null => {
  const normalized = value.replace(",", ".").trim();
  if (normalized === "") return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : Number.NaN;
};
const fmt = (n: number) => n.toFixed(2).replace(".", ",");

/** Saisie des notes en grille (clavier : Entrée passe à l'élève suivant). */
export function GradeSheet({
  assessmentId,
  maxScore,
  students,
  grades,
  readOnly,
}: {
  assessmentId: string;
  maxScore: number;
  students: Student[];
  grades: Grade[];
  readOnly: boolean;
}) {
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      students.map((s) => {
        const g = grades.find((x) => x.student_id === s.id);
        return [
          s.id,
          {
            score: g?.score === null || g?.score === undefined ? "" : String(g.score).replace(".", ","),
            mention: g?.is_absent ? "absent" : g?.is_exempt ? "exempt" : "",
            comment: g?.comment ?? "",
          },
        ];
      }),
    ),
  );
  const [state, action, pending] = useFeedbackAction(saveGradeSheet);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const scores = students
    .map((s) => (rows[s.id]!.mention ? null : toNumber(rows[s.id]!.score)))
    .filter((n): n is number => n !== null && !Number.isNaN(n));
  const invalid = students.filter((s) => {
    const n = toNumber(rows[s.id]!.score);
    return !rows[s.id]!.mention && n !== null && (Number.isNaN(n) || n < 0 || n > maxScore);
  });
  const payload = students.map((s) => {
    const row = rows[s.id]!;
    const n = toNumber(row.score);
    return {
      student_id: s.id,
      score: row.mention || n === null || Number.isNaN(n) ? null : n,
      is_absent: row.mention === "absent",
      is_exempt: row.mention === "exempt",
      comment: row.comment.trim() || undefined,
    };
  });
  const set = (id: string, patch: Partial<Row>) => setRows((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));

  return (
    <ActionForm dispatch={action} pending={pending} className="grid gap-4">
      <input type="hidden" name="assessment_id" value={assessmentId} />
      <input type="hidden" name="grades" value={JSON.stringify(payload)} />
      {state ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-live="polite">
        {[
          ["Notes saisies", `${scores.length} / ${students.length}`],
          ["Moyenne", scores.length ? fmt(scores.reduce((a, b) => a + b, 0) / scores.length) : "—"],
          ["Plus basse", scores.length ? fmt(Math.min(...scores)) : "—"],
          ["Plus haute", scores.length ? fmt(Math.max(...scores)) : "—"],
        ].map(([label, value]) => (
          <Card key={label} className="grid gap-0.5 p-3">
            <span className="text-xs text-muted-foreground">{label}</span>
            <strong className="font-display text-lg tabular-nums">{value}</strong>
          </Card>
        ))}
      </div>

      <Card className="divide-y divide-border">
        {students.map((student, index) => {
          const row = rows[student.id]!;
          const n = toNumber(row.score);
          const bad = !row.mention && n !== null && (Number.isNaN(n) || n < 0 || n > maxScore);
          return (
            <div key={student.id} className="grid gap-2 p-3 sm:grid-cols-[1fr_8rem_9rem_1fr] sm:items-center sm:px-5">
              <span className="grid min-w-0">
                <span className="truncate font-semibold">
                  {student.last_name} {student.first_name}
                </span>
                <span className="text-xs text-muted-foreground">{student.matricule}</span>
              </span>
              <label className="flex items-center gap-2">
                <span className="sr-only">
                  Note de {student.first_name} {student.last_name}
                </span>
                <input
                  ref={(el) => {
                    inputs.current[index] = el;
                  }}
                  inputMode="decimal"
                  autoComplete="off"
                  value={row.mention ? "" : row.score}
                  disabled={readOnly || Boolean(row.mention)}
                  placeholder={row.mention ? "—" : ""}
                  aria-invalid={bad}
                  onChange={(e) => set(student.id, { score: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      inputs.current[index + 1]?.focus();
                    }
                  }}
                  className={cn(
                    "h-11 w-20 rounded-xl border bg-surface px-3 text-right text-base font-semibold tabular-nums",
                    bad ? "border-danger text-danger" : "border-input",
                  )}
                />
                <span className="text-sm text-muted-foreground">/ {maxScore}</span>
              </label>
              <select
                value={row.mention}
                disabled={readOnly}
                aria-label={`Mention — ${student.first_name}`}
                onChange={(e) => set(student.id, { mention: e.target.value as Row["mention"] })}
                className="h-11 rounded-xl border border-input bg-surface px-2 text-sm"
              >
                <option value="">Noté</option>
                <option value="absent">Absent</option>
                <option value="exempt">Dispensé</option>
              </select>
              <input
                value={row.comment}
                disabled={readOnly}
                maxLength={300}
                placeholder="Commentaire (facultatif)"
                aria-label={`Commentaire — ${student.first_name}`}
                onChange={(e) => set(student.id, { comment: e.target.value })}
                className="h-11 rounded-xl border border-input bg-surface px-3 text-sm"
              />
            </div>
          );
        })}
      </Card>

      {!readOnly ? (
        <div className="sticky bottom-3 flex flex-col items-end gap-2">
          {invalid.length > 0 ? (
            <p className="rounded-lg bg-danger-soft px-3 py-1.5 text-sm font-medium text-danger" role="alert">
              {invalid.length} note(s) invalide(s) : entre 0 et {maxScore}.
            </p>
          ) : null}
          <SubmitButton size="lg" className="w-full shadow-lg sm:w-auto" disabled={invalid.length > 0} pendingLabel="Enregistrement…">
            Enregistrer les notes
          </SubmitButton>
        </div>
      ) : null}
    </ActionForm>
  );
}
