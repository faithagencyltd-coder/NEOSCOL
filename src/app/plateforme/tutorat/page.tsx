import { GraduationCap, ToggleRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { TabNav } from "@/components/shared/tab-nav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bars, Empty, Kpi, Panel } from "@/features/analytics/charts";
import { InlineForm } from "@/features/ecosystem/components/inline-form";
import { resolveReport } from "@/features/ecosystem/platform-actions";
import { reviewTutor, runTutorSuggestions, saveTutorSettings } from "@/features/tutoring/actions";
import { REQUEST_STATUS, TUTOR_MODES, TUTOR_STATUS, VERIFICATION } from "@/features/tutoring/constants";
import { canWritePlatform, getPlatformRole } from "@/lib/auth/platform";
import { createClient } from "@/lib/supabase/server";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Tutor Match — Console" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "vue", label: "Vue d'ensemble" },
  { key: "tuteurs", label: "Tuteurs" },
  { key: "demandes", label: "Demandes" },
  { key: "signalements", label: "Signalements" },
  { key: "reglages", label: "Réglages" },
] as const;
type Tab = (typeof TABS)[number]["key"];
const day = (d: string) => new Date(d).toLocaleDateString("fr-FR");

/** Console › Tutor Match : tuteurs (validation, vérification), demandes, signalements, suggestions, réglages. */
export default async function TutorConsolePage({ searchParams }: PageProps<"/plateforme/tutorat">) {
  const sp = await searchParams;
  const requested = param(sp, "onglet");
  const tab: Tab = TABS.find((t) => t.key === requested)?.key ?? "vue";
  const writable = canWritePlatform(await getPlatformRole());
  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <GraduationCap className="size-6 text-primary" aria-hidden /> NEOSCOOL Tutor Match
        </h1>
        <p className="text-sm text-muted-foreground">
          Service facultatif de soutien scolaire. Aucune donnée scolaire n&apos;est transmise aux tuteurs ; les coordonnées ne sont échangées qu&apos;après acceptation et confirmation.
        </p>
        <p className="flex items-center gap-1.5 text-sm">
          <ToggleRight className="size-4 text-primary" aria-hidden /> Ouverture (toute la plateforme, par pays, par type ou par établissement, période pilote) :{" "}
          <Link href="/plateforme/modules" className="font-semibold text-primary hover:underline">
            Contrôle des modules › NeoScool Tutor Match
          </Link>
        </p>
      </div>
      <TabNav label="Tutor Match" active={tab} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/plateforme/tutorat?onglet=${t.key}` }))} />
      {tab === "vue" ? <OverviewTab /> : null}
      {tab === "tuteurs" ? <TutorsTab writable={writable} filter={param(sp, "filtre")} /> : null}
      {tab === "demandes" ? <RequestsTab /> : null}
      {tab === "signalements" ? <ReportsTab writable={writable} /> : null}
      {tab === "reglages" ? <SettingsTab writable={writable} /> : null}
    </div>
  );
}

async function OverviewTab() {
  const { data } = await (await createClient()).rpc("platform_tutor_overview");
  const o = data as {
    tutors: Record<string, number> | null;
    verification_requested: number;
    verified: number;
    requests: Record<string, number> | null;
    sessions: number;
    suggestions_90d: number;
    from_suggestion: number;
    reports_open: number;
    blocks: number;
    subjects: { subject: string; n: number }[];
  } | null;
  if (!o) return <Empty>Statistiques indisponibles.</Empty>;
  const req = o.requests ?? {};
  const total = Object.values(req).reduce((a, b) => a + b, 0);
  return (
    <div className="grid gap-4" data-testid="tutor-overview">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Tuteurs visibles" value={String(o.tutors?.approved ?? 0)} hint={`${o.tutors?.pending ?? 0} fiche(s) à valider · ${o.verified} vérifié(s)`} />
        <Kpi label="Demandes de familles" value={String(total)} hint={`${req.confirmed ?? 0} accompagnement(s) confirmé(s) · ${o.sessions} séance(s)`} />
        <Kpi label="Suggestions (90 jours)" value={String(o.suggestions_90d)} hint={`${o.from_suggestion} demande(s) issue(s) d'une suggestion`} />
        <Kpi label="À traiter" value={String(o.reports_open + o.verification_requested)} hint={`${o.reports_open} signalement(s) · ${o.verification_requested} vérification(s) · ${o.blocks} blocage(s)`} />
      </div>
      <Panel title="Matières les plus demandées">
        <Bars rows={o.subjects.map((s) => ({ label: s.subject, value: s.n }))} empty="Aucune demande pour le moment." />
      </Panel>
    </div>
  );
}

async function TutorsTab({ writable, filter }: { writable: boolean; filter?: string }) {
  let query = (await createClient())
    .from("tutor_profiles")
    .select("*, profile:profiles!tutor_profiles_user_id_fkey(first_name, last_name, email, phone)")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (filter === "a-valider") query = query.eq("status", "pending");
  if (filter === "verification") query = query.eq("verification", "requested");
  const { data: rows } = await query;
  return (
    <div className="grid gap-3" data-testid="tutors-list">
      <div className="flex flex-wrap gap-2 text-sm">
        {[
          ["", "Toutes"],
          ["a-valider", "À valider"],
          ["verification", "Vérification demandée"],
        ].map(([k, v]) => (
          <a key={k} href={`/plateforme/tutorat?onglet=tuteurs${k ? `&filtre=${k}` : ""}`} className={`rounded-full border px-3 py-1 ${(filter ?? "") === k ? "border-primary text-primary" : "border-border"}`}>
            {v}
          </a>
        ))}
      </div>
      {!rows?.length ? <Empty>Aucune fiche.</Empty> : null}
      <ul className="grid gap-2">
        {(rows ?? []).map((t) => (
          <li key={t.user_id} className="grid gap-1 rounded-xl border border-border bg-surface p-3 text-sm" data-testid={`tutor-${t.profile?.email}`}>
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {[t.profile?.first_name, t.profile?.last_name].filter(Boolean).join(" ") || "—"} · {t.headline}
              </span>
              <span className="flex gap-1">
                <StatusBadge value={t.status} map={TUTOR_STATUS} />
                <StatusBadge value={t.verification} map={VERIFICATION} />
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              {t.kind === "school_teacher" ? "Enseignant d'établissement" : "Tuteur indépendant"} · {t.profile?.email ?? "—"} · {t.profile?.phone ?? "sans téléphone"} · {t.city}, {t.country} ·{" "}
              {t.modes.map((m) => TUTOR_MODES[m] ?? m).join(", ")}
            </span>
            <span className="text-xs">
              {t.subjects.join(", ")} · {t.levels.join(", ")}
            </span>
            {t.qualifications ? <span className="text-xs">Qualifications déclarées : {t.qualifications}</span> : null}
            {t.references_text ? <span className="text-xs">Références : {t.references_text}</span> : null}
            {t.verification_note ? <span className="text-xs text-muted-foreground">Vérification : {t.verification_note}</span> : null}
            {t.review_note ? <span className="text-xs text-muted-foreground">Note : {t.review_note}</span> : null}
            {writable ? (
              <span className="flex flex-wrap gap-2">
                {t.status !== "approved" && t.status !== "hidden" ? <InlineForm action={reviewTutor} hidden={{ user_id: t.user_id, action: "approve" }} submit="Approuver" variant="secondary" className="flex" /> : null}
                {t.verification !== "verified" ? (
                  <QuickFormDialog
                    title="Marquer le profil comme vérifié"
                    description="Ne cochez « vérifié » qu'après avoir réellement contrôlé les pièces (identité, diplômes)."
                    action={reviewTutor}
                    hidden={{ user_id: t.user_id, action: "verify" }}
                    trigger={
                      <Button size="sm" variant="ghost">
                        Vérifier
                      </Button>
                    }
                    fields={[{ name: "note", label: "Ce qui a été vérifié (affiché au tuteur)", required: true, wide: true, placeholder: "ex. Pièce d'identité et licence de mathématiques vérifiées le …" }]}
                  />
                ) : null}
                {t.verification === "requested" ? (
                  <QuickFormDialog title="Refuser la vérification" action={reviewTutor} hidden={{ user_id: t.user_id, action: "reject_verification" }} trigger={<Button size="sm" variant="ghost">Refuser la vérification</Button>} fields={[{ name: "note", label: "Motif", type: "textarea", required: true, wide: true }]} />
                ) : null}
                {t.status !== "suspended" ? (
                  <QuickFormDialog title="Suspendre la fiche" action={reviewTutor} hidden={{ user_id: t.user_id, action: "suspend" }} trigger={<Button size="sm" variant="ghost">Suspendre</Button>} fields={[{ name: "note", label: "Motif", type: "textarea", required: true, wide: true }]} />
                ) : null}
                {t.status === "pending" ? (
                  <QuickFormDialog title="Refuser la fiche" action={reviewTutor} hidden={{ user_id: t.user_id, action: "reject" }} trigger={<Button size="sm" variant="ghost">Refuser</Button>} fields={[{ name: "note", label: "Motif", type: "textarea", required: true, wide: true }]} />
                ) : null}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

async function RequestsTab() {
  // Données minimales : ni messages ni coordonnées (confidentialité des familles).
  const { data: rows } = await (await createClient())
    .from("tutor_requests")
    .select("id, status, subject, level, mode, source, created_at, updated_at, closed_reason")
    .order("created_at", { ascending: false })
    .limit(300);
  return (
    <div className="grid gap-2" data-testid="tutor-requests-console">
      <p className="text-sm text-muted-foreground">Vue de suivi : les messages échangés entre familles et tuteurs ne sont pas affichés ici.</p>
      {!rows?.length ? <Empty>Aucune demande.</Empty> : null}
      <ul className="grid gap-1">
        {(rows ?? []).map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
            <span>
              {r.subject} ({r.level}) · {TUTOR_MODES[r.mode] ?? r.mode} · {r.source === "suggestion" ? "après suggestion" : "recherche"} · {day(r.created_at)}
              {r.closed_reason ? ` · ${r.closed_reason}` : ""}
            </span>
            <StatusBadge value={r.status} map={REQUEST_STATUS} />
          </li>
        ))}
      </ul>
    </div>
  );
}

async function ReportsTab({ writable }: { writable: boolean }) {
  const supabase = await createClient();
  const { data: reports } = await supabase.from("content_reports").select("*").eq("target_type", "tutor").order("created_at", { ascending: false }).limit(200);
  const ids = [...new Set((reports ?? []).map((r) => r.target_id))];
  const { data: tutors } = ids.length ? await supabase.from("tutor_profiles").select("user_id, headline, status").in("user_id", ids) : { data: [] };
  const byId = new Map((tutors ?? []).map((t) => [t.user_id, t]));
  return (
    <div className="grid gap-2" data-testid="tutor-reports">
      {!reports?.length ? <Empty>Aucun signalement.</Empty> : null}
      {(reports ?? []).map((r) => (
        <div key={r.id} className="grid gap-1 rounded-xl border border-border bg-surface p-3 text-sm">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">
              {byId.get(r.target_id)?.headline ?? "Fiche supprimée"} · motif : {r.reason}
            </span>
            <StatusBadge value={r.status} map={{ open: { label: "À traiter", tone: "warning" }, resolved: { label: "Traité", tone: "success" }, dismissed: { label: "Classé", tone: "neutral" } }} />
          </span>
          {r.details ? <span className="text-xs">{r.details}</span> : null}
          <span className="text-xs text-muted-foreground">{day(r.created_at)}{r.resolution_note ? ` · ${r.resolution_note}` : ""}</span>
          {writable && r.status === "open" ? (
            <span className="flex flex-wrap gap-2">
              <QuickFormDialog title="Traiter le signalement" action={resolveReport} hidden={{ id: r.id, status: "resolved" }} trigger={<Button size="sm" variant="secondary">Traiter</Button>} fields={[{ name: "reason", label: "Décision prise (ex. fiche suspendue)", type: "textarea", wide: true }]} />
              <InlineForm action={resolveReport} hidden={{ id: r.id, status: "dismissed" }} submit="Classer sans suite" variant="ghost" className="flex" />
              <Link href="/plateforme/tutorat?onglet=tuteurs" className="self-center text-xs text-primary hover:underline">
                Voir les tuteurs →
              </Link>
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

async function SettingsTab({ writable }: { writable: boolean }) {
  const { data: s } = await (await createClient()).from("tutor_settings").select("*").eq("id", 1).maybeSingle();
  if (!s) return null;
  const box = (name: keyof typeof s, label: string, hint: string) => (
    <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={Boolean(s[name])} disabled={!writable} className="mt-0.5 size-4" />
      <span className="grid">
        <strong>{label}</strong>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
  const num = (name: keyof typeof s, label: string, step = "1") => (
    <label className="grid gap-1 text-sm">
      {label}
      <input name={name} type="number" step={step} defaultValue={String(s[name] ?? "")} disabled={!writable} className="h-9 rounded-lg border border-border px-2" />
    </label>
  );
  return (
    <div className="grid gap-4" data-testid="tutor-settings">
      <InlineForm action={saveTutorSettings} submit={writable ? "Enregistrer" : undefined} className="grid gap-4">
        <Panel title="Qui peut proposer des cours" description="Le service lui-même s'ouvre dans Contrôle des modules (fermé par défaut).">
          <div className="grid gap-2 sm:grid-cols-2">
            {box("independent_tutors", "Tuteurs indépendants", "Personnes ne travaillant pas dans un établissement inscrit.")}
            {box("school_teachers", "Enseignants d'établissements", "Comptes enseignants actifs dans un établissement NeoScool.")}
            {box("require_verification", "Vérification obligatoire", "Seuls les profils vérifiés par l'équipe apparaissent aux familles.")}
            {box("forbid_own_school", "Pas de cours payants dans son propre établissement", "Un enseignant ne peut pas recevoir de demande d'une famille de son établissement.")}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">{num("max_open_requests", "Demandes en cours maximum par famille")}</div>
        </Panel>
        <Panel title="Suggestions automatiques de soutien" description="Désactivées par défaut. Règle : moyenne d'une matière inférieure au seuil sur les N derniers bulletins PUBLIÉS de l'élève. Le parent reçoit une proposition facultative (seule la matière est citée) et peut refuser ces suggestions.">
          <div className="grid gap-2">
            {box("suggestions_enabled", "Suggestions activées", "Seulement pour les établissements où Tutor Match est ouvert.")}
            <div className="grid gap-3 sm:grid-cols-3">
              {num("suggestion_threshold", "Seuil de moyenne (ex. 10 sur 20)", "0.5")}
              {num("suggestion_periods", "Nombre de bulletins consécutifs")}
              {num("suggestion_cooldown_days", "Délai avant une nouvelle suggestion (jours)")}
            </div>
          </div>
        </Panel>
        <Panel title="Règles du service" description="Affichées aux familles et aux tuteurs.">
          <Textarea name="terms" rows={5} maxLength={6000} defaultValue={s.terms ?? ""} disabled={!writable} />
        </Panel>
      </InlineForm>
      {writable ? (
        <Panel title="Lancer l'analyse des bulletins maintenant" description="Envoie les suggestions dues (sinon : chaque nuit). Aucune suggestion n'est envoyée si l'option est désactivée.">
          <InlineForm action={runTutorSuggestions} submit="Lancer l'analyse" variant="secondary" className="flex" />
        </Panel>
      ) : null}
    </div>
  );
}
