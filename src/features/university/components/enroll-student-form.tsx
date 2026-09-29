"use client";

import { BookOpenCheck, CheckCircle2, FileText, UserRound } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { enrollStudent } from "@/features/university/actions";
import type { ActionResult } from "@/lib/utils/action-result";
import { cn } from "@/lib/utils/cn";

export type EnrollPromotion = {
  id: string;
  name: string;
  program: string;
  level: string;
  year: string;
  trackId: string | null;
  capacity: number | null;
  headcount: number;
  units: number;
  tracks: { id: string; name: string }[];
  groups: { id: string; name: string }[];
  fees: { label: string; amount: number; installments: number }[];
};

type Result = ActionResult<{ studentId: string; invoiceId: string | null; units: number }>;

/**
 * Inscription universitaire : inscription ADMINISTRATIVE (étudiant, année,
 * filière, niveau, parcours, frais → facture et échéancier) puis inscription
 * PÉDAGOGIQUE (UE des semestres de l'année, modifiable ensuite dans le dossier).
 * Tout est contrôlé en base ; l'aperçu des frais est indicatif.
 */
export function EnrollStudentForm({
  promotions,
  students,
  groupsEnabled,
  currency,
  today,
  defaultPromotionId,
  defaultStudentId,
}: {
  promotions: EnrollPromotion[];
  students: { id: string; label: string }[];
  groupsEnabled: boolean;
  currency: string;
  today: string;
  defaultPromotionId?: string;
  defaultStudentId?: string;
}) {
  const [mode, setMode] = useState<"new" | "existing">(defaultStudentId ? "existing" : "new");
  const [promotionId, setPromotionId] = useState(defaultPromotionId ?? promotions[0]?.id ?? "");
  const promotion = promotions.find((p) => p.id === promotionId);
  const [state, action, pending] = useActionState(async (prev: Result | null, formData: FormData) => {
    const result = await enrollStudent(prev, formData);
    notifyResult(result);
    return result;
  }, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const money = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  const totalFees = (promotion?.fees ?? []).reduce((s, f) => s + f.amount, 0);

  if (state?.ok && state.data) {
    return (
      <Card className="anim-fade-up">
        <CardContent className="grid justify-items-center gap-4 py-10 text-center">
          <CheckCircle2 className="anim-pop size-14 text-success" aria-hidden />
          <div className="grid gap-1">
            <p className="text-xl font-semibold">Inscription validée</p>
            <p className="text-sm text-muted-foreground">
              Matricule attribué, facture et échéancier créés. Inscription pédagogique : {state.data.units} UE.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href={`/eleves/${state.data.studentId}?onglet=universite`}>
                <UserRound aria-hidden /> Ouvrir le dossier de l&apos;étudiant
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/eleves/${state.data.studentId}?onglet=pedagogique`}>
                <BookOpenCheck aria-hidden /> Inscription pédagogique
              </Link>
            </Button>
            {state.data.invoiceId ? (
              <Button asChild variant="secondary">
                <a href={`/api/documents/factures/${state.data.invoiceId}`} target="_blank" rel="noreferrer">
                  <FileText aria-hidden /> Facture et échéancier
                </a>
              </Button>
            ) : null}
            <Button asChild variant="ghost">
              <a href={`/universite/inscription?promotion=${promotionId}`}>Nouvelle inscription</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <ActionForm dispatch={action} pending={pending} className="grid gap-5" noValidate>
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}

      <FormSection title="1. Étudiant" description="Nouvel étudiant (matricule unique attribué automatiquement) ou réinscription d'un étudiant existant.">
        <div className="flex flex-wrap gap-2 sm:col-span-2" role="radiogroup" aria-label="Type d'inscription">
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
              {m === "new" ? "Nouvel étudiant" : "Étudiant existant (réinscription)"}
            </button>
          ))}
        </div>
        {mode === "existing" ? (
          <FormField id="student_id" label="Étudiant *" errors={errors.student_id} className="sm:col-span-2">
            <Select id="student_id" name="student_id" defaultValue={defaultStudentId ?? ""} required>
              <option value="">Choisir…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
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
            <FormField id="nationality" label="Nationalité">
              <Input id="nationality" name="nationality" />
            </FormField>
            <FormField id="national_id" label="Pièce d'identité (n°)">
              <Input id="national_id" name="national_id" />
            </FormField>
            <FormField id="phone" label="Téléphone">
              <Input id="phone" name="phone" type="tel" placeholder="+225 07 …" />
            </FormField>
            <FormField id="email" label="E-mail" errors={errors.email}>
              <Input id="email" name="email" type="email" />
            </FormField>
            <FormField id="address" label="Adresse">
              <Input id="address" name="address" />
            </FormField>
            <FormField id="city" label="Ville">
              <Input id="city" name="city" />
            </FormField>
          </>
        )}
      </FormSection>

      {mode === "new" ? (
        <FormSection title="2. Personne à contacter" description="Parent, tuteur ou proche joignable en cas d'urgence (facultatif).">
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

      <FormSection
        title={`${mode === "new" ? 3 : 2}. Inscription administrative`}
        description="Année académique, filière, niveau et parcours sont déterminés par la promotion choisie."
      >
        <FormField id="class_id" label="Promotion (filière · niveau · année) *" errors={errors.class_id} className="sm:col-span-2">
          <Select id="class_id" name="class_id" value={promotionId} onChange={(e) => setPromotionId(e.target.value)} required>
            {promotions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.program} · {p.level} · {p.year}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="type" label="Type d'inscription *">
          <Select id="type" name="type" defaultValue={mode === "existing" ? "reenrollment" : "new"} key={mode}>
            <option value="new">Première inscription</option>
            <option value="reenrollment">Réinscription</option>
            <option value="transfer">Transfert</option>
          </Select>
        </FormField>
        {promotion && promotion.tracks.length > 0 ? (
          <FormField id="track_id" label="Parcours / spécialité">
            <Select id="track_id" name="track_id" defaultValue={promotion.trackId ?? ""} key={`t-${promotion.id}`}>
              <option value="">—</option>
              {promotion.tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}
        {groupsEnabled && promotion && promotion.groups.length > 0 ? (
          <FormField id="group_id" label="Groupe (TD / TP)">
            <Select id="group_id" name="group_id" defaultValue="" key={`g-${promotion.id}`}>
              <option value="">—</option>
              {promotion.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}
        {promotion ? (
          <div className="grid gap-1 rounded-xl border border-border bg-surface-muted/40 p-3 text-sm sm:col-span-2">
            <p>
              Effectif : <strong>{promotion.headcount}</strong>
              {promotion.capacity ? ` / ${promotion.capacity} places` : ""}
              {promotion.capacity && promotion.headcount >= promotion.capacity ? <span className="ml-2 font-semibold text-danger">Promotion complète</span> : null}
            </p>
            <p>
              Inscription pédagogique automatique : <strong>{promotion.units} UE</strong> obligatoires des semestres de l&apos;année (modifiable ensuite).
            </p>
          </div>
        ) : null}
        <FormField id="notes" label="Observations" className="sm:col-span-2">
          <Textarea id="notes" name="notes" maxLength={1000} />
        </FormField>
      </FormSection>

      <FormSection title={`${mode === "new" ? 4 : 3}. Frais universitaires`} description="Facture et échéancier générés selon les tarifs de la filière ; les paiements se saisissent ensuite en caisse.">
        {promotion && promotion.fees.length > 0 ? (
          <div className="grid gap-1.5 text-sm sm:col-span-2">
            {promotion.fees.map((f) => (
              <p key={f.label} className="flex justify-between gap-3">
                <span>
                  {f.label}
                  {f.installments > 1 ? <span className="text-muted-foreground"> · {f.installments} tranches</span> : null}
                </span>
                <span className="font-medium tabular-nums">{money(f.amount)}</span>
              </p>
            ))}
            <p className="flex justify-between gap-3 border-t border-border pt-1.5 font-semibold">
              <span>Total indicatif</span>
              <span className="tabular-nums">{money(totalFees)}</span>
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground sm:col-span-2">Aucun tarif défini pour cette filière : aucune facture ne sera créée.</p>
        )}
      </FormSection>

      <div className="flex justify-end">
        <SubmitButton>Valider l&apos;inscription</SubmitButton>
      </div>
    </ActionForm>
  );
}
