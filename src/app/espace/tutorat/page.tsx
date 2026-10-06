import { BadgeCheck, Ban, Flag, GraduationCap, Search, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InlineForm } from "@/features/ecosystem/components/inline-form";
import { blockTutor, createTutorRequest, reportTutor, suggestionPreference } from "@/features/tutoring/actions";
import { RequestCard, type TutorRequest } from "@/features/tutoring/components/request-card";
import { money, RATE_UNITS, TUTOR_LANGUAGES, TUTOR_MODES, VERIFICATION } from "@/features/tutoring/constants";
import { defaultTutoringCountry } from "@/features/tutoring/server";
import { createClient } from "@/lib/supabase/server";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Soutien scolaire — NeoScool Tutor Match" };
export const dynamic = "force-dynamic";

type Space = {
  as_parent: TutorRequest[];
  blocked: { tutor_id: string; name: string }[];
  suggestions: { id: string; child: string | null; subject: string; created_at: string }[];
  opted_out: boolean;
};
const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));
const REPORT_REASONS = { fraud: "Fraude ou arnaque", inappropriate: "Comportement inapproprié", misleading: "Informations trompeuses", personal_data: "Données personnelles", discrimination: "Discrimination", other: "Autre" };

/** Familles : trouver un tuteur, envoyer une demande, suivre les échanges et les séances. */
export default async function TutoringPage({ searchParams }: PageProps<"/espace/tutorat">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const country = (param(sp, "pays") ?? (await defaultTutoringCountry()).country).toUpperCase();
  const filters = {
    subject: param(sp, "matiere") ?? "",
    level: param(sp, "niveau") ?? "",
    city: param(sp, "ville") ?? "",
    mode: param(sp, "mode") ?? "",
    language: param(sp, "langue") ?? "",
    max: param(sp, "tarif_max") ?? "",
  };
  const [{ data: open }, { data: raw }, { data: countries }, { data: settings }] = await Promise.all([
    supabase.rpc("tutor_match_open", { p_country: country }),
    supabase.rpc("my_tutor_space"),
    supabase.from("countries").select("code, name").eq("is_active", true).order("name"),
    supabase.from("tutor_settings").select("terms").eq("id", 1).maybeSingle(),
  ]);
  const space = (raw ?? { as_parent: [], blocked: [], suggestions: [], opted_out: false }) as unknown as Space;
  const searched = Object.values(filters).some(Boolean) || param(sp, "recherche") === "1";
  const { data: tutors } = open && searched
    ? await supabase.rpc("tutor_search", {
        p_country: country,
        p_subject: filters.subject,
        p_level: filters.level,
        p_city: filters.city,
        p_mode: filters.mode,
        p_language: filters.language,
        p_max_rate: (filters.max ? Number(filters.max) : null) as number,
      })
    : { data: [] };

  return (
    <div className="grid gap-5" data-testid="tutoring-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <GraduationCap className="size-6 text-primary" aria-hidden /> Soutien scolaire
          </h1>
          <p className="text-sm text-muted-foreground">
            Service facultatif pour trouver un tuteur ou un répétiteur. Aucune note ni aucun bulletin n&apos;est transmis au tuteur : vous seul décidez de ce que vous écrivez.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="/espace/tuteur" className="rounded-xl border border-border px-3 py-2 font-semibold">
            Je suis tuteur
          </Link>
          <Link href="/espace" className="rounded-xl px-3 py-2 text-primary hover:underline">
            ← Mon espace
          </Link>
        </div>
      </div>

      {space.suggestions.length ? (
        <Card className="grid gap-2 border-primary/30 bg-primary/5 p-4 text-sm" data-testid="tutor-suggestions">
          <p className="flex items-center gap-2 font-semibold">
            <Sparkles className="size-4 text-primary" aria-hidden /> Une possibilité d&apos;accompagnement
          </p>
          {space.suggestions.map((g) => (
            <div key={g.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Certains résultats de {g.child ?? "votre enfant"} indiquent qu&apos;un accompagnement supplémentaire pourrait être utile en <strong>{g.subject}</strong>. Souhaitez-vous découvrir les possibilités de soutien scolaire ?
              </span>
              <span className="flex gap-2">
                <Link href={`/espace/tutorat?matiere=${encodeURIComponent(g.subject)}&source=suggestion`} className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-white">
                  Voir les tuteurs
                </Link>
                <InlineForm action={suggestionPreference} hidden={{ dismiss: g.id }} submit="Non merci" variant="ghost" className="flex" />
              </span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Ce n&apos;est qu&apos;une proposition, fondée sur les bulletins publiés par l&apos;établissement ; elle ne juge ni votre enfant ni son école.</p>
        </Card>
      ) : null}

      {!open ? (
        <p className="rounded-xl bg-surface-muted p-4 text-sm" data-testid="tutoring-closed">
          Le service de soutien scolaire n&apos;est pas encore ouvert dans ce pays.
        </p>
      ) : (
        <>
          <form className="grid gap-2 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-3" role="search" data-testid="tutor-search">
            <input type="hidden" name="recherche" value="1" />
            <label className="grid gap-1 text-sm">
              Matière
              <input name="matiere" defaultValue={filters.subject} placeholder="ex. Mathématiques" className="h-9 rounded-lg border border-border px-2" />
            </label>
            <label className="grid gap-1 text-sm">
              Niveau ou classe
              <input name="niveau" defaultValue={filters.level} placeholder="ex. 3e, Terminale" className="h-9 rounded-lg border border-border px-2" />
            </label>
            <label className="grid gap-1 text-sm">
              Ville ou quartier
              <input name="ville" defaultValue={filters.city} className="h-9 rounded-lg border border-border px-2" />
            </label>
            <label className="grid gap-1 text-sm">
              Mode
              <select name="mode" defaultValue={filters.mode} className="h-9 rounded-lg border border-border px-2">
                <option value="">Tous</option>
                {Object.entries(TUTOR_MODES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Langue
              <select name="langue" defaultValue={filters.language} className="h-9 rounded-lg border border-border px-2">
                <option value="">Toutes</option>
                {Object.entries(TUTOR_LANGUAGES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Tarif maximum
              <input name="tarif_max" type="number" min={0} defaultValue={filters.max} className="h-9 rounded-lg border border-border px-2" />
            </label>
            <label className="grid gap-1 text-sm">
              Pays
              <select name="pays" defaultValue={country} className="h-9 rounded-lg border border-border px-2">
                {(countries ?? []).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end sm:col-span-2">
              <Button type="submit">
                <Search aria-hidden /> Rechercher
              </Button>
            </div>
          </form>

          {searched ? (
            (tutors ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="tutor-results-empty">
                Aucun tuteur ne correspond pour le moment.
              </p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2" data-testid="tutor-results">
                {(tutors ?? []).map((t) => (
                  <li key={t.user_id} className="grid gap-2 rounded-2xl border border-border bg-surface p-4 text-sm" data-testid="tutor-card">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-base">{t.name}</strong>
                      <StatusBadge value={t.verification} map={VERIFICATION} />
                    </span>
                    <span className="font-medium">{t.headline}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.subjects.join(", ")} · {t.levels.join(", ")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t.city}
                      {t.zones.length ? ` (${t.zones.join(", ")})` : ""} · {t.modes.map((m) => TUTOR_MODES[m] ?? m).join(", ")} · {t.languages.map((l) => TUTOR_LANGUAGES[l] ?? l).join(", ")}
                    </span>
                    {t.bio ? <p className="line-clamp-3">{t.bio}</p> : null}
                    <span className="text-xs">
                      {t.rate_amount != null ? `${money(t.rate_amount, t.currency)} / ${RATE_UNITS[t.rate_unit] ?? t.rate_unit}` : "Tarif à convenir"}
                      {t.experience_years != null ? ` · ${t.experience_years} an(s) d'expérience` : ""}
                      {t.availability ? ` · ${t.availability}` : ""}
                    </span>
                    {t.qualifications ? (
                      <span className="flex items-start gap-1 text-xs">
                        {t.verification === "verified" ? <BadgeCheck className="size-3.5 shrink-0 text-success" aria-hidden /> : null}
                        {t.verification === "verified" ? "Qualifications vérifiées : " : "Qualifications déclarées (non vérifiées) : "}
                        {t.qualifications}
                      </span>
                    ) : null}
                    <span className="flex flex-wrap gap-2">
                      <QuickFormDialog
                        title={`Demander un cours à ${t.name}`}
                        description="Ne mentionnez ni notes ni informations sensibles : le tuteur n'a pas besoin du dossier scolaire pour vous répondre."
                        action={createTutorRequest}
                        hidden={{ tutor_id: t.user_id, source: param(sp, "source") === "suggestion" ? "suggestion" : "search" }}
                        trigger={<Button size="sm">Demander un cours</Button>}
                        fields={[
                          { name: "subject", label: "Matière", required: true, defaultValue: filters.subject || t.subjects[0] },
                          { name: "level", label: "Niveau ou classe", required: true, defaultValue: filters.level },
                          { name: "mode", label: "Mode", type: "select", options: t.modes.map((m) => ({ value: m, label: TUTOR_MODES[m] ?? m })), defaultValue: t.modes[0] },
                          { name: "child_label", label: "Prénom de l'enfant (facultatif)" },
                          { name: "schedule", label: "Vos disponibilités", wide: true, placeholder: "ex. mercredi après-midi, samedi matin" },
                          { name: "message", label: "Votre message (10 caractères minimum)", type: "textarea", required: true, wide: true },
                        ]}
                      />
                      <QuickFormDialog
                        title="Signaler ce profil"
                        action={reportTutor}
                        hidden={{ tutor_id: t.user_id }}
                        trigger={
                          <Button size="sm" variant="ghost">
                            <Flag aria-hidden /> Signaler
                          </Button>
                        }
                        fields={[
                          { name: "reason", label: "Motif", type: "select", options: opts(REPORT_REASONS), defaultValue: "misleading" },
                          { name: "details", label: "Précisions", type: "textarea", wide: true },
                        ]}
                      />
                      <InlineForm action={blockTutor} hidden={{ tutor_id: t.user_id }} submit="Bloquer" variant="ghost" className="flex" />
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : null}
          {settings?.terms ? <p className="whitespace-pre-line rounded-lg bg-surface-muted p-3 text-xs">{settings.terms}</p> : null}
        </>
      )}

      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">Mes demandes</h2>
        {space.as_parent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune demande pour le moment.</p>
        ) : (
          <ul className="grid gap-2" data-testid="my-tutor-requests">
            {space.as_parent.map((r) => (
              <RequestCard key={r.id} r={r} side="parent" />
            ))}
          </ul>
        )}
      </section>

      {space.blocked.length ? (
        <section className="grid gap-2 text-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Ban className="size-5" aria-hidden /> Tuteurs bloqués
          </h2>
          {space.blocked.map((b) => (
            <span key={b.tutor_id} className="flex items-center gap-2">
              {b.name}
              <InlineForm action={blockTutor} hidden={{ tutor_id: b.tutor_id, blocked: "false" }} submit="Débloquer" variant="ghost" className="flex" />
            </span>
          ))}
        </section>
      ) : null}

      <section className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {space.opted_out ? "Vous ne recevez pas de suggestions de soutien scolaire." : "Vous pouvez recevoir une suggestion de soutien si les bulletins publiés le justifient."}
        <InlineForm action={suggestionPreference} hidden={{ opt_out: space.opted_out ? "false" : "true" }} submit={space.opted_out ? "Réactiver les suggestions" : "Ne plus recevoir de suggestions"} variant="ghost" className="flex" />
      </section>
    </div>
  );
}
