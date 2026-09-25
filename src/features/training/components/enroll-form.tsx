"use client";

import { CheckCircle2, FileText, Receipt, UserRound } from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { ActionForm } from "@/components/shared/action-form";
import { FormSection } from "@/components/shared/form-section";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { enrollLearner } from "@/features/training/actions";
import type { ActionResult } from "@/lib/utils/action-result";
import { cn } from "@/lib/utils/cn";

export type EnrollSession = {
  id: string;
  name: string;
  formation: string;
  starts_on: string | null;
  ends_on: string | null;
  capacity: number | null;
  headcount: number;
  tuition: number;
  registration: number;
  installments: number | null;
  groups: { id: string; name: string; capacity: number | null }[];
};

type Result = ActionResult<{ studentId: string; invoiceId: string | null; paymentId: string | null }>;

const METHODS: [string, string][] = [
  ["cash", "Espèces"],
  ["mobile_money", "Mobile Money"],
  ["bank_transfer", "Virement"],
  ["card", "Carte"],
  ["cheque", "Chèque"],
  ["other", "Autre"],
];

/**
 * Inscription d'un apprenant : apprenant → formation / session → groupe
 * (facultatif) → tarif → paiement intégral ou échelonné → premier versement.
 * Tout est recalculé et contrôlé en base (enroll_learner) ; l'aperçu ici n'est
 * qu'indicatif.
 */
export function EnrollForm({
  sessions,
  learners,
  groupsEnabled,
  currency,
  today,
  can,
  defaultSessionId,
  defaultStudentId,
}: {
  sessions: EnrollSession[];
  learners: { id: string; label: string }[];
  groupsEnabled: boolean;
  currency: string;
  today: string;
  can: { payment: boolean; discount: boolean };
  defaultSessionId?: string;
  defaultStudentId?: string;
}) {
  const [mode, setMode] = useState<"new" | "existing">(defaultStudentId ? "existing" : "new");
  const [sessionId, setSessionId] = useState(defaultSessionId ?? sessions[0]?.id ?? "");
  const [plan, setPlan] = useState<"full" | "installments">("installments");
  const session = sessions.find((s) => s.id === sessionId);
  const [installments, setInstallments] = useState<number>(session?.installments ?? 3);
  const [discount, setDiscount] = useState(0);
  const [payment, setPayment] = useState(0);
  const [state, action, pending] = useActionState(async (prev: Result | null, formData: FormData) => {
    const result = await enrollLearner(prev, formData);
    notifyResult(result);
    return result;
  }, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const money = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

  const total = session ? Math.max(0, session.tuition + session.registration - discount) : 0;
  const schedule = useMemo(() => {
    const n = plan === "full" ? 1 : Math.min(24, Math.max(1, installments || 1));
    const first = session?.starts_on && session.starts_on > today ? session.starts_on : today;
    const each = Math.floor(total / n);
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(`${first}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + i);
      return { label: n === 1 ? "Paiement intégral" : `Échéance ${i + 1}/${n}`, due: d.toISOString().slice(0, 10), amount: i === n - 1 ? total - each * (n - 1) : each };
    });
  }, [plan, installments, total, session?.starts_on, today]);

  if (state?.ok && state.data) {
    return (
      <Card className="anim-fade-up">
        <CardContent className="grid justify-items-center gap-4 py-10 text-center">
          <CheckCircle2 className="anim-pop size-14 text-success" aria-hidden />
          <div className="grid gap-1">
            <p className="text-xl font-semibold">Inscription enregistrée</p>
            <p className="text-sm text-muted-foreground">Matricule attribué, facture et échéancier créés, versement enregistré s&apos;il y en a un.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href={`/eleves/${state.data.studentId}?onglet=formation`}>
                <UserRound aria-hidden /> Ouvrir le dossier de l&apos;apprenant
              </Link>
            </Button>
            {state.data.paymentId ? (
              <Button asChild variant="secondary">
                <a href={`/api/documents/recus/${state.data.paymentId}`} target="_blank" rel="noreferrer">
                  <Receipt aria-hidden /> Reçu du versement
                </a>
              </Button>
            ) : null}
            {state.data.invoiceId ? (
              <Button asChild variant="secondary">
                <a href={`/api/documents/factures/${state.data.invoiceId}`} target="_blank" rel="noreferrer">
                  <FileText aria-hidden /> Facture et échéancier
                </a>
              </Button>
            ) : null}
            <Button asChild variant="ghost">
              <a href={`/formation/inscription?session=${sessionId}`}>Nouvelle inscription</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <ActionForm dispatch={action} pending={pending} className="grid gap-5" noValidate>
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}

      <FormSection title="1. Apprenant" description="Nouvel apprenant ou apprenant déjà enregistré dans le centre.">
        <div className="flex flex-wrap gap-2 sm:col-span-2" role="radiogroup" aria-label="Type d'apprenant">
          {(["new", "existing"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
                mode === m ? "border-primary bg-primary-soft text-primary" : "border-border hover:bg-surface-muted",
              )}
            >
              {m === "new" ? "Nouvel apprenant" : "Apprenant existant"}
            </button>
          ))}
        </div>
        {mode === "existing" ? (
          <FormField id="student_id" label="Apprenant" errors={errors.student_id} className="sm:col-span-2">
            <Select id="student_id" name="student_id" defaultValue={defaultStudentId ?? ""} required>
              <option value="">Choisir…</option>
              {learners.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </Select>
          </FormField>
        ) : (
          <>
            <FormField id="last_name" label="Nom *" errors={errors.last_name}>
              <Input id="last_name" name="last_name" autoComplete="off" required />
            </FormField>
            <FormField id="first_name" label="Prénoms *" errors={errors.first_name}>
              <Input id="first_name" name="first_name" autoComplete="off" required />
            </FormField>
            <FormField id="sex" label="Sexe">
              <Select id="sex" name="sex" defaultValue="">
                <option value="">—</option>
                <option value="F">Féminin</option>
                <option value="M">Masculin</option>
              </Select>
            </FormField>
            <FormField id="birth_date" label="Date de naissance" errors={errors.birth_date}>
              <Input id="birth_date" name="birth_date" type="date" max={today} />
            </FormField>
            <FormField id="birth_place" label="Lieu de naissance">
              <Input id="birth_place" name="birth_place" />
            </FormField>
            <FormField id="phone" label="Téléphone">
              <Input id="phone" name="phone" type="tel" placeholder="+225 07 …" />
            </FormField>
            <FormField id="email" label="E-mail" errors={errors.email}>
              <Input id="email" name="email" type="email" />
            </FormField>
            <FormField id="city" label="Ville">
              <Input id="city" name="city" />
            </FormField>
          </>
        )}
        <FormField id="education_level" label="Niveau d'étude" hint="Dernier diplôme ou classe atteinte.">
          <Input id="education_level" name="education_level" placeholder="BEPC, BAC, Licence…" />
        </FormField>
      </FormSection>

      {mode === "new" ? (
        <FormSection title="2. Personne à contacter" description="Parent, tuteur ou proche joignable en cas de besoin (facultatif).">
          <FormField id="contact_last_name" label="Nom">
            <Input id="contact_last_name" name="contact_last_name" />
          </FormField>
          <FormField id="contact_first_name" label="Prénoms">
            <Input id="contact_first_name" name="contact_first_name" />
          </FormField>
          <FormField id="contact_phone" label="Téléphone">
            <Input id="contact_phone" name="contact_phone" type="tel" />
          </FormField>
          <FormField id="contact_relationship" label="Lien">
            <Select id="contact_relationship" name="contact_relationship" defaultValue="other">
              <option value="father">Père</option>
              <option value="mother">Mère</option>
              <option value="tutor">Tuteur</option>
              <option value="sibling">Frère / sœur</option>
              <option value="other">Autre</option>
            </Select>
          </FormField>
        </FormSection>
      ) : null}

      <FormSection title={`${mode === "new" ? 3 : 2}. Formation et session`} description="Sessions en cours ou à venir d'une formation active.">
        <FormField id="session_id" label="Session *" errors={errors.session_id} className="sm:col-span-2">
          <Select
            id="session_id"
            name="session_id"
            value={sessionId}
            onChange={(e) => {
              setSessionId(e.target.value);
              setInstallments(sessions.find((s) => s.id === e.target.value)?.installments ?? 3);
            }}
            required
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id} disabled={s.capacity !== null && s.headcount >= s.capacity}>
                {s.formation} — {s.name}
                {s.capacity !== null ? ` (${s.headcount}/${s.capacity}${s.headcount >= s.capacity ? ", complète" : ""})` : ""}
              </option>
            ))}
          </Select>
        </FormField>
        {groupsEnabled && session && session.groups.length > 0 ? (
          <FormField id="group_id" label="Classe / groupe" hint="Facultatif : vide = toute la session." errors={errors.group_id}>
            <Select id="group_id" name="group_id" defaultValue="">
              <option value="">Aucun groupe</option>
              {session.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}
      </FormSection>

      <FormSection title={`${mode === "new" ? 4 : 3}. Tarif et paiement`} description="Facture et échéancier générés automatiquement, liés à l'inscription.">
        <div className="grid gap-1 rounded-2xl bg-surface-muted/60 p-4 text-sm sm:col-span-2">
          <p className="flex justify-between">
            <span>Coût de la formation</span>
            <strong className="tabular-nums">{money(session?.tuition ?? 0)}</strong>
          </p>
          <p className="flex justify-between">
            <span>Frais d&apos;inscription</span>
            <strong className="tabular-nums">{money(session?.registration ?? 0)}</strong>
          </p>
          {discount > 0 ? (
            <p className="flex justify-between text-success">
              <span>Remise</span>
              <strong className="tabular-nums">− {money(discount)}</strong>
            </p>
          ) : null}
          <p className="mt-1 flex justify-between border-t border-border pt-2 text-base">
            <span>Total à payer</span>
            <strong className="tabular-nums" data-testid="enroll-total">
              {money(total)}
            </strong>
          </p>
        </div>
        <FormField id="plan" label="Mode de paiement">
          <Select id="plan" name="plan" value={plan} onChange={(e) => setPlan(e.target.value as "full" | "installments")}>
            <option value="full">Paiement intégral</option>
            <option value="installments">Paiement échelonné</option>
          </Select>
        </FormField>
        {plan === "installments" ? (
          <FormField id="installments" label="Nombre d'échéances (mensuelles)">
            <Input id="installments" name="installments" type="number" min={1} max={24} value={installments} onChange={(e) => setInstallments(Number(e.target.value))} />
          </FormField>
        ) : null}
        {can.discount ? (
          <>
            <FormField id="discount" label="Remise (facultatif)" errors={errors.discount}>
              <Input id="discount" name="discount" type="number" min={0} step="1" value={discount || ""} onChange={(e) => setDiscount(Number(e.target.value) || 0)} />
            </FormField>
            <FormField id="discount_reason" label="Motif de la remise">
              <Input id="discount_reason" name="discount_reason" placeholder="Bourse, fratrie…" />
            </FormField>
          </>
        ) : null}
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-medium">Échéancier</p>
          <ul className="grid gap-1 text-sm">
            {schedule.map((s) => (
              <li key={s.label} className="flex justify-between rounded-lg px-2 py-1 odd:bg-surface-muted/50">
                <span>
                  {s.label} · {new Date(`${s.due}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC" })}
                </span>
                <span className="tabular-nums">{money(s.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      </FormSection>

      {can.payment ? (
        <FormSection title={`${mode === "new" ? 5 : 4}. Premier versement`} description="Facultatif. Un reçu est émis immédiatement.">
          <FormField id="payment_amount" label="Montant versé" errors={errors.payment_amount} hint={payment > 0 ? `Reste après versement : ${money(Math.max(0, total - payment))}` : undefined}>
            <Input id="payment_amount" name="payment_amount" type="number" min={0} step="1" value={payment || ""} onChange={(e) => setPayment(Number(e.target.value) || 0)} />
          </FormField>
          <FormField id="payment_method" label="Mode">
            <Select id="payment_method" name="payment_method" defaultValue="cash">
              {METHODS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="payment_reference" label="Référence (Mobile Money, chèque…)">
            <Input id="payment_reference" name="payment_reference" />
          </FormField>
          <FormField id="payer_name" label="Payé par">
            <Input id="payer_name" name="payer_name" />
          </FormField>
        </FormSection>
      ) : null}

      <div className="flex justify-end">
        <SubmitButton size="lg" pendingLabel="Inscription en cours…" disabled={!session}>
          Enregistrer l&apos;inscription
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
