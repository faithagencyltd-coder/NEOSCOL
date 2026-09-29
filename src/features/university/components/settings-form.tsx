"use client";

import { useActionState } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { ActionForm } from "@/components/shared/action-form";
import { FormSection } from "@/components/shared/form-section";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveUniversityConfig } from "@/features/university/actions";
import { ESTABLISHMENT_KINDS, FEATURE_LABELS, RETAKE_RULES, UNIVERSITY_FEATURES, type UniversityConfig } from "@/features/university/config";
import type { ActionResult } from "@/lib/utils/action-result";

function Toggle({ name, label, hint, defaultChecked }: { name: string; label: string; hint: string; defaultChecked: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4 transition-colors hover:border-primary/40">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-5 accent-[var(--primary)]" />
      <span className="grid gap-0.5">
        <span className="font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

/**
 * Paramètres universitaires : type d'établissement, fonctionnalités activées,
 * règles de calcul (seuil, compensation, rattrapage, passage), grades des
 * enseignants, règles du scan. Tout est revalidé côté serveur (set_university_config).
 */
export function UniversitySettingsForm({ config }: { config: UniversityConfig }) {
  const r = config.rules;
  const [state, action, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await saveUniversityConfig(prev, formData);
    notifyResult(result);
    return result;
  }, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <ActionForm dispatch={action} pending={pending} className="grid gap-5">
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}

      <FormSection title="Établissement" description="Nature de l'établissement d'enseignement supérieur.">
        <FormField id="establishment_kind" label="Type d'établissement" errors={errors.establishment_kind} className="sm:col-span-2">
          <Select id="establishment_kind" name="establishment_kind" defaultValue={config.establishmentKind}>
            {Object.entries(ESTABLISHMENT_KINDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
      </FormSection>

      <FormSection title="Fonctionnalités" description="Chaque fonctionnalité est facultative. Désactiver masque l'écran et bloque l'accès ; aucune donnée n'est supprimée.">
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
          {UNIVERSITY_FEATURES.map((f) => (
            <Toggle key={f} name={`feature_${f}`} label={FEATURE_LABELS[f].label} hint={FEATURE_LABELS[f].hint} defaultChecked={config.features[f]} />
          ))}
        </div>
      </FormSection>

      <FormSection title="Règles de validation" description="Appliquées au prochain calcul des résultats ; les délibérations closes et les documents émis ne changent pas.">
        <FormField id="pass_mark" label="Seuil de validation d'une UE (/20)" errors={errors.pass_mark}>
          <Input id="pass_mark" name="pass_mark" type="number" min={0} max={20} step="0.25" defaultValue={r.pass_mark} />
        </FormField>
        <FormField id="eliminatory_mark" label="Note éliminatoire (/20, facultatif)" hint="Une UE dont la moyenne est sous cette note empêche la validation du semestre par compensation." errors={errors.eliminatory_mark}>
          <Input id="eliminatory_mark" name="eliminatory_mark" type="number" min={0} max={20} step="0.25" defaultValue={r.eliminatory_mark ?? ""} />
        </FormField>
        <FormField id="semester_weighting" label="Pondération de la moyenne du semestre" errors={errors.semester_weighting}>
          <Select id="semester_weighting" name="semester_weighting" defaultValue={r.semester_weighting}>
            <option value="credits">Par les crédits des UE</option>
            <option value="coefficient">Par les coefficients des UE</option>
          </Select>
        </FormField>
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
          <Toggle
            name="semester_compensation"
            label="Validation du semestre par compensation"
            hint="Le semestre est validé si sa moyenne atteint le seuil, même avec des UE sous le seuil."
            defaultChecked={r.semester_compensation}
          />
          <Toggle
            name="ue_compensation"
            label="Crédits des UE compensées"
            hint="Dans un semestre validé par compensation, les UE sous le seuil sont acquises avec leurs crédits."
            defaultChecked={r.ue_compensation}
          />
          <Toggle name="absent_as_zero" label="Absence = 0" hint="Une absence non justifiée à une évaluation compte zéro." defaultChecked={r.absent_as_zero} />
        </div>
      </FormSection>

      <FormSection title="Rattrapage" description="La note initiale est toujours conservée ; la règle choisie détermine la note retenue.">
        <FormField id="retake_rule" label="Règle de rattrapage" errors={errors.retake_rule}>
          <Select id="retake_rule" name="retake_rule" defaultValue={r.retake_rule}>
            {Object.entries(RETAKE_RULES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="retake_cap" label="Plafond (règle « plafonné », /20)" errors={errors.retake_cap}>
          <Input id="retake_cap" name="retake_cap" type="number" min={0} max={20} step="0.25" defaultValue={r.retake_cap} />
        </FormField>
      </FormSection>

      <FormSection title="Passage en année supérieure" description="Part des crédits de l'année nécessaires (0 à 1).">
        <FormField id="year_pass_ratio" label="Admis : part des crédits" errors={errors.year_pass_ratio}>
          <Input id="year_pass_ratio" name="year_pass_ratio" type="number" min={0} max={1} step="0.05" defaultValue={r.year_pass_ratio} />
        </FormField>
        <FormField id="conditional_pass_ratio" label="Admis avec dette : part des crédits" errors={errors.conditional_pass_ratio}>
          <Input id="conditional_pass_ratio" name="conditional_pass_ratio" type="number" min={0} max={1} step="0.05" defaultValue={r.conditional_pass_ratio} />
        </FormField>
      </FormSection>

      <FormSection title="Enseignants" description="Grades proposés sur la fiche enseignant (un par ligne).">
        <FormField id="teacher_ranks" label="Grades" errors={errors.teacher_ranks} className="sm:col-span-2">
          <Textarea id="teacher_ranks" name="teacher_ranks" defaultValue={config.teacherRanks.join("\n")} maxLength={1000} rows={5} />
        </FormField>
      </FormSection>

      <FormSection title="Scan des badges" description="Règles de la tablette « SCANNER VOTRE BADGE ».">
        <FormField id="late_tolerance_minutes" label="Tolérance de retard (minutes)" errors={errors.late_tolerance_minutes}>
          <Input id="late_tolerance_minutes" name="late_tolerance_minutes" type="number" min={0} max={120} defaultValue={r.late_tolerance_minutes} />
        </FormField>
        <FormField id="open_before_minutes" label="Entrée acceptée avant le cours (minutes)" errors={errors.open_before_minutes}>
          <Input id="open_before_minutes" name="open_before_minutes" type="number" min={0} max={240} defaultValue={r.open_before_minutes} />
        </FormField>
        <div className="sm:col-span-2">
          <Toggle
            name="entry_without_course"
            label="Accepter l'entrée même sans cours prévu"
            hint="Désactivé (recommandé) : l'entrée d'un étudiant est refusée si aucun de ses cours n'est prévu à ce moment."
            defaultChecked={r.entry_without_course}
          />
        </div>
      </FormSection>

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer les paramètres</SubmitButton>
      </div>
    </ActionForm>
  );
}
