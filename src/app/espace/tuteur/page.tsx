import { BadgeCheck, GraduationCap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { StatusBadge } from "@/components/shared/status-badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { InlineForm } from "@/features/ecosystem/components/inline-form";
import { requestTutorVerification, saveTutorProfile, setTutorVisibility } from "@/features/tutoring/actions";
import { RequestCard, type TutorRequest } from "@/features/tutoring/components/request-card";
import { RATE_UNITS, TUTOR_LANGUAGES, TUTOR_MODES, TUTOR_STATUS, VERIFICATION } from "@/features/tutoring/constants";
import { defaultTutoringCountry } from "@/features/tutoring/server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Espace tuteur — NeoScool Tutor Match" };
export const dynamic = "force-dynamic";

type Profile = {
  status: keyof typeof TUTOR_STATUS;
  kind: string;
  headline: string;
  bio: string | null;
  subjects: string[];
  levels: string[];
  country: string;
  city: string;
  zones: string[];
  modes: string[];
  languages: string[];
  rate_amount: number | null;
  rate_unit: string;
  availability: string | null;
  experience_years: number | null;
  qualifications: string | null;
  references_text: string | null;
  verification: keyof typeof VERIFICATION;
  verification_note: string | null;
  review_note: string | null;
};

/** Tuteurs : fiche (sans coordonnées publiques), vérification, demandes reçues, séances. */
export default async function TutorSpacePage() {
  const supabase = await createClient();
  const [{ data: raw }, { data: countries }, { data: settings }, account] = await Promise.all([
    supabase.rpc("my_tutor_space"),
    supabase.from("countries").select("code, name").eq("is_active", true).order("name"),
    supabase.from("tutor_settings").select("terms, require_verification").eq("id", 1).maybeSingle(),
    defaultTutoringCountry(),
  ]);
  const space = (raw ?? {}) as { profile?: Profile | null; as_tutor?: TutorRequest[] };
  const p = space.profile ?? null;
  const defaultCountry = p?.country ?? account.country;
  const { data: open } = await supabase.rpc("tutor_match_open", { p_country: defaultCountry });
  const input = "h-9 rounded-lg border border-border px-2";

  return (
    <div className="grid gap-5" data-testid="tutor-space">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <GraduationCap className="size-6 text-primary" aria-hidden /> Espace tuteur
          </h1>
          <p className="text-sm text-muted-foreground">
            Proposez des cours particuliers aux familles. Votre téléphone et votre e-mail ne sont jamais affichés publiquement : ils sont communiqués à une famille seulement quand vous acceptez sa demande.
          </p>
        </div>
        <Link href="/espace/tutorat" className="text-sm text-primary hover:underline">
          Soutien scolaire →
        </Link>
      </div>

      {p ? (
        <Card className="grid gap-2 p-4 text-sm" data-testid="tutor-profile-status">
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge value={p.status} map={TUTOR_STATUS} />
            <StatusBadge value={p.verification} map={VERIFICATION} />
          </span>
          {p.status === "pending" ? <p>Votre fiche est en cours d&apos;examen par l&apos;équipe NeoScool.</p> : null}
          {p.review_note ? <p className="text-xs">Message de l&apos;équipe : {p.review_note}</p> : null}
          {p.verification === "verified" && p.verification_note ? (
            <p className="flex items-center gap-1 text-xs text-success">
              <BadgeCheck className="size-3.5" aria-hidden /> {p.verification_note}
            </p>
          ) : null}
          {settings?.require_verification && p.verification !== "verified" ? (
            <p className="text-xs text-warning">Les familles ne voient que les profils vérifiés par NeoScool.</p>
          ) : null}
          <span className="flex flex-wrap gap-2">
            {p.verification === "unverified" || p.verification === "rejected" ? (
              <InlineForm action={requestTutorVerification} submit="Demander la vérification de mon profil" variant="secondary" className="flex flex-wrap items-center gap-2">
                <input name="note" maxLength={500} placeholder="Pièces que vous pouvez présenter (identité, diplômes…)" aria-label="Pièces disponibles" className={`${input} w-80 max-w-full`} />
              </InlineForm>
            ) : null}
            {p.status === "approved" ? <InlineForm action={setTutorVisibility} hidden={{ visible: "false" }} submit="Masquer ma fiche" variant="ghost" className="flex" /> : null}
            {p.status === "hidden" ? <InlineForm action={setTutorVisibility} hidden={{ visible: "true" }} submit="Rendre ma fiche visible" variant="secondary" className="flex" /> : null}
          </span>
        </Card>
      ) : null}

      {!open && !p ? (
        <p className="rounded-xl bg-surface-muted p-4 text-sm" data-testid="tutor-closed">
          Le service n&apos;est pas encore ouvert dans votre pays.
        </p>
      ) : p && ["suspended", "rejected"].includes(p.status) ? null : (
        <section className="grid gap-2">
          <h2 className="text-lg font-semibold">{p ? "Ma fiche" : "Créer ma fiche de tuteur"}</h2>
          <InlineForm action={saveTutorProfile} submit="Enregistrer ma fiche" className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2" testId="tutor-profile-form">
            <label className="grid gap-1 text-sm sm:col-span-2">
              Présentation courte *
              <input name="headline" required minLength={5} maxLength={120} defaultValue={p?.headline ?? ""} placeholder="ex. Professeur de mathématiques, collège et lycée" className={input} />
            </label>
            <label className="grid gap-1 text-sm">
              Matières * (séparées par des virgules)
              <input name="subjects" required defaultValue={p?.subjects.join(", ") ?? ""} placeholder="Mathématiques, Physique" className={input} />
            </label>
            <label className="grid gap-1 text-sm">
              Niveaux * (séparés par des virgules)
              <input name="levels" required defaultValue={p?.levels.join(", ") ?? ""} placeholder="4e, 3e, Seconde" className={input} />
            </label>
            <label className="grid gap-1 text-sm">
              Pays *
              <select name="country" defaultValue={defaultCountry} className={input}>
                {(countries ?? []).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Ville *
              <input name="city" required minLength={2} maxLength={80} defaultValue={p?.city ?? account.city ?? ""} className={input} />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              Quartiers ou zones de déplacement (séparés par des virgules)
              <input name="zones" defaultValue={p?.zones.join(", ") ?? ""} className={input} />
            </label>
            <fieldset className="grid gap-1 text-sm">
              <legend>Modes de cours *</legend>
              <span className="flex flex-wrap gap-3">
                {Object.entries(TUTOR_MODES).map(([k, v]) => (
                  <label key={k} className="flex items-center gap-1.5">
                    <input type="checkbox" name={`mode_${k}`} defaultChecked={p ? p.modes.includes(k) : k !== "center"} className="size-4" /> {v}
                  </label>
                ))}
              </span>
            </fieldset>
            <fieldset className="grid gap-1 text-sm">
              <legend>Langues</legend>
              <span className="flex flex-wrap gap-3">
                {Object.entries(TUTOR_LANGUAGES).map(([k, v]) => (
                  <label key={k} className="flex items-center gap-1.5">
                    <input type="checkbox" name={`lang_${k}`} defaultChecked={p ? p.languages.includes(k) : k === "fr"} className="size-4" /> {v}
                  </label>
                ))}
              </span>
            </fieldset>
            <label className="grid gap-1 text-sm">
              Tarif (facultatif)
              <span className="flex gap-2">
                <input name="rate_amount" type="number" min={0} defaultValue={p?.rate_amount ?? ""} className={`${input} flex-1`} aria-label="Montant" />
                <select name="rate_unit" defaultValue={p?.rate_unit ?? "hour"} className={input} aria-label="Unité">
                  {Object.entries(RATE_UNITS).map(([k, v]) => (
                    <option key={k} value={k}>
                      par {v}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <label className="grid gap-1 text-sm">
              Années d&apos;expérience
              <input name="experience_years" type="number" min={0} max={60} defaultValue={p?.experience_years ?? ""} className={input} />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              Disponibilités
              <input name="availability" maxLength={300} defaultValue={p?.availability ?? ""} placeholder="ex. soirs de semaine, samedi" className={input} />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              Diplômes et qualifications (affichés « déclarés » tant que NeoScool ne les a pas vérifiés)
              <Textarea name="qualifications" rows={2} maxLength={1000} defaultValue={p?.qualifications ?? ""} />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              Présentation détaillée
              <Textarea name="bio" rows={3} maxLength={2000} defaultValue={p?.bio ?? ""} />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              Références (facultatif, visibles uniquement par l&apos;équipe NeoScool)
              <input name="references" maxLength={500} defaultValue={p?.references_text ?? ""} className={input} />
            </label>
            {settings?.terms ? <p className="whitespace-pre-line rounded-lg bg-surface-muted p-3 text-xs sm:col-span-2">{settings.terms}</p> : null}
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="accept_terms" required className="mt-0.5 size-4" /> Je m&apos;engage à respecter les règles du service : sécurité des enfants, aucune demande de données scolaires, comportement professionnel.
            </label>
          </InlineForm>
        </section>
      )}

      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">Demandes reçues</h2>
        {(space.as_tutor ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune demande pour le moment.</p>
        ) : (
          <ul className="grid gap-2" data-testid="tutor-received">
            {(space.as_tutor ?? []).map((r) => (
              <RequestCard key={r.id} r={r} side="tutor" />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
