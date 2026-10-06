"use client";

import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";

import { useFeedbackAction } from "@/components/motion/use-feedback-action";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Credentials } from "@/features/platform/components/org-dialogs";
import { addTeamMember } from "@/features/platform/team-actions";

const ROLE_OPTIONS = [
  { value: "viewer", label: "Lecture seule — consulte, ne modifie rien" },
  { value: "admin", label: "Administrateur — tout, sauf l'équipe" },
  { value: "owner", label: "Propriétaire — tout, y compris l'équipe" },
];

/** Ajout d'un membre : compte existant (rattaché) ou nouveau compte (mot de passe provisoire affiché une fois). */
export function AddTeamMemberDialog() {
  const [state, action, pending] = useFeedbackAction(addTeamMember);
  const router = useRouter();
  const created = state?.ok ? state.data : undefined;
  return (
    <Dialog onOpenChange={(open) => !open && state?.ok && router.refresh()}>
      <DialogTrigger asChild>
        <Button data-testid="team-add">
          <UserPlus aria-hidden /> Ajouter un membre
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Ajouter un membre à l'équipe"
        description="Si un compte existe déjà avec cet e-mail, il est simplement ajouté ; sinon il est créé."
      >
        {created ? (
          <Credentials
            message={state?.message}
            login={created.login}
            password={created.password}
          />
        ) : state?.ok ? (
          <Alert tone="success">{state.message}</Alert>
        ) : (
          <ActionForm
            dispatch={action}
            pending={pending}
            className="grid gap-4"
          >
            {state && !state.ok ? (
              <Alert tone="danger">{state.message}</Alert>
            ) : null}
            <FormField id="team_email" label="E-mail de connexion">
              <Input id="team_email" name="email" type="email" required />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="team_first_name" label="Prénom (nouveau compte)">
                <Input id="team_first_name" name="first_name" maxLength={80} />
              </FormField>
              <FormField id="team_last_name" label="Nom (nouveau compte)">
                <Input id="team_last_name" name="last_name" maxLength={80} />
              </FormField>
            </div>
            <FormField id="team_role" label="Rôle">
              <Select id="team_role" name="role" defaultValue="viewer">
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="flex justify-end">
              <SubmitButton pendingLabel="Ajout…">Ajouter</SubmitButton>
            </div>
          </ActionForm>
        )}
      </DialogContent>
    </Dialog>
  );
}
