"use client";

import { Baby, BookOpen, Check, GraduationCap, School } from "lucide-react";
import { useActionState, useState } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveSchoolLevels } from "@/features/academic/actions";
import {
  LYCEE_TRACK_LABELS,
  LYCEE_TRACKS,
  SCHOOL_LEVEL_HINTS,
  SCHOOL_LEVEL_LABELS,
  SCHOOL_LEVELS,
  type LyceeTrack,
  type SchoolConfig,
  type SchoolLevel,
} from "@/features/academic/school";
import type { ActionResult } from "@/lib/utils/action-result";
import { cn } from "@/lib/utils/cn";

const ICONS: Record<SchoolLevel, typeof School> = { maternelle: Baby, primaire: BookOpen, college: School, lycee: GraduationCap };

/**
 * Module Scolaire : niveaux de l'établissement. Un seul module ; les niveaux
 * déterminent seulement ce qui est proposé (niveaux, séries, matières, menus).
 */
export function SchoolLevelsCard({ config, canEdit }: { config: SchoolConfig; canEdit: boolean }) {
  const [levels, setLevels] = useState<SchoolLevel[]>(config.levels);
  const [tracks, setTracks] = useState<LyceeTrack[]>(config.lyceeTracks.length ? config.lyceeTracks : ["general"]);
  const [state, action, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await saveSchoolLevels(prev, formData);
    notifyResult(result);
    return result;
  }, null);
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const lycee = levels.includes("lycee");

  return (
    <Card className="anim-fade-up overflow-hidden">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Module scolaire
          <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">Niveaux de l&apos;établissement</span>
        </CardTitle>
        <CardDescription>
          Cochez les niveaux que votre établissement possède réellement. Un seul module : les niveaux adaptent les niveaux, séries, matières et menus
          proposés. Décocher un niveau masque ses éléments sans rien supprimer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm dispatch={action} pending={pending} className="grid gap-4">
          {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
          <fieldset className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" disabled={!canEdit}>
            <legend className="sr-only">Niveaux scolaires</legend>
            {SCHOOL_LEVELS.map((level) => {
              const checked = levels.includes(level);
              const Icon = ICONS[level];
              return (
                <label
                  key={level}
                  className={cn(
                    "hover-lift relative flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-primary/40",
                    checked ? "border-primary bg-primary-soft/50" : "border-border bg-surface",
                    !canEdit && "cursor-default",
                  )}
                >
                  <input
                    type="checkbox"
                    name={`level_${level}`}
                    checked={checked}
                    onChange={() => setLevels((l) => toggle(l, level))}
                    className="sr-only"
                    aria-describedby={`hint-${level}`}
                  />
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors", checked ? "bg-primary text-primary-foreground" : "bg-surface-muted text-muted-foreground")}>
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="grid min-w-0 gap-0.5">
                    <span className="font-semibold">{SCHOOL_LEVEL_LABELS[level]}</span>
                    <span id={`hint-${level}`} className="text-xs text-muted-foreground">
                      {SCHOOL_LEVEL_HINTS[level]}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "absolute right-3 top-3 flex size-5 items-center justify-center rounded-md border transition-colors",
                      checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface",
                    )}
                  >
                    {checked ? <Check className="anim-pop size-3.5" /> : null}
                  </span>
                </label>
              );
            })}
          </fieldset>

          {lycee ? (
            <fieldset className="anim-fade-up grid gap-2 rounded-2xl border border-border p-4 sm:grid-cols-[auto_1fr_1fr] sm:items-center" disabled={!canEdit}>
              <legend className="sr-only">Types de lycée</legend>
              <span className="text-sm font-semibold">Lycée :</span>
              {LYCEE_TRACKS.map((track) => (
                <label key={track} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    name={`track_${track}`}
                    checked={tracks.includes(track)}
                    onChange={() => setTracks((t) => toggle(t, track))}
                    className="size-4.5 accent-[var(--primary)]"
                  />
                  {LYCEE_TRACK_LABELS[track]}
                </label>
              ))}
            </fieldset>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {levels.length === 0
                ? "Sélectionnez au moins un niveau."
                : `Niveaux utilisés : ${SCHOOL_LEVELS.filter((l) => levels.includes(l)).map((l) => SCHOOL_LEVEL_LABELS[l]).join(" + ")}${lycee ? ` (${tracks.map((t) => LYCEE_TRACK_LABELS[t].replace("Lycée ", "")).join(" et ")})` : ""}`}
            </p>
            {canEdit ? (
              <SubmitButton pendingLabel="Enregistrement…" disabled={levels.length === 0 || (lycee && tracks.length === 0)}>
                Enregistrer les niveaux
              </SubmitButton>
            ) : (
              <p className="text-xs text-muted-foreground">Modifiable par la direction (paramètres de l&apos;établissement).</p>
            )}
          </div>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
