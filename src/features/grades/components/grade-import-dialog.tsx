"use client";

import { FileDown, FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { useFeedbackAction } from "@/components/motion/use-feedback-action";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { importGradeSheet } from "@/features/grades/actions";

/**
 * Import des notes depuis Excel (.xlsx) ou CSV : 1) aperçu avec les erreurs
 * ligne par ligne, 2) confirmation. Le modèle est le fichier exporté.
 */
export function GradeImportDialog({ assessmentId }: { assessmentId: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"preview" | "apply">("preview");
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [state, formAction, pending] = useFeedbackAction(importGradeSheet, {
    toastSuccess: false,
    onSuccess: (result) => {
      if (result.ok && result.data?.applied) {
        setOpen(false);
        router.refresh();
      }
    },
  });
  const preview = state?.ok && !state.data?.applied ? state.data : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        setMode("preview");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">
          <FileUp aria-hidden /> Importer (Excel / CSV)
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Importer les notes"
        description="Fichier Excel (.xlsx) ou CSV avec les colonnes Matricule, Nom, Prénom, Note (et facultatives Absent, Dispensé, Commentaire). « abs » = absent, « disp » = dispensé ; une note vide ne modifie rien."
      >
        <ActionForm dispatch={formAction} pending={pending} className="grid gap-4">
          <input type="hidden" name="assessment_id" value={assessmentId} />
          <input type="hidden" name="mode" value={mode} />
          <div className="grid gap-1.5">
            <Label htmlFor="grade-import-file">Fichier</Label>
            <input
              ref={fileRef}
              id="grade-import-file"
              name="file"
              type="file"
              required
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={() => setMode("preview")}
              className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary"
            />
            <a href={`/api/notes/evaluations/${assessmentId}/export`} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
              <FileDown className="size-3.5" aria-hidden /> Télécharger le modèle (liste de la classe au format Excel)
            </a>
          </div>
          {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
          {preview ? (
            <div className="grid gap-2" data-testid="grade-import-preview">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge tone="success">{preview.counts.ok} prête(s)</Badge>
                <Badge tone={preview.counts.error ? "danger" : "neutral"}>{preview.counts.error} erreur(s)</Badge>
                <Badge tone="neutral">{preview.counts.skip} inchangée(s)</Badge>
                {preview.counts.missing ? <Badge tone="warning">{preview.counts.missing} élève(s) absent(s) du fichier</Badge> : null}
              </div>
              <div className="max-h-64 overflow-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface text-left text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5">Ligne</th>
                      <th className="px-2 py-1.5">Élève</th>
                      <th className="px-2 py-1.5">Valeur</th>
                      <th className="px-2 py-1.5">Résultat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lines.map((l) => (
                      <tr key={l.line} className={l.status === "error" ? "bg-danger-soft/60" : undefined}>
                        <td className="px-2 py-1 tabular-nums">{l.line}</td>
                        <td className="px-2 py-1">{l.name || l.matricule || "—"}</td>
                        <td className="px-2 py-1 tabular-nums">{l.value || "—"}</td>
                        <td className="px-2 py-1">{l.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            {preview && preview.counts.ok > 0 ? (
              <SubmitButton onClick={() => setMode("apply")}>Enregistrer {preview.counts.ok} note(s)</SubmitButton>
            ) : (
              <SubmitButton onClick={() => setMode("preview")}>Vérifier le fichier</SubmitButton>
            )}
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
