"use client";

import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createStaffAccount } from "@/features/staff/actions";

/** Création du compte de connexion : le mot de passe provisoire est affiché une seule fois. */
export function CreateAccountDialog({ staffId, roles, defaultRoleId }: { staffId: string; roles: { id: string; name: string }[]; defaultRoleId?: string }) {
  const [state, formAction, pending] = useActionState(createStaffAccount, null);
  const created = state?.ok ? state.data : undefined;
  const router = useRouter();
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open && created) router.refresh();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <KeyRound aria-hidden /> Créer le compte de connexion
        </Button>
      </DialogTrigger>
      <DialogContent title="Compte de connexion" description="Connexion par e-mail ou par matricule + mot de passe. Le QR du badge ne sert qu'au pointage.">
        {created ? (
          <div className="grid gap-3">
            <Alert tone="success">{state?.message}</Alert>
            <dl className="grid gap-2 rounded-xl bg-muted/50 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Identifiant</dt>
                <dd className="font-medium">{created.login}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Mot de passe provisoire</dt>
                <dd className="font-mono font-semibold" data-testid="temporary-password">
                  {created.password}
                </dd>
              </div>
            </dl>
            <DialogClose asChild>
              <Button>Terminé</Button>
            </DialogClose>
          </div>
        ) : (
          <ActionForm dispatch={formAction} pending={pending} className="grid gap-4">
            <input type="hidden" name="staff_id" value={staffId} />
            <div className="grid gap-1.5">
              <Label htmlFor="account-role">Rôle</Label>
              <Select id="account-role" name="role_id" defaultValue={defaultRoleId ?? roles[0]?.id} required>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>
            {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Annuler
                </Button>
              </DialogClose>
              <SubmitButton>Créer le compte</SubmitButton>
            </div>
          </ActionForm>
        )}
      </DialogContent>
    </Dialog>
  );
}
