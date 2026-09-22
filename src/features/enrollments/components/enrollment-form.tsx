"use client";

import { Check, Search, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";

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
import { CustomFields } from "@/features/forms/components/custom-fields";
import type { FieldDefinition } from "@/features/forms/fields";
import { RELATIONSHIP } from "@/lib/labels";
import { cn } from "@/lib/utils/cn";

type ClassOption = { id: string; name: string; yearId: string; count: number; capacity: number | null };
type YearOption = { id: string; name: string; is_current: boolean };
type EnrollmentType = "new" | "reenrollment" | "transfer";

const TYPES: { value: EnrollmentType; label: string; description: string }[] = [
  { value: "new", label: "Nouvelle inscription", description: "Première inscription dans l'établissement" },
  { value: "reenrollment", label: "Réinscription", description: "Élève déjà inscrit l'an passé" },
  { value: "transfer", label: "Transfert", description: "Arrivée d'un autre établissement" },
];

function Step({ index, title, description, children }: { index: number; title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="grid gap-5 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-display text-sm font-semibold text-primary-foreground">
          {index}
        </span>
        <div className="grid gap-0.5">
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
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
}: {
  years: YearOption[];
  classes: ClassOption[];
  forms: { enrollment: FieldDefinition[]; reenrollment: FieldDefinition[] | null };
  presetStudent: StudentMatch | null;
  canCreateGuardian: boolean;
}) {
  const [state, action, pending] = useActionState(createEnrollment, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const [type, setType] = useState<EnrollmentType>(presetStudent ? "reenrollment" : "new");
  const [student, setStudent] = useState<StudentMatch | null>(presetStudent);
  const [existing, setExisting] = useState<boolean>(Boolean(presetStudent));
  const [yearId, setYearId] = useState(years.find((y) => y.is_current)?.id ?? years[0]?.id ?? "");
  const yearClasses = useMemo(() => classes.filter((c) => c.yearId === yearId), [classes, yearId]);
  const fields = type === "reenrollment" ? (forms.reenrollment ?? forms.enrollment) : forms.enrollment;
  const useExisting = existing || type === "reenrollment";
  let step = 0;

  return (
    <ActionForm dispatch={action} pending={pending} className="grid gap-5" noValidate>
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}

      <Step index={++step} title="Type d'inscription">
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="sr-only">Type d&apos;inscription</legend>
          {TYPES.map((t) => (
            <label
              key={t.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
                type === t.value ? "border-2 border-primary bg-primary-soft/60" : "border-border hover:border-primary/50",
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
      </Step>

      <Step
        index={++step}
        title="Élève"
        description={useExisting ? "Recherchez l'élève par nom, prénom ou matricule." : "Le matricule sera attribué automatiquement."}
      >
        {type !== "reenrollment" ? (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={!existing ? "primary" : "secondary"} onClick={() => setExisting(false)}>
              Nouvel élève
            </Button>
            <Button type="button" size="sm" variant={existing ? "primary" : "secondary"} onClick={() => setExisting(true)}>
              Élève déjà enregistré
            </Button>
          </div>
        ) : null}
        {useExisting ? (
          <StudentPicker value={student} onChange={setStudent} />
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
            <FormField id="student_address" label="Adresse">
              <Input id="student_address" name="student_address" maxLength={200} />
            </FormField>
            <FormField id="student_city" label="Ville">
              <Input id="student_city" name="student_city" maxLength={80} />
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
      </Step>

      {canCreateGuardian ? (
        <Step
          index={++step}
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
                {Object.entries(RELATIONSHIP).map(([value, label]) => (
                  <option key={value} value={value}>
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
        </Step>
      ) : null}

      <Step index={++step} title="Affectation">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="academic_year_id" label="Année scolaire *" errors={errors.academic_year_id}>
            <Select id="academic_year_id" name="academic_year_id" value={yearId} onChange={(e) => setYearId(e.target.value)}>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                  {y.is_current ? " (en cours)" : ""}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="class_id" label="Classe / session *" errors={errors.class_id}>
            <Select id="class_id" name="class_id" defaultValue="" key={yearId} aria-invalid={Boolean(errors.class_id)}>
              <option value="">Choisir…</option>
              {yearClasses.map((c) => (
                <option key={c.id} value={c.id} disabled={c.capacity !== null && c.count >= c.capacity}>
                  {c.name} — {c.count}
                  {c.capacity ? `/${c.capacity}` : ""} élèves
                  {c.capacity !== null && c.count >= c.capacity ? " (complète)" : ""}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </Step>

      {fields.length > 0 ? (
        <Step index={++step} title="Informations et pièces" description="Formulaire défini par l'établissement. Cochez les pièces reçues.">
          <div className="grid gap-4 sm:grid-cols-2">
            <CustomFields key={type} fields={fields} errors={errors} />
          </div>
        </Step>
      ) : null}

      <Step index={++step} title="Observations">
        <Textarea name="notes" maxLength={2000} placeholder="Remarques internes (facultatif)" aria-label="Observations" />
      </Step>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="ghost">
          <Link href="/inscriptions">Annuler</Link>
        </Button>
        <SubmitButton variant="secondary" name="intent" value="draft" pendingLabel="Enregistrement…">
          Enregistrer en brouillon
        </SubmitButton>
        <SubmitButton name="intent" value="submit" pendingLabel="Envoi…">
          <Check aria-hidden /> Soumettre pour validation
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

function StudentPicker({ value, onChange }: { value: StudentMatch | null; onChange: (s: StudentMatch | null) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentMatch[]>([]);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border-2 border-primary bg-primary-soft/60 p-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <UserRound className="size-5" aria-hidden />
        </span>
        <span className="grid flex-1">
          <span className="font-semibold">{value.name}</span>
          <span className="text-xs text-muted-foreground">
            {value.matricule}
            {value.className ? ` · dernière classe : ${value.className}` : ""}
          </span>
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} aria-label="Changer d'élève">
          <X aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <label className="relative">
        <span className="sr-only">Rechercher un élève</span>
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
        <ul className="grid gap-1 rounded-xl border border-border p-1" aria-label="Résultats">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onChange(r)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-surface-muted"
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
        <p className="text-sm text-muted-foreground">Aucun élève trouvé.</p>
      ) : null}
    </div>
  );
}
