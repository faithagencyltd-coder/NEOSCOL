"use client";

import { ArrowLeft, ArrowRight, Check, Search, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { AnimatedWizard } from "@/components/motion/animated-wizard";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createEnrollment, searchStudentsForEnrollment, type StudentMatch } from "@/features/enrollments/actions";
import type { EnrollmentFeeRate } from "@/features/enrollments/queries";
import { CustomFields } from "@/features/forms/components/custom-fields";
import type { FieldDefinition } from "@/features/forms/fields";
import { RELATIONSHIP } from "@/lib/labels";
import { cn } from "@/lib/utils/cn";
import type { Vocabulary } from "@/lib/vocabulary";

type ClassOption = { id: string; name: string; yearId: string; levelId: string | null; programId: string | null; count: number; capacity: number | null };
type YearOption = { id: string; name: string; is_current: boolean };
type EnrollmentType = "new" | "reenrollment" | "transfer";
type StepKey = "type" | "identity" | "guardian" | "address" | "formation" | "pricing" | "payment" | "documents" | "review";

const TYPES: { value: EnrollmentType; label: string; description: string }[] = [
  { value: "new", label: "Nouvelle inscription", description: "Première inscription dans l'établissement" },
  { value: "reenrollment", label: "Réinscription", description: "Déjà inscrit l'an passé" },
  { value: "transfer", label: "Transfert", description: "Arrivée d'un autre établissement" },
];

const STEP_LABELS: Record<StepKey, string> = {
  type: "Type",
  identity: "Identité",
  guardian: "Parents",
  address: "Adresse",
  formation: "Formation",
  pricing: "Tarification",
  payment: "Paiement",
  documents: "Documents",
  review: "Validation",
};

/** Étape à afficher pour une erreur renvoyée par le serveur. */
function stepOfField(name: string): StepKey {
  if (name === "student_address" || name === "student_city") return "address";
  if (name.startsWith("student_")) return "identity";
  if (name.startsWith("guardian_")) return "guardian";
  if (name === "academic_year_id" || name === "class_id") return "formation";
  return "documents";
}

/**
 * Frais applicables (même règle que enrollment_fee_preview) : pour chaque type
 * de frais obligatoire, le tarif le plus précis (classe > niveau > filière >
 * établissement) ; pas de frais d'inscription pour une réinscription.
 */
function applicableFees(rates: EnrollmentFeeRate[], klass: ClassOption | undefined, type: EnrollmentType) {
  if (!klass) return [];
  const rank = (r: EnrollmentFeeRate) => (r.classId ? 1 : r.levelId ? 2 : r.programId ? 3 : 4);
  const best = new Map<string, EnrollmentFeeRate>();
  for (const r of rates) {
    if (r.yearId !== klass.yearId) continue;
    if (r.classId && r.classId !== klass.id) continue;
    if (r.levelId && r.levelId !== klass.levelId) continue;
    if (r.programId && r.programId !== klass.programId) continue;
    if (r.category === "registration" && type === "reenrollment") continue;
    const current = best.get(r.feeTypeId);
    if (!current || rank(r) < rank(current)) best.set(r.feeTypeId, r);
  }
  return [...best.values()].sort((a, b) => Number(b.category === "registration") - Number(a.category === "registration") || a.name.localeCompare(b.name, "fr"));
}

/** Échéancier (même règle que validate_enrollment) : plan du premier tarif qui en a un, autres frais sur la 1re échéance. */
function schedule(fees: EnrollmentFeeRate[]) {
  const total = fees.reduce((s, f) => s + f.amount, 0);
  const planned = fees.find((f) => f.plan.length > 0);
  if (!planned) return { total, steps: [] as { label: string; dueOn: string; amount: number }[] };
  const other = total - planned.amount;
  let allocated = 0;
  const steps = planned.plan.map((p, i) => {
    const amount = i === planned.plan.length - 1 ? total - allocated : Math.round((planned.amount * p.percent) / 100) + (i === 0 ? other : 0);
    allocated += amount;
    return { label: p.label || `Échéance ${i + 1}`, dueOn: p.dueOn, amount };
  });
  return { total, steps };
}

function StepPanel({ active, direction, title, description, children }: { active: boolean; direction: 1 | -1; title: string; description?: string; children: ReactNode }) {
  return (
    <Card hidden={!active} className={cn("grid gap-5 p-5 sm:p-6", direction === 1 ? "wizard-step-next" : "wizard-step-prev")}>
      <div className="grid gap-0.5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </Card>
  );
}

export function EnrollmentForm({
  years,
  classes,
  forms,
  presetStudent,
  canCreateGuardian,
  feeRates,
  currency,
  vocabulary: v,
}: {
  years: YearOption[];
  classes: ClassOption[];
  forms: { enrollment: FieldDefinition[]; reenrollment: FieldDefinition[] | null };
  presetStudent: StudentMatch | null;
  canCreateGuardian: boolean;
  feeRates: EnrollmentFeeRate[];
  currency: string;
  vocabulary: Vocabulary;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<EnrollmentType>(presetStudent ? "reenrollment" : "new");
  const [student, setStudent] = useState<StudentMatch | null>(presetStudent);
  const [existing, setExisting] = useState<boolean>(Boolean(presetStudent));
  const [yearId, setYearId] = useState(years.find((y) => y.is_current)?.id ?? years[0]?.id ?? "");
  const [classId, setClassId] = useState("");
  const [step, setCurrent] = useState(0);
  const [reached, setReached] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [stepError, setStepError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [summary, setSummary] = useState<FormData | null>(null);

  const yearClasses = useMemo(() => classes.filter((c) => c.yearId === yearId), [classes, yearId]);
  const selectedClass = classes.find((c) => c.id === classId);
  const fields = type === "reenrollment" ? (forms.reenrollment ?? forms.enrollment) : forms.enrollment;
  const useExisting = existing || type === "reenrollment";
  const fees = useMemo(() => applicableFees(feeRates, selectedClass, type), [feeRates, selectedClass, type]);
  const plan = useMemo(() => schedule(fees), [fees]);
  const money = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: currency === "XOF" || currency === "XAF" ? 0 : 2 }).format(n);
  const studentWord = v.student.toLowerCase();

  const steps = (["type", "identity", "guardian", "address", "formation", "pricing", "payment", "documents", "review"] as StepKey[]).filter(
    (key) => (key !== "guardian" || canCreateGuardian) && (key !== "address" || !useExisting),
  );
  // Si le type change (et fait disparaître l'étape « Adresse »), on reste sur une étape valide.
  const current = Math.min(step, steps.length - 1);
  const stepKey = steps[current]!;
  const isLast = current === steps.length - 1;

  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof createEnrollment>> | null, formData: FormData) => {
    const result = await createEnrollment(prev, formData);
    notifyResult(result);
    if (!result.ok) {
      const first = Object.keys(result.fieldErrors ?? {})[0];
      if (first) {
        const target = steps.indexOf(stepOfField(first));
        if (target >= 0) {
          setDirection(-1);
          setCurrent(target);
        }
      }
    }
    return result;
  }, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  const value = (name: string) => {
    const el = formRef.current?.elements.namedItem(name);
    return el && "value" in el ? String(el.value).trim() : "";
  };

  /** Contrôles minimaux avant de passer à l'étape suivante (le serveur revalide tout). */
  const check = (key: StepKey): string | null => {
    if (key === "identity") {
      if (useExisting && !student) return `Sélectionnez ${v.theStudent} à inscrire.`;
      if (!useExisting && (!value("student_last_name") || !value("student_first_name"))) return "Le nom et le prénom sont obligatoires.";
    }
    if (key === "formation" && !classId) return `Choisissez la ${v.klass.toLowerCase()}.`;
    return null;
  };

  const goTo = (index: number) => {
    const target = Math.max(0, Math.min(index, steps.length - 1));
    if (target > current) {
      for (let i = current; i < target; i++) {
        const problem = check(steps[i]!);
        if (problem) {
          setStepError(problem);
          setShake((n) => n + 1);
          setDirection(1);
          setCurrent(i);
          return;
        }
      }
    }
    setStepError(null);
    setDirection(target >= current ? 1 : -1);
    if (steps[target] === "review" && formRef.current) setSummary(new FormData(formRef.current));
    setCurrent(target);
    setReached((r) => Math.max(r, target));
    const top = formRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) formRef.current?.scrollIntoView({ block: "start" });
  };

  // Entrée dans un champ : étape suivante (jamais d'envoi implicite du brouillon).
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    const target = event.target as HTMLElement;
    if (event.key === "Enter" && target.tagName === "INPUT" && !isLast) {
      event.preventDefault();
      goTo(current + 1);
    }
  };

  const show = (key: StepKey) => stepKey === key;

  return (
    <ActionForm ref={formRef} dispatch={action} pending={pending} className="grid gap-5" noValidate onKeyDown={onKeyDown}>
      <Card className="p-4 sm:p-5">
        <AnimatedWizard steps={steps.map((key) => ({ key, label: STEP_LABELS[key] }))} current={current} reached={reached} onSelect={goTo} />
      </Card>

      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}

      <StepPanel active={show("type")} direction={direction} title="Type d'inscription" description="Le type détermine les frais appliqués et le formulaire demandé.">
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="sr-only">Type d&apos;inscription</legend>
          {TYPES.map((t) => (
            <label
              key={t.value}
              className={cn(
                "press flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all duration-200",
                type === t.value ? "border-primary bg-primary-soft/60 shadow-[0_0_0_1px_var(--primary)]" : "border-border hover:-translate-y-0.5 hover:border-primary/50",
              )}
            >
              <input
                type="radio"
                name="type"
                value={t.value}
                checked={type === t.value}
                onChange={() => {
                  setType(t.value);
                  if (t.value === "reenrollment") setExisting(true);
                }}
                className="mt-1 accent-[var(--primary)]"
              />
              <span className="grid gap-0.5">
                <span className="text-sm font-semibold">{t.label}</span>
                <span className="text-xs text-muted-foreground">{t.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </StepPanel>

      <StepPanel
        active={show("identity")}
        direction={direction}
        title={`Identité de ${v.theStudent}`}
        description={useExisting ? "Recherchez par nom, prénom ou matricule." : "Le matricule sera attribué automatiquement."}
      >
        {type !== "reenrollment" ? (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={!existing ? "primary" : "secondary"} onClick={() => setExisting(false)}>
              Nouvel {studentWord}
            </Button>
            <Button type="button" size="sm" variant={existing ? "primary" : "secondary"} onClick={() => setExisting(true)}>
              Déjà enregistré
            </Button>
          </div>
        ) : null}
        {useExisting ? (
          <StudentPicker value={student} onChange={setStudent} studentWord={studentWord} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="student_last_name" label="Nom *" errors={errors.student_last_name}>
              <Input id="student_last_name" name="student_last_name" maxLength={80} aria-invalid={Boolean(errors.student_last_name)} />
            </FormField>
            <FormField id="student_first_name" label="Prénom(s) *" errors={errors.student_first_name}>
              <Input id="student_first_name" name="student_first_name" maxLength={80} aria-invalid={Boolean(errors.student_first_name)} />
            </FormField>
            <FormField id="student_sex" label="Sexe">
              <Select id="student_sex" name="student_sex" defaultValue="">
                <option value="">Non renseigné</option>
                <option value="F">Féminin</option>
                <option value="M">Masculin</option>
              </Select>
            </FormField>
            <FormField id="student_birth_date" label="Date de naissance" errors={errors.student_birth_date}>
              <Input id="student_birth_date" name="student_birth_date" type="date" />
            </FormField>
            <FormField id="student_birth_place" label="Lieu de naissance">
              <Input id="student_birth_place" name="student_birth_place" maxLength={120} />
            </FormField>
            <FormField id="student_nationality" label="Nationalité">
              <Input id="student_nationality" name="student_nationality" maxLength={60} />
            </FormField>
          </div>
        )}
        <input type="hidden" name="student_mode" value={useExisting ? "existing" : "new"} />
        {useExisting && student ? <input type="hidden" name="student_id" value={student.id} /> : null}
        {errors.student_id ? (
          <p className="text-sm font-medium text-danger" role="alert">
            {errors.student_id[0]}
          </p>
        ) : null}
      </StepPanel>

      {canCreateGuardian ? (
        <StepPanel
          active={show("guardian")}
          direction={direction}
          title="Parent / tuteur"
          description={
            useExisting
              ? "Facultatif : ajoute un parent au dossier (les parents déjà rattachés sont conservés)."
              : "Recommandé. Si le numéro correspond à un parent déjà enregistré, sa fiche est réutilisée (fratrie)."
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="guardian_relationship" label="Lien de parenté">
              <Select id="guardian_relationship" name="guardian_relationship" defaultValue="mother">
                {Object.entries(RELATIONSHIP).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="guardian_phone" label="Téléphone" errors={errors.guardian_phone}>
              <Input id="guardian_phone" name="guardian_phone" type="tel" inputMode="tel" placeholder="+225 07 00 00 00 00" />
            </FormField>
            <FormField id="guardian_last_name" label="Nom" errors={errors.guardian_last_name}>
              <Input id="guardian_last_name" name="guardian_last_name" maxLength={80} />
            </FormField>
            <FormField id="guardian_first_name" label="Prénom(s)" errors={errors.guardian_first_name}>
              <Input id="guardian_first_name" name="guardian_first_name" maxLength={80} />
            </FormField>
            <FormField id="guardian_email" label="E-mail" errors={errors.guardian_email}>
              <Input id="guardian_email" name="guardian_email" type="email" />
            </FormField>
            <FormField id="guardian_profession" label="Profession">
              <Input id="guardian_profession" name="guardian_profession" maxLength={80} />
            </FormField>
          </div>
        </StepPanel>
      ) : null}

      {!useExisting ? (
        <StepPanel active={show("address")} direction={direction} title="Adresse" description={`Lieu de résidence de ${v.theStudent}.`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="student_address" label="Adresse" errors={errors.student_address}>
              <Input id="student_address" name="student_address" maxLength={200} />
            </FormField>
            <FormField id="student_city" label="Ville" errors={errors.student_city}>
              <Input id="student_city" name="student_city" maxLength={80} />
            </FormField>
          </div>
        </StepPanel>
      ) : null}

      <StepPanel active={show("formation")} direction={direction} title="Formation" description={`${v.year} et ${v.klass.toLowerCase()} d'affectation.`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="academic_year_id" label={`${v.year} *`} errors={errors.academic_year_id}>
            <Select
              id="academic_year_id"
              name="academic_year_id"
              value={yearId}
              onChange={(e) => {
                setYearId(e.target.value);
                setClassId("");
              }}
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                  {y.is_current ? " (en cours)" : ""}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="class_id" label={`${v.klass} *`} errors={errors.class_id}>
            <Select id="class_id" name="class_id" value={classId} onChange={(e) => setClassId(e.target.value)} aria-invalid={Boolean(errors.class_id)}>
              <option value="">Choisir…</option>
              {yearClasses.map((c) => (
                <option key={c.id} value={c.id} disabled={c.capacity !== null && c.count >= c.capacity}>
                  {c.name} — {c.count}
                  {c.capacity ? `/${c.capacity}` : ""} {v.students.toLowerCase()}
                  {c.capacity !== null && c.count >= c.capacity ? " (complète)" : ""}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        {selectedClass && selectedClass.capacity ? (
          <div className="grid gap-1.5" key={selectedClass.id}>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Remplissage</span>
              <span className="tabular-nums">
                {selectedClass.count} / {selectedClass.capacity} places
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
              <div
                className={cn(
                  "h-full origin-left animate-[bar-grow-x_0.6s_var(--ease-out)_both] rounded-full",
                  selectedClass.count / selectedClass.capacity > 0.9 ? "bg-warning" : "bg-primary",
                )}
                style={{ width: `${Math.min(100, (selectedClass.count / selectedClass.capacity) * 100)}%` }}
              />
            </div>
          </div>
        ) : null}
      </StepPanel>

      <StepPanel
        active={show("pricing")}
        direction={direction}
        title="Tarification"
        description="Frais obligatoires du barème (Finances › Tarifs), facturés automatiquement à la validation de l'inscription."
      >
        {!selectedClass ? (
          <p className="text-sm text-muted-foreground">Choisissez d&apos;abord la {v.klass.toLowerCase()} à l&apos;étape « Formation ».</p>
        ) : fees.length === 0 ? (
          <Alert tone="info">Aucun tarif obligatoire n&apos;est défini pour cette {v.klass.toLowerCase()} : aucune facture ne sera générée à la validation.</Alert>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="table-anim w-full text-sm">
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Frais</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Montant</th>
                </tr>
              </thead>
              <tbody>
                {fees.map((f) => (
                  <tr key={f.id} className="border-t border-border">
                    <td className="px-4 py-2.5">{f.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(f.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-primary-soft/40">
                  <td className="px-4 py-3 font-semibold">Total</td>
                  <td key={plan.total} className="anim-pop px-4 py-3 text-right font-display text-base font-semibold tabular-nums text-primary">
                    {money(plan.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </StepPanel>

      <StepPanel
        active={show("payment")}
        direction={direction}
        title="Paiement"
        description="Échéancier prévisionnel. La facture est émise à la validation ; les versements s'enregistrent ensuite depuis Finances (reçu délivré à chaque paiement)."
      >
        {plan.total === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun montant à régler pour cette inscription.</p>
        ) : plan.steps.length === 0 ? (
          <div className="flex items-center justify-between rounded-xl border border-border p-4 text-sm">
            <span>Paiement en une fois</span>
            <strong className="tabular-nums">{money(plan.total)}</strong>
          </div>
        ) : (
          <ol className="stagger grid gap-2">
            {plan.steps.map((s, i) => (
              <li key={`${s.label}-${i}`} className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary">{i + 1}</span>
                <span className="grid flex-1">
                  <span className="font-medium">{s.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.dueOn ? `Échéance le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(`${s.dueOn}T12:00:00`))}` : "Échéance à définir"}
                  </span>
                </span>
                <strong className="tabular-nums">{money(s.amount)}</strong>
              </li>
            ))}
          </ol>
        )}
      </StepPanel>

      <StepPanel active={show("documents")} direction={direction} title="Documents et informations" description="Formulaire défini par l'établissement : cochez les pièces reçues.">
        {fields.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <CustomFields key={type} fields={fields} errors={errors} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune pièce n&apos;est demandée par le formulaire d&apos;inscription de l&apos;établissement.</p>
        )}
        <FormField id="notes" label="Observations">
          <Textarea id="notes" name="notes" maxLength={2000} placeholder="Remarques internes (facultatif)" />
        </FormField>
      </StepPanel>

      <StepPanel active={show("review")} direction={direction} title="Validation" description="Vérifiez le récapitulatif puis soumettez l'inscription à la direction.">
        <Review
          summary={summary}
          type={type}
          student={useExisting ? student : null}
          klass={selectedClass}
          year={years.find((y) => y.id === yearId)?.name ?? ""}
          total={fees.length ? money(plan.total) : null}
          installments={plan.steps.length}
          v={v}
          onEdit={(key) => goTo(steps.indexOf(key))}
        />
      </StepPanel>

      {stepError ? (
        <p key={shake} className="anim-shake text-sm font-medium text-danger" role="alert">
          {stepError}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Button asChild variant="ghost">
            <Link href="/inscriptions">Annuler</Link>
          </Button>
          {current > 0 ? (
            <Button type="button" variant="secondary" onClick={() => goTo(current - 1)}>
              <ArrowLeft aria-hidden /> Précédent
            </Button>
          ) : null}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <SubmitButton variant={isLast ? "secondary" : "ghost"} name="intent" value="draft" pendingLabel="Enregistrement…">
            Enregistrer en brouillon
          </SubmitButton>
          {isLast ? (
            <SubmitButton name="intent" value="submit" pendingLabel="Envoi…">
              <Check aria-hidden /> Soumettre pour validation
            </SubmitButton>
          ) : (
            <Button type="button" onClick={() => goTo(current + 1)}>
              Suivant <ArrowRight aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </ActionForm>
  );
}

function Review({
  summary,
  type,
  student,
  klass,
  year,
  total,
  installments,
  v,
  onEdit,
}: {
  summary: FormData | null;
  type: EnrollmentType;
  student: StudentMatch | null;
  klass: ClassOption | undefined;
  year: string;
  total: string | null;
  installments: number;
  v: Vocabulary;
  onEdit: (key: StepKey) => void;
}) {
  const get = (name: string) => String(summary?.get(name) ?? "").trim();
  const guardian = [get("guardian_last_name"), get("guardian_first_name")].filter(Boolean).join(" ");
  const rows: { key: StepKey; label: string; value: string }[] = [
    { key: "type", label: "Type", value: TYPES.find((t) => t.value === type)?.label ?? type },
    {
      key: "identity",
      label: v.student,
      value: student ? `${student.name} (${student.matricule})` : [get("student_last_name"), get("student_first_name")].filter(Boolean).join(" ") || "—",
    },
    { key: "guardian", label: "Parent / tuteur", value: guardian ? `${guardian}${get("guardian_phone") ? ` · ${get("guardian_phone")}` : ""}` : "Non renseigné" },
    { key: "address", label: "Adresse", value: [get("student_address"), get("student_city")].filter(Boolean).join(", ") || (student ? "Celle du dossier" : "Non renseignée") },
    { key: "formation", label: v.klass, value: klass ? `${klass.name} · ${year}` : "—" },
    { key: "pricing", label: "Frais", value: total ? `${total}${installments ? ` en ${installments} échéance${installments > 1 ? "s" : ""}` : ""}` : "Aucun tarif applicable" },
  ];
  return (
    <dl className="stagger grid gap-2">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm">
          <Check className="size-4 shrink-0 text-success" aria-hidden />
          <dt className="w-32 shrink-0 text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 flex-1 truncate font-medium">{row.value}</dd>
          <button type="button" onClick={() => onEdit(row.key)} className="shrink-0 text-xs font-semibold text-primary hover:underline">
            Modifier
          </button>
        </div>
      ))}
    </dl>
  );
}

function StudentPicker({ value, onChange, studentWord }: { value: StudentMatch | null; onChange: (s: StudentMatch | null) => void; studentWord: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentMatch[]>([]);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (value) {
    return (
      <div className="anim-pop flex items-center gap-3 rounded-xl border-2 border-primary bg-primary-soft/60 p-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <UserRound className="size-5" aria-hidden />
        </span>
        <span className="grid flex-1">
          <span className="font-semibold">{value.name}</span>
          <span className="text-xs text-muted-foreground">
            {value.matricule}
            {value.className ? ` · dernière affectation : ${value.className}` : ""}
          </span>
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} aria-label={`Changer d'${studentWord}`}>
          <X aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <label className="relative">
        <span className="sr-only">Rechercher un {studentWord}</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={query}
          placeholder="Nom, prénom ou matricule…"
          className="pl-10"
          onChange={(event) => {
            const text = event.target.value;
            setQuery(text);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              startTransition(async () => setResults(await searchStudentsForEnrollment(text)));
            }, 250);
          }}
        />
      </label>
      {pending ? <p className="text-xs text-muted-foreground">Recherche…</p> : null}
      {results.length > 0 ? (
        <ul className="stagger grid gap-1 rounded-xl border border-border p-1" aria-label="Résultats">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onChange(r)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-muted"
              >
                <span className="font-semibold">{r.name}</span>
                <span className="text-xs text-muted-foreground">
                  {r.matricule}
                  {r.className ? ` · ${r.className}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim().length >= 2 && !pending ? (
        <p className="text-sm text-muted-foreground">Aucun résultat.</p>
      ) : null}
    </div>
  );
}
