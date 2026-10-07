"use client";

import { KeyRound, LockOpen, Printer, RefreshCw, ShieldAlert, Smartphone, UserCheck, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

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
  resetGuardianPassword,
  setPortalAccount,
  setPortalOverride,
} from "@/features/portal/actions";
import { useFeedbackAction } from "@/components/motion/use-feedback-action";
import type { ActionResult } from "@/lib/utils/action-result";

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

/** Accès portail d'un parent : activation (téléphone + mot de passe provisoire), nouveau mot de passe, suspension. */
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
          Connexion gratuite par numéro de téléphone et mot de passe (aucun SMS). Le parent voit tous ses enfants rattachés et peut changer son mot de
          passe depuis son portail.
        </p>
        {canManage ? (
          account?.has_account ? (
            <div className="flex flex-wrap gap-2">
              <CredentialsDialog
                action={resetGuardianPassword}
                fields={{ guardian_id: guardianId }}
                trigger={
                  <Button size="sm" variant="secondary">
                    <RefreshCw aria-hidden /> Nouveau mot de passe
                  </Button>
                }
                title="Nouveau mot de passe parent"
                description="Connexion par téléphone + mot de passe."
                intro="Un nouveau mot de passe provisoire sera généré et affiché une seule fois ; l'ancien ne fonctionnera plus."
                submitLabel="Générer"
                loginLabel="Téléphone"
                slipTitle="Accès au portail parent"
              />
              <SuspendToggle kind="guardian" recordId={guardianId} active={account.status === "active"} />
            </div>
          ) : (
            <div>
              <CredentialsDialog
                action={activateGuardianPortal}
                fields={{ guardian_id: guardianId }}
                trigger={
                  <Button size="sm" disabled={!phone}>
                    <KeyRound aria-hidden /> Activer le portail
                  </Button>
                }
                title="Portail parent"
                description="Connexion par téléphone + mot de passe."
                intro={`Un compte sera créé pour le ${phone ?? "téléphone"} avec un mot de passe provisoire, affiché une seule fois. Le parent pourra le changer depuis son portail.`}
                submitLabel="Créer l'accès"
                loginLabel="Téléphone"
                slipTitle="Accès au portail parent"
              />
              {!phone ? <p className="mt-2 text-xs text-warning">Renseignez d&apos;abord le téléphone du parent (format +225…).</p> : null}
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

type Credentials = { login: string; password?: string };

/** Fiche imprimable remise en main propre (identifiant + mot de passe provisoire). */
function printSlip(title: string, loginLabel: string, credentials: Credentials) {
  const win = window.open("", "_blank", "width=480,height=600");
  if (!win) return;
  const doc = win.document;
  doc.title = title;
  const box = doc.createElement("div");
  box.style.cssText = "font-family:system-ui,sans-serif;max-width:380px;margin:32px auto;padding:24px;border:2px dashed #94a3b8;border-radius:16px";
  const line = (tag: string, text: string, css = "") => {
    const el = doc.createElement(tag);
    el.textContent = text;
    el.style.cssText = css;
    box.appendChild(el);
  };
  line("h1", title, "font-size:20px;margin:0 0 16px");
  line("p", `${loginLabel} : ${credentials.login}`, "font-size:16px;margin:8px 0");
  line("p", `Mot de passe provisoire : ${credentials.password ?? ""}`, "font-size:16px;margin:8px 0;font-family:monospace;font-weight:700");
  line("p", `Connexion : ${window.location.origin}/connexion`, "font-size:14px;margin:16px 0 4px");
  line("p", "Changez ce mot de passe à la première connexion (menu Plus › Changer mon mot de passe). Ne le communiquez à personne.", "font-size:12px;color:#475569");
  doc.body.appendChild(box);
  win.focus();
  win.print();
}

/** Création d'un accès ou d'un nouveau mot de passe : identifiants affichés une seule fois. */
function CredentialsDialog({
  action,
  fields,
  trigger,
  title,
  description,
  intro,
  submitLabel,
  loginLabel,
  slipTitle,
}: {
  action: (state: ActionResult<Credentials> | null, formData: FormData) => Promise<ActionResult<Credentials>>;
  fields: Record<string, string>;
  trigger: ReactNode;
  title: string;
  description: string;
  intro: string;
  submitLabel: string;
  loginLabel: string;
  slipTitle: string;
}) {
  const [state, formAction, pending] = useFeedbackAction(action);
  const created = state?.ok ? state.data : undefined;
  const router = useRouter();
  return (
    <Dialog onOpenChange={(open) => !open && created && router.refresh()}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} description={description}>
        {created ? (
          <div className="grid gap-3">
            <Alert tone="success">{state?.message}</Alert>
            <dl className="grid gap-2 rounded-xl bg-surface-muted p-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{loginLabel}</dt>
                <dd className="font-medium">{created.login}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Mot de passe provisoire</dt>
                <dd className="font-mono font-semibold" data-testid="temporary-password">
                  {created.password}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => printSlip(slipTitle, loginLabel, created)}>
                <Printer aria-hidden /> Imprimer la fiche
              </Button>
              <DialogClose asChild>
                <Button>Terminé</Button>
              </DialogClose>
            </div>
          </div>
        ) : (
          <ActionForm dispatch={formAction} pending={pending} className="grid gap-4">
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <p className="text-sm text-muted-foreground">{intro}</p>
            {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Annuler
                </Button>
              </DialogClose>
              <SubmitButton>{submitLabel}</SubmitButton>
            </div>
          </ActionForm>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ActivateStudentDialog({ studentId, hasBirthDate }: { studentId: string; hasBirthDate: boolean }) {
  return (
    <CredentialsDialog
      action={activateStudentPortal}
      fields={{ student_id: studentId }}
      trigger={
        <Button size="sm" disabled={!hasBirthDate}>
          <KeyRound aria-hidden /> Activer le portail élève
        </Button>
      }
      title="Portail élève"
      description="Connexion par matricule + date de naissance + mot de passe."
      intro="Un mot de passe provisoire sera généré et affiché une seule fois ; l'élève pourra le changer depuis son portail."
      submitLabel="Créer l'accès"
      loginLabel="Matricule"
      slipTitle="Accès au portail élève"
    />
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
