"use client";

import { Gift, Rocket } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { IntervalToggle, PlanPrice, type Interval } from "@/features/billing/components/pricing-grid";
import type { PlanWithFeatures } from "@/features/billing/queries";
import { signUpOrganization } from "@/features/billing/signup";

const TYPES: [string, string, string][] = [
  ["primary_school", "École maternelle et primaire", "MATERNELLE_PRIMAIRE"],
  ["middle_school", "Collège", "COLLEGE_LYCEE"],
  ["high_school", "Lycée", "COLLEGE_LYCEE"],
  ["private_school", "École privée (secondaire)", "COLLEGE_LYCEE"],
  ["vocational_center", "Centre de formation professionnelle", "CENTRE_FORMATION"],
  ["technical_center", "Centre de formation technique", "CENTRE_FORMATION"],
  ["university", "Université", "UNIVERSITE"],
  ["institute", "Institut / école supérieure", "UNIVERSITE"],
  ["school_complex", "Groupe scolaire (maternelle → lycée)", "ENTERPRISE"],
  ["school_group", "Réseau / groupe d'établissements", "ENTERPRISE"],
];

const COUNTRIES: [string, string][] = [
  ["BJ", "Bénin"], ["CI", "Côte d'Ivoire"], ["SN", "Sénégal"], ["TG", "Togo"], ["BF", "Burkina Faso"], ["ML", "Mali"],
  ["NE", "Niger"], ["GN", "Guinée"], ["CM", "Cameroun"], ["GA", "Gabon"], ["CG", "Congo"], ["CD", "RD Congo"],
];

/** Création d'un établissement : 14 jours d'essai gratuit, sans paiement. */
export function SignupForm({ plans, initialPlan, initialInterval }: { plans: PlanWithFeatures[]; initialPlan?: string; initialInterval: Interval }) {
  const [state, action, pending] = useActionState(signUpOrganization, null);
  const [planCode, setPlanCode] = useState(initialPlan && plans.some((p) => p.code === initialPlan) ? initialPlan : (plans[1]?.code ?? plans[0]?.code ?? ""));
  const [interval, setBillingInterval] = useState<Interval>(initialInterval);
  const [planTouched, setPlanTouched] = useState(Boolean(initialPlan));
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const plan = plans.find((p) => p.code === planCode);

  return (
    <ActionForm dispatch={action} pending={pending} className="grid gap-5" noValidate>
      {state && !state.ok ? (
        <div className="anim-shake">
          <Alert tone="danger">{state.message}</Alert>
        </div>
      ) : null}
      {/* Champ piège : invisible pour les personnes, rempli par les robots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="site_web">Site web</label>
        <input id="site_web" name="site_web" tabIndex={-1} autoComplete="off" />
      </div>
      <input type="hidden" name="plan" value={planCode} />
      <input type="hidden" name="interval" value={interval} />

      <fieldset className="grid gap-4">
        <legend className="mb-1 text-sm font-semibold text-primary">1. Votre établissement</legend>
        <FormField id="org_name" label="Nom de l'établissement *" errors={errors.org_name}>
          <Input id="org_name" name="org_name" required maxLength={160} autoComplete="organization" placeholder="Ex. Complexe scolaire Les Lauriers" />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="org_type" label="Type *" errors={errors.org_type}>
            <Select
              id="org_type"
              name="org_type"
              required
              defaultValue=""
              onChange={(e) => {
                const suggested = TYPES.find(([value]) => value === e.target.value)?.[2];
                if (suggested && !planTouched) setPlanCode(suggested);
              }}
            >
              <option value="" disabled>
                Choisir…
              </option>
              {TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="country" label="Pays *" errors={errors.country}>
            <Select id="country" name="country" defaultValue="BJ">
              {COUNTRIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="city" label="Ville">
            <Input id="city" name="city" maxLength={80} autoComplete="address-level2" />
          </FormField>
          <FormField id="phone" label="Téléphone">
            <Input id="phone" name="phone" type="tel" maxLength={40} autoComplete="tel" placeholder="+229 …" />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-1 text-sm font-semibold text-primary">2. Votre compte administrateur</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="first_name" label="Prénom *" errors={errors.first_name}>
            <Input id="first_name" name="first_name" required maxLength={80} autoComplete="given-name" />
          </FormField>
          <FormField id="last_name" label="Nom *" errors={errors.last_name}>
            <Input id="last_name" name="last_name" required maxLength={80} autoComplete="family-name" />
          </FormField>
        </div>
        <FormField id="email" label="Adresse e-mail *" errors={errors.email} hint="Elle servira d'identifiant de connexion.">
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="password" label="Mot de passe *" errors={errors.password} hint="10 caractères, lettres et chiffres.">
            <Input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" />
          </FormField>
          <FormField id="confirmation" label="Confirmation *" errors={errors.confirmation}>
            <Input id="confirmation" name="confirmation" type="password" required autoComplete="new-password" />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-semibold text-primary">3. Votre formule</legend>
        <FormField id="plan_select" label="Formule" errors={errors.plan}>
          <Select
            id="plan_select"
            value={planCode}
            onChange={(e) => {
              setPlanCode(e.target.value);
              setPlanTouched(true);
            }}
          >
            {plans.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormField>
        <IntervalToggle value={interval} onChange={setBillingInterval} />
        {plan ? (
          <div className="rounded-2xl border border-border bg-surface/80 p-3">
            <PlanPrice plan={plan} interval={interval} size="md" />
            <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Gift className="size-3.5" aria-hidden /> Essai gratuit {plan.trial_days} jours : rien à payer aujourd&apos;hui.
            </p>
          </div>
        ) : null}
      </fieldset>

      <Checkbox name="terms" label="J'accepte les conditions d'utilisation de NéoScol et le traitement des données de l'établissement." required />
      {errors.terms ? <p className="-mt-3 text-xs font-medium text-danger">{errors.terms[0]}</p> : null}

      <SubmitButton size="lg" pendingLabel="Création de votre établissement…" className="w-full uppercase tracking-wide">
        <Rocket aria-hidden /> Commencer mon essai gratuit
      </SubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        Déjà inscrit ?{" "}
        <Link href="/connexion" className="font-semibold text-primary hover:underline">
          Se connecter
        </Link>{" "}
        ·{" "}
        <Link href="/tarifs" className="font-semibold text-primary hover:underline">
          Voir les tarifs
        </Link>
      </p>
    </ActionForm>
  );
}
