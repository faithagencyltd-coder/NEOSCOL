import { Camera, Trash2, UserCog } from "lucide-react";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { FileUploadDialog } from "@/components/shared/file-upload-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { changeStudentStatus, deleteStudent, uploadStudentPhoto } from "@/features/students/actions";
import { STUDENT_STATUS } from "@/lib/labels";

const TARGETS = ["active", "inactive", "withdrawn", "transferred", "graduated"] as const;

/** Photo, changement de statut (désactiver, retirer…) et suppression définitive contrôlée. */
export function StudentLifecycleActions({
  student,
  can,
}: {
  student: { id: string; status: string; matricule: string; archived: boolean };
  can: { update: boolean; archive: boolean; delete: boolean };
}) {
  return (
    <>
      {can.update ? (
        <FileUploadDialog
          title="Photo d'identité"
          description="JPEG ou PNG, 5 Mo maximum. Elle figure sur la carte scolaire, la fiche d'inscription et le dossier complet."
          action={uploadStudentPhoto}
          fields={{ student_id: student.id }}
          trigger={
            <Button variant="secondary">
              <Camera aria-hidden /> Photo
            </Button>
          }
        />
      ) : null}
      {can.archive && !student.archived ? (
        <ConfirmAction
          trigger={
            <Button variant="secondary">
              <UserCog aria-hidden /> Statut
            </Button>
          }
          title="Changer le statut de l'élève"
          description="Retirer ou transférer annule l'inscription de l'année en cours ; l'historique (notes, présences, paiements) est conservé."
          confirmLabel="Enregistrer"
          action={changeStudentStatus}
          fields={{ student_id: student.id }}
          reason={{ label: "Motif", required: true }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="student-status">Nouveau statut</Label>
            <Select id="student-status" name="status" defaultValue={student.status === "active" ? "inactive" : "active"}>
              {TARGETS.filter((s) => s !== student.status).map((s) => (
                <option key={s} value={s}>
                  {STUDENT_STATUS[s]?.label ?? s}
                </option>
              ))}
            </Select>
          </div>
        </ConfirmAction>
      ) : null}
      {can.delete && student.archived ? (
        <ConfirmAction
          trigger={
            <Button variant="ghost" className="text-danger">
              <Trash2 aria-hidden /> Supprimer définitivement
            </Button>
          }
          title="Suppression définitive"
          description="Action irréversible, réservée aux dossiers archivés sans pièce financière ni document officiel. L'opération reste tracée dans le journal d'audit."
          confirmLabel="Supprimer définitivement"
          tone="danger"
          action={deleteStudent}
          fields={{ student_id: student.id }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="delete-confirmation">
              Saisissez le matricule <strong>{student.matricule}</strong> pour confirmer
            </Label>
            <Input id="delete-confirmation" name="confirmation" required autoComplete="off" className="font-mono" />
          </div>
        </ConfirmAction>
      ) : null}
    </>
  );
}
