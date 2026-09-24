"use client";

import { KeyRound, LockOpen, ShieldAlert, Smartphone, UserCheck, UserX } from "lucide-react";
import { useRouter } from "next/navigation";

import { ActionForm } from "@/components/shared/action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  activateGuardianPortal,
  activateStudentPortal,
  removePortalOverride,
  setPortalAccount,
  setPortalOverride,
} from "@/features/portal/actions";
import { useFeedbackAction } from "@/components/motion/use-feedback-action";

type Account = { has_account: boolean; status?: string; last_sign_in_at?: string | null; login?: string | null } | null;

function AccountState({ account, lastSignIn }: { account: Account; lastSignIn: string | null }) {
  if (!account?.has_account) return <Badge tone="neutral">Portail non activé</Badge>;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge tone={account.status === "active" ? "success" : "danger"}>{account.status === "active" ? "Compte actif" : "Compte suspendu"}</Badge>
      {account.login ? <span className="text-muted-foreground">Identifiant : {account.login}</span> : null}
      <span className="text-muted-foreground">{lastSignIn ? `Dernière connexion : ${lastSignIn}` : "Jamais connecté"}</span>
    </div>
  );
}

function SuspendToggle({ kind, recordId, active }: { kind: "guardian" | "student"; recordId: string; active: boolean }) {
  return active ? (
    <ConfirmAction
      trigger={
        <Button size="sm" variant="secondary">
          <UserX aria-hidden /> Suspendre le compte
        </Button>
      }
      title="Suspendre l'accès au portail ?"
      description="La connexion est bloquée ; aucune donnée n'est supprimée. Le compte peut être réactivé à tout moment."
      confirmLabel="Suspendre"
      tone="danger"
      action={setPortalAccount}
      fields={{ kind, record_id: recordId, active: "false" }}
    />
  ) : (
    <ConfirmAction
      trigger={
        <Button size="sm">
          <UserCheck aria-hidden /> Réactiver le compte
        </Button>
      }
      title="Réactiver l'accès au portail ?"
      confirmLabel="Réactiver"
      action={setPortalAccount}
      fields={{ kind, record_id: recordId, active: "true" }}
    />
  );
}

/** Accès portail d'un parent : activation par téléphone (connexion OTP), suspension. */
export function GuardianPortalAccess({
  guardianId,
  phone,
  account,
  lastSignIn,
  canManage,
}: {
  guardianId: string;
  phone: string | null;
  account: Account;
  lastSignIn: string | null;
  canManage: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="size-4 text-primary" aria-hidden /> Portail parent
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <AccountState account={account} lastSignIn={lastSignIn} />
        <p className="text-sm text-muted-foreground">
          Connexion par numéro de téléphone, nom et prénom, puis code à usage unique reçu par SMS. Le parent voit tous ses enfants rattachés.
        </p>
        {canManage ? (
          account?.has_account ? (
            <div>
              <SuspendToggle kind="guardian" recordId={guardianId} active={account.status === "active"} />
            </div>
          ) : (
            <div>
              <ConfirmAction
                trigger={
                  <Button size="sm" disabled={!phone}>
                    <KeyRound aria-hidden /> Activer le portail
                  </Button>
                }
                title="Activer le portail parent ?"
                description={`Un compte sera créé pour le ${phone ?? "téléphone"} ; le parent se connecte avec ce numéro, son nom, son prénom et le code reçu par SMS.`}
                confirmLabel="Activer"
                action={activateGuardianPortal}
                fields={{ guardian_id: guardianId }}
              />
              {!phone ? <p className="mt-2 text-xs text-warning">Renseignez d&apos;abord le téléphone du parent (format +225…).</p> : null}
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function ActivateStudentDialog({ studentId, hasBirthDate }: { studentId: string; hasBirthDate: boolean }) {
  const [state, formAction, pending] = useFeedbackAction(activateStudentPortal);
  const created = state?.ok ? state.data : undefined;
  const router = useRouter();
  return (
    <Dialog onOpenChange={(open) => !open && created && router.refresh()}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={!hasBirthDate}>
          <KeyRound aria-hidden /> Activer le portail élève
        </Button>
      </DialogTrigger>
      <DialogContent title="Portail élève" description="Connexion par matricule + date de naissance + mot de passe.">
        {created ? (
          <div className="grid gap-3">
            <Alert tone="success">{state?.message}</Alert>
            <dl className="grid gap-2 rounded-xl bg-surface-muted p-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Matricule</dt>
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
            <input type="hidden" name="student_id" value={studentId} />
            <p className="text-sm text-muted-foreground">Un mot de passe provisoire sera généré et affiché une seule fois ; l&apos;élève pourra le changer depuis son portail.</p>
            {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Annuler
                </Button>
              </DialogClose>
              <SubmitButton>Créer l&apos;accès</SubmitButton>
            </div>
          </ActionForm>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OverrideForm({ studentId }: { studentId: string }) {
  const [state, formAction, pending] = useFeedbackAction(setPortalOverride);
  return (
    <ActionForm dispatch={formAction} pending={pending} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
      <input type="hidden" name="student_id" value={studentId} />
      <FormField id="override-mode" label="Dérogation">
        <Select id="override-mode" name="mode" defaultValue="unrestricted">
          <option value="unrestricted">Débloquer (échéancier accordé)</option>
          <option value="restricted">Restreindre manuellement</option>
        </Select>
      </FormField>
      <FormField id="override-expires" label="Jusqu'au (facultatif)">
        <Input id="override-expires" name="expires_on" type="date" />
      </FormField>
      <FormField id="override-reason" label="Motif" className="sm:col-span-2">
        <Textarea id="override-reason" name="reason" rows={2} required minLength={3} maxLength={500} />
      </FormField>
      {state ? (
        <Alert tone={state.ok ? "success" : "danger"} className="sm:col-span-2">
          {state.message}
        </Alert>
      ) : null}
      <div className="sm:col-span-2">
        <SubmitButton size="sm">Enregistrer la dérogation</SubmitButton>
      </div>
    </ActionForm>
  );
}

/** Onglet « Portail » du dossier élève : compte élève, état des restrictions, dérogation. */
export function StudentPortalAccess({
  studentId,
  hasBirthDate,
  account,
  lastSignIn,
  status,
  canManage,
}: {
  studentId: string;
  hasBirthDate: boolean;
  account: Account;
  lastSignIn: string | null;
  status: {
    restricted: boolean;
    rules_enabled: boolean;
    overdue: string;
    features: string[];
    override: { mode: string; reason: string; expires_on: string | null } | null;
  } | null;
  canManage: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-primary" aria-hidden /> Compte élève
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <AccountState account={account} lastSignIn={lastSignIn} />
          {canManage ? (
            account?.has_account ? (
              <div>
                <SuspendToggle kind="student" recordId={studentId} active={account.status === "active"} />
              </div>
            ) : (
              <div>
                <ActivateStudentDialog studentId={studentId} hasBirthDate={hasBirthDate} />
                {!hasBirthDate ? <p className="mt-2 text-xs text-warning">La date de naissance est requise : elle sert à la connexion.</p> : null}
              </div>
            )
          ) : null}
          <p className="text-xs text-muted-foreground">Les comptes des parents se gèrent depuis leur fiche (onglet Parents).</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-primary" aria-hidden /> Restrictions d&apos;impayé
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {!status ? (
            <p className="text-muted-foreground">État indisponible.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {status.restricted ? <Badge tone="warning">Portail restreint</Badge> : <Badge tone="success">Accès complet</Badge>}
                {!status.rules_enabled ? <Badge tone="neutral">Règles désactivées</Badge> : null}
                <span className="text-muted-foreground">Échu non réglé : {status.overdue}</span>
              </div>
              {status.restricted && status.features.length ? <p>Suspendu : {status.features.join(", ")}. Les présences restent visibles.</p> : null}
              {status.override ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-info-soft p-3">
                  <span>
                    <LockOpen className="mr-1 inline size-4" aria-hidden />
                    Dérogation : {status.override.mode === "unrestricted" ? "débloqué" : "restreint"} — {status.override.reason}
                    {status.override.expires_on ? ` (jusqu'au ${status.override.expires_on})` : ""}
                  </span>
                  {canManage ? (
                    <ConfirmAction
                      trigger={
                        <Button size="sm" variant="secondary">
                          Retirer
                        </Button>
                      }
                      title="Retirer la dérogation ?"
                      description="Les règles de l'établissement s'appliqueront de nouveau."
                      confirmLabel="Retirer"
                      action={removePortalOverride}
                      fields={{ student_id: studentId }}
                    />
                  ) : null}
                </div>
              ) : canManage ? (
                <OverrideForm studentId={studentId} />
              ) : null}
              <p className="text-xs text-muted-foreground">Un paiement enregistré par l&apos;administration lève la restriction immédiatement.</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
