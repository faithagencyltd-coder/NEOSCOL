"use client";

import { Building2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { addOrganizationAdmin, createOrganization } from "@/features/platform/actions";
import { useFeedbackAction } from "@/components/motion/use-feedback-action";

export const ORG_TYPE_LABELS: Record<string, string> = {
  primary_school: "École primaire",
  middle_school: "Collège",
  high_school: "Lycée",
  school_complex: "Groupe scolaire",
  university: "Université",
  institute: "Institut",
  vocational_center: "Centre de formation professionnelle",
  technical_center: "Centre de formation technique",
  private_school: "École privée",
  school_group: "Réseau d'établissements",
};

function Credentials({ message, login, password }: { message?: string; login: string; password: string }) {
  return (
    <div className="grid gap-3">
      <Alert tone="success">{message}</Alert>
      <dl className="grid gap-2 rounded-xl bg-surface-muted p-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Identifiant</dt>
          <dd className="font-medium">{login}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Mot de passe provisoire</dt>
          <dd className="font-mono font-semibold" data-testid="temporary-password">
            {password}
          </dd>
        </div>
      </dl>
      <DialogClose asChild>
        <Button>Terminé</Button>
      </DialogClose>
    </div>
  );
}

function AdminFields() {
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-1 text-sm font-semibold">Premier administrateur</legend>
      <FormField id="admin_first_name" label="Prénom">
        <Input id="admin_first_name" name="admin_first_name" required />
      </FormField>
      <FormField id="admin_last_name" label="Nom">
        <Input id="admin_last_name" name="admin_last_name" required />
      </FormField>
      <FormField id="admin_email" label="E-mail de connexion" className="sm:col-span-2">
        <Input id="admin_email" name="admin_email" type="email" required />
      </FormField>
    </fieldset>
  );
}

export function CreateOrganizationDialog() {
  const [state, action, pending] = useFeedbackAction(createOrganization);
  const router = useRouter();
  const created = state?.ok ? state.data : undefined;
  return (
    <Dialog onOpenChange={(open) => !open && created && router.refresh()}>
      <DialogTrigger asChild>
        <Button>
          <Building2 aria-hidden /> Nouvel établissement
        </Button>
      </DialogTrigger>
      <DialogContent title="Nouvel établissement" description="Rôles, formulaires et modèles de documents sont créés automatiquement." className="max-w-xl">
        {created ? (
          <Credentials message={state?.message} login={created.login} password={created.password} />
        ) : (
          <ActionForm dispatch={action} pending={pending} className="grid gap-4">
            {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="name" label="Nom de l'établissement" className="sm:col-span-2">
                <Input id="name" name="name" required minLength={3} />
              </FormField>
              <FormField id="code" label="Code (matricules)" hint="Ex. LSM : matricules LSM-26-00001">
                <Input id="code" name="code" required pattern="[A-Za-z0-9]{2,10}" className="uppercase" />
              </FormField>
              <FormField id="type" label="Type">
                <Select id="type" name="type" defaultValue="school_complex">
                  {Object.entries(ORG_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField id="city" label="Ville">
                <Input id="city" name="city" />
              </FormField>
              <FormField id="currency" label="Devise">
                <Input id="currency" name="currency" defaultValue="XOF" maxLength={3} />
              </FormField>
            </div>
            <AdminFields />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Annuler
                </Button>
              </DialogClose>
              <SubmitButton pendingLabel="Création…">Créer l&apos;établissement</SubmitButton>
            </div>
          </ActionForm>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AddAdminDialog({ organizationId, name }: { organizationId: string; name: string }) {
  const [state, action, pending] = useFeedbackAction(addOrganizationAdmin);
  const router = useRouter();
  const created = state?.ok ? state.data : undefined;
  return (
    <Dialog onOpenChange={(open) => !open && created && router.refresh()}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" aria-label={`Ajouter un administrateur à ${name}`}>
          <UserPlus aria-hidden /> Administrateur
        </Button>
      </DialogTrigger>
      <DialogContent title={`Administrateur — ${name}`} description="Le compte est créé avec un mot de passe provisoire affiché une seule fois.">
        {created ? (
          <Credentials message={state?.message} login={created.login} password={created.password} />
        ) : (
          <ActionForm dispatch={action} pending={pending} className="grid gap-4">
            <input type="hidden" name="organization_id" value={organizationId} />
            {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
            <AdminFields />
            <div className="flex justify-end">
              <SubmitButton pendingLabel="Création…">Créer le compte</SubmitButton>
            </div>
          </ActionForm>
        )}
      </DialogContent>
    </Dialog>
  );
}
