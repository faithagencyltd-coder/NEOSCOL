"use client";

import { AlertTriangle, ExternalLink, UserRoundPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { AnimatedSuccess } from "@/components/motion/animated-feedback";
import { useFeedbackAction } from "@/components/motion/use-feedback-action";
import { ActionForm } from "@/components/shared/action-form";
import { FormSection } from "@/components/shared/form-section";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createLegacyStudent } from "@/features/migration/actions";
import { DIPLOMA_KINDS } from "@/features/migration/fields";
import { STUDENT_STATUS } from "@/lib/labels";
import type { Vocabulary } from "@/lib/vocabulary";

const STATUSES = ["alumni", "graduated", "transferred", "withdrawn", "inactive"] as const;

/** Saisie d'un ancien élève (identité, sortie, dernière année, diplôme) avec contrôle des doublons. */
export function LegacyStudentForm({ v }: { v: Vocabulary }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useFeedbackAction(createLegacyStudent, {
    toastSuccess: false,
    onSuccess: (result) => {
      const id = result.ok ? result.data?.id : undefined;
      if (id) {
        setCreated(id);
        setTimeout(() => router.push(`/eleves/${id}?onglet=parcours`), 900);
      }
    },
  });
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const duplicates = state?.ok ? state.data?.duplicates : undefined;
  const student = v.student.toLowerCase();

  if (created) {
    return (
      <Card className="anim-pop grid justify-items-center gap-3 p-8 text-center">
        <AnimatedSuccess className="size-16" label="Dossier créé" />
        <p className="text-lg font-semibold">Ancien {student} enregistré</p>
        <p className="text-sm text-muted-foreground">Ouverture du dossier…</p>
      </Card>
    );
  }

  return (
    <ActionForm ref={formRef} dispatch={action} pending={pending} className="grid gap-5" noValidate>
      <input type="hidden" name="confirm_duplicate" value={confirm ? "1" : "0"} />
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}

      {duplicates?.length ? (
        <Card className="anim-shake grid gap-3 border-warning/60 bg-warning-soft/40 p-4">
          <p className="flex items-center gap-2 font-semibold text-warning">
            <AlertTriangle className="size-5" aria-hidden /> Doublon possible : {duplicates.length} dossier(s) existant(s) correspondent
          </p>
          <ul className="grid gap-2">
            {duplicates.map((d) => (
              <li key={d.student_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 text-sm">
                <span className="grid">
                  <span className="font-semibold">{d.full_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[d.matricule, d.legacy_matricule ? `ancien ${d.legacy_matricule}` : null, d.birth_date ? `né(e) le ${new Date(`${d.birth_date}T12:00:00`).toLocaleDateString("fr-FR")}` : null, d.archived ? "archivé" : STUDENT_STATUS[d.status]?.label]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={d.score >= 80 ? "danger" : "warning"}>
                    {d.score}/100 · {d.reasons.join(", ")}
                  </Badge>
                  <Button asChild size="sm">
                    <Link href={`/eleves/${d.student_id}?onglet=parcours`}>
                      Utiliser ce dossier <ExternalLink aria-hidden />
                    </Link>
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setConfirm(true);
                requestAnimationFrame(() => formRef.current?.requestSubmit());
              }}
            >
              Créer malgré le doublon
            </Button>
            <span className="text-xs text-muted-foreground">« Utiliser ce dossier » : ajoutez-y le parcours et les diplômes depuis l&apos;onglet « Parcours antérieur ».</span>
          </div>
        </Card>
      ) : null}

      <FormSection title="Identité" description={`Informations de l'ancien ${student}.`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="last_name" label="Nom *" errors={errors.last_name}>
            <Input id="last_name" name="last_name" maxLength={80} required onChange={() => setConfirm(false)} />
          </FormField>
          <FormField id="first_name" label="Prénom(s) *" errors={errors.first_name}>
            <Input id="first_name" name="first_name" maxLength={80} required onChange={() => setConfirm(false)} />
          </FormField>
          <FormField id="birth_date" label="Date de naissance" errors={errors.birth_date} hint="Recommandée : elle fiabilise la détection des doublons.">
            <Input id="birth_date" name="birth_date" type="date" onChange={() => setConfirm(false)} />
          </FormField>
          <FormField id="sex" label="Sexe">
            <Select id="sex" name="sex" defaultValue="">
              <option value="">Non renseigné</option>
              <option value="F">Féminin</option>
              <option value="M">Masculin</option>
            </Select>
          </FormField>
          <FormField id="birth_place" label="Lieu de naissance">
            <Input id="birth_place" name="birth_place" maxLength={120} />
          </FormField>
          <FormField id="nationality" label="Nationalité">
            <Input id="nationality" name="nationality" maxLength={60} />
          </FormField>
          <FormField id="other_names" label="Autres noms">
            <Input id="other_names" name="other_names" maxLength={120} />
          </FormField>
          <FormField id="phone" label="Téléphone">
            <Input id="phone" name="phone" type="tel" maxLength={40} />
          </FormField>
          <FormField id="email" label="E-mail" errors={errors.email}>
            <Input id="email" name="email" type="email" />
          </FormField>
          <FormField id="city" label="Ville">
            <Input id="city" name="city" maxLength={80} />
          </FormField>
          <FormField id="address" label="Adresse" className="sm:col-span-2">
            <Input id="address" name="address" maxLength={200} />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Scolarité dans l'établissement" description="Le matricule NéoScol est attribué automatiquement ; l'ancien matricule est conservé.">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="legacy_matricule" label="Ancien matricule">
            <Input id="legacy_matricule" name="legacy_matricule" maxLength={60} onChange={() => setConfirm(false)} />
          </FormField>
          <FormField id="status" label="Statut *">
            <Select id="status" name="status" defaultValue="alumni">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STUDENT_STATUS[s]?.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="entry_year" label="Année d'entrée" errors={errors.entry_year}>
            <Input id="entry_year" name="entry_year" inputMode="numeric" placeholder="2015" maxLength={4} />
          </FormField>
          <FormField id="exit_year" label="Année de sortie" errors={errors.exit_year}>
            <Input id="exit_year" name="exit_year" inputMode="numeric" placeholder="2020" maxLength={4} />
          </FormField>
          <FormField id="legacy_program" label="Formation / filière">
            <Input id="legacy_program" name="legacy_program" maxLength={200} />
          </FormField>
          <FormField id="status_reason" label="Motif de sortie">
            <Input id="status_reason" name="status_reason" maxLength={500} placeholder="Fin de cycle, déménagement…" />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Dernière année fréquentée (facultatif)" description="Les autres années s'ajoutent ensuite dans l'onglet « Parcours antérieur ».">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="h_year_label" label="Année scolaire">
            <Input id="h_year_label" name="h_year_label" placeholder="2019-2020" maxLength={9} />
          </FormField>
          <FormField id="h_class_name" label={v.klass}>
            <Input id="h_class_name" name="h_class_name" maxLength={120} />
          </FormField>
          <FormField id="h_level_name" label="Niveau">
            <Input id="h_level_name" name="h_level_name" maxLength={120} />
          </FormField>
          <FormField id="h_average" label="Moyenne annuelle (/20)" errors={errors.h_average}>
            <Input id="h_average" name="h_average" inputMode="decimal" />
          </FormField>
          <FormField id="h_decision" label="Décision">
            <Input id="h_decision" name="h_decision" maxLength={200} placeholder="Admis, diplômé…" />
          </FormField>
          <FormField id="h_absences" label="Absences (nombre)" errors={errors.h_absences}>
            <Input id="h_absences" name="h_absences" inputMode="numeric" />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Diplôme ou certificat (facultatif)">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="d_kind" label="Type">
            <Select id="d_kind" name="d_kind" defaultValue="diploma">
              {Object.entries(DIPLOMA_KINDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="d_title" label="Intitulé">
            <Input id="d_title" name="d_title" maxLength={200} placeholder="BEPC, BAC D…" />
          </FormField>
          <FormField id="d_year_label" label="Année / session">
            <Input id="d_year_label" name="d_year_label" maxLength={20} />
          </FormField>
          <FormField id="d_mention" label="Mention">
            <Input id="d_mention" name="d_mention" maxLength={120} />
          </FormField>
          <FormField id="d_number" label="Numéro">
            <Input id="d_number" name="d_number" maxLength={120} />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Observations">
        <Textarea name="notes" maxLength={2000} aria-label="Observations" placeholder="Informations utiles sur ce dossier historique (facultatif)" />
        <Checkbox name="archive" label="Archiver directement ce dossier (consultable, restaurable)" />
      </FormSection>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="ghost">
          <Link href="/donnees-historiques">Annuler</Link>
        </Button>
        <SubmitButton pendingLabel={confirm ? "Création…" : "Vérification des doublons…"}>
          <UserRoundPlus aria-hidden /> {confirm ? "Créer malgré le doublon" : `Enregistrer l'ancien ${student}`}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
