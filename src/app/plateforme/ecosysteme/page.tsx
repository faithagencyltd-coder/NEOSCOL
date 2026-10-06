import { BadgeCheck, Flag, Inbox, Megaphone, ShoppingCart, Store, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { TabNav } from "@/components/shared/tab-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { InlineForm } from "@/features/ecosystem/components/inline-form";
import { AD_MODES, AD_STATUSES, CAMPAIGN_STATUSES, LEAD_SOURCES, OFFER_KINDS, OPPORTUNITY_KINDS, OPPORTUNITY_STATUSES, ORDER_STATUSES, REPORT_REASONS, toOptions, VERIFICATION_STATUSES } from "@/features/ecosystem/constants";
import {
  confirmVisibilityOrder,
  decideVerification,
  moderateContent,
  resolveReport,
  saveEcosystemSettings,
  saveOpportunityCategory,
  saveVerificationRequirement,
  saveVisibilityOffer,
  setAdPlatform,
  updateAdRequest,
} from "@/features/ecosystem/platform-actions";
import { ORG_TYPE_LABELS } from "@/features/platform/org-types";
import { canWritePlatform, getPlatformRole } from "@/lib/auth/platform";
import { createClient } from "@/lib/supabase/server";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Écosystème public — Console" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "vue", label: "Vue d'ensemble" },
  { key: "moderation", label: "Modération" },
  { key: "verification", label: "Vérification" },
  { key: "categories", label: "Catégories" },
  { key: "visibilite", label: "Offres et commandes" },
  { key: "publicite", label: "Publicité externe" },
  { key: "reglages", label: "Règles de publication" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const money = (n: number | null, c: string | null) => (n ? `${new Intl.NumberFormat("fr-FR").format(n)} ${c === "XOF" ? "F CFA" : (c ?? "")}` : "—");
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const typeOptions = Object.entries(ORG_TYPE_LABELS).map(([value, label]) => ({ value, label }));

type Overview = {
  profiles: { total: number; public: number; pending_review: number; verified: number; suspended: number };
  verification_pending: number;
  campaigns: { published: number; pending: number };
  opportunities: { published: number; pending: number; applications: number };
  leads_30d: Record<string, number>;
  reports_open: number;
  orders_awaiting: number;
  ad_requests_open: number;
  public_accounts: number;
};

/** Console › Écosystème public : Discover, Leads, Promotion, Opportunities, visibilité payante, publicité externe. */
export default async function PlatformEcosystemPage({ searchParams }: PageProps<"/plateforme/ecosysteme">) {
  const requested = param(await searchParams, "onglet");
  const tab: Tab = TABS.find((t) => t.key === requested)?.key ?? "vue";
  const writable = canWritePlatform(await getPlatformRole());
  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Écosystème public</h1>
        <p className="text-sm text-muted-foreground">
          Les modules publics sont fermés par défaut : ouvrez-les dans{" "}
          <Link href="/plateforme/modules" className="text-primary hover:underline">
            Contrôle des modules
          </Link>{" "}
          (partout, par pays, par type ou pour un établissement pilote).
        </p>
      </div>
      <TabNav label="Écosystème public" active={tab} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/plateforme/ecosysteme?onglet=${t.key}` }))} />
      {tab === "vue" ? <OverviewTab /> : null}
      {tab === "moderation" ? <ModerationTab writable={writable} /> : null}
      {tab === "verification" ? <VerificationTab writable={writable} /> : null}
      {tab === "categories" ? <CategoriesTab writable={writable} /> : null}
      {tab === "visibilite" ? <VisibilityTab writable={writable} /> : null}
      {tab === "publicite" ? <AdsTab writable={writable} /> : null}
      {tab === "reglages" ? <SettingsTab writable={writable} /> : null}
    </div>
  );
}

async function OverviewTab() {
  const { data } = await (await createClient()).rpc("platform_ecosystem_overview");
  const o = data as unknown as Overview | null;
  if (!o) return null;
  return (
    <div className="grid gap-4" data-testid="ecosystem-overview">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Fiches publiques visibles" value={{ count: o.profiles.public }} hint={`${o.profiles.total} fiche(s) au total`} icon={Store} />
        <StatCard label="Profils vérifiés" value={{ count: o.profiles.verified }} hint={`${o.verification_pending} demande(s) en attente`} icon={BadgeCheck} />
        <StatCard label="Campagnes publiées" value={{ count: o.campaigns.published }} hint={`${o.campaigns.pending} à valider`} icon={Megaphone} />
        <StatCard label="Annonces publiées" value={{ count: o.opportunities.published }} hint={`${o.opportunities.pending} à valider · ${o.opportunities.applications} candidature(s)`} icon={Inbox} />
        <StatCard label="Signalements ouverts" value={{ count: o.reports_open }} icon={Flag} />
        <StatCard label="Commandes à confirmer" value={{ count: o.orders_awaiting }} icon={ShoppingCart} />
        <StatCard label="Demandes de publicité" value={{ count: o.ad_requests_open }} icon={Megaphone} />
        <StatCard label="Comptes particuliers" value={{ count: o.public_accounts }} icon={Users} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Demandes d&apos;information (30 jours), par origine</CardTitle>
          <CardDescription>Volumes seulement : le contenu des demandes reste la propriété des établissements.</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(o.leads_30d).length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune demande sur la période.</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {Object.entries(o.leads_30d).map(([k, n]) => (
                <li key={k} className="flex justify-between border-b border-border py-1">
                  <span>{LEAD_SOURCES[k] ?? k}</span>
                  <span className="font-semibold">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Boutons de décision de modération (motif obligatoire pour refuser ou suspendre). */
function ModerationButtons({ type, id, status, writable }: { type: "profile" | "campaign" | "opportunity"; id: string; status: string; writable: boolean }) {
  if (!writable) return null;
  const pending = status === "pending" || status === "pending_review";
  const suspended = status === "suspended";
  return (
    <div className="flex flex-wrap gap-2">
      {pending ? <InlineForm action={moderateContent} hidden={{ type, id, action: "approve" }} submit="Approuver" className="flex" /> : null}
      {pending ? (
        <ConfirmAction trigger={<Button size="sm" variant="secondary">Refuser</Button>} title="Refuser ce contenu" confirmLabel="Refuser" tone="danger" action={moderateContent} fields={{ type, id, action: "reject" }} reason={{ label: "Motif (communiqué à l'auteur)", required: true }} />
      ) : null}
      {!pending && !suspended ? (
        <ConfirmAction trigger={<Button size="sm" variant="ghost">Suspendre</Button>} title="Suspendre ce contenu" confirmLabel="Suspendre" tone="danger" action={moderateContent} fields={{ type, id, action: "suspend" }} reason={{ label: "Motif (communiqué à l'auteur)", required: true }} />
      ) : null}
      {suspended ? <InlineForm action={moderateContent} hidden={{ type, id, action: "restore" }} submit="Rétablir" variant="secondary" className="flex" /> : null}
    </div>
  );
}

async function ModerationTab({ writable }: { writable: boolean }) {
  const supabase = await createClient();
  const [{ data: profiles }, { data: campaigns }, { data: opportunities }, { data: reports }] = await Promise.all([
    supabase.from("org_public_profiles").select("organization_id, slug, published, review_status, moderation, tagline, description, updated_at, organizations(name, type, country)").or("review_status.eq.pending,moderation.eq.suspended").order("updated_at", { ascending: false }).limit(50),
    supabase.from("promo_campaigns").select("id, title, description, objective, status, created_at, organizations(name)").in("status", ["pending_review", "suspended"]).order("created_at", { ascending: false }).limit(50),
    supabase.from("opportunities").select("id, title, description, category, status, country, city, created_at, organization_id, organizations(name)").in("status", ["pending", "suspended"]).order("created_at", { ascending: false }).limit(50),
    supabase.from("content_reports").select("id, target_type, target_id, reason, details, status, created_at").eq("status", "open").order("created_at", { ascending: false }).limit(50),
  ]);
  const block = "grid gap-2 rounded-xl border border-border bg-surface p-3 text-sm";
  return (
    <div className="grid gap-6" data-testid="moderation">
      <section className="grid gap-2">
        <h2 className="font-semibold">Signalements ouverts ({(reports ?? []).length})</h2>
        {(reports ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Aucun signalement.</p> : null}
        {(reports ?? []).map((r) => (
          <div key={r.id} className={block}>
            <p>
              <strong>{REPORT_REASONS[r.reason] ?? r.reason}</strong> · {r.target_type === "profile" ? "Fiche" : r.target_type === "campaign" ? "Campagne" : "Annonce"} · {day(r.created_at)}
            </p>
            {r.details ? <p className="text-muted-foreground">{r.details}</p> : null}
            <p className="text-xs">
              Contenu visé :{" "}
              {r.target_type === "opportunity" ? (
                <Link href={`/opportunites/${r.target_id}`} target="_blank" className="text-primary hover:underline">
                  ouvrir l&apos;annonce
                </Link>
              ) : (
                <span className="font-mono">{r.target_id}</span>
              )}
            </p>
            {writable ? (
              <div className="flex flex-wrap gap-2">
                <ModerationButtons type={r.target_type as "profile" | "campaign" | "opportunity"} id={r.target_id} status="published" writable={writable} />
                <InlineForm action={resolveReport} hidden={{ id: r.id, status: "resolved", reason: "Contenu traité" }} submit="Marquer traité" variant="secondary" className="flex" />
                <InlineForm action={resolveReport} hidden={{ id: r.id, status: "dismissed", reason: "Signalement non fondé" }} submit="Classer sans suite" variant="ghost" className="flex" />
              </div>
            ) : null}
          </div>
        ))}
      </section>

      <section className="grid gap-2">
        <h2 className="font-semibold">Fiches publiques à valider ou suspendues</h2>
        {(profiles ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Rien à traiter.</p> : null}
        {(profiles ?? []).map((p) => {
          const org = p.organizations as unknown as { name: string; type: string; country: string } | null;
          return (
            <div key={p.organization_id} className={block}>
              <p className="font-medium">
                {org?.name} <span className="text-xs text-muted-foreground">· {ORG_TYPE_LABELS[org?.type ?? ""] ?? org?.type} · {org?.country} · /decouvrir/{p.slug}</span>
              </p>
              {p.tagline ? <p>{p.tagline}</p> : null}
              {p.description ? <p className="line-clamp-3 text-muted-foreground">{p.description}</p> : null}
              <ModerationButtons type="profile" id={p.organization_id} status={p.moderation === "suspended" ? "suspended" : "pending"} writable={writable} />
            </div>
          );
        })}
      </section>

      <section className="grid gap-2">
        <h2 className="font-semibold">Campagnes à valider ou suspendues</h2>
        {(campaigns ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Rien à traiter.</p> : null}
        {(campaigns ?? []).map((c) => (
          <div key={c.id} className={block}>
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {c.title} <StatusBadge value={c.status} map={CAMPAIGN_STATUSES} />
              <span className="text-xs text-muted-foreground">{(c.organizations as unknown as { name: string } | null)?.name}</span>
            </p>
            {c.description ? <p className="line-clamp-3 text-muted-foreground">{c.description}</p> : null}
            <ModerationButtons type="campaign" id={c.id} status={c.status} writable={writable} />
          </div>
        ))}
      </section>

      <section className="grid gap-2">
        <h2 className="font-semibold">Annonces à valider ou suspendues</h2>
        {(opportunities ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Rien à traiter.</p> : null}
        {(opportunities ?? []).map((o) => (
          <div key={o.id} className={block}>
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {o.title} <StatusBadge value={o.status} map={OPPORTUNITY_STATUSES} />
              <span className="text-xs text-muted-foreground">
                {(o.organizations as unknown as { name: string } | null)?.name ?? "Particulier"} · {o.city ?? ""} {o.country}
              </span>
            </p>
            <p className="line-clamp-3 text-muted-foreground">{o.description}</p>
            <ModerationButtons type="opportunity" id={o.id} status={o.status} writable={writable} />
          </div>
        ))}
      </section>
    </div>
  );
}

async function VerificationTab({ writable }: { writable: boolean }) {
  const supabase = await createClient();
  const [{ data: requests }, { data: requirements }, { data: countries }] = await Promise.all([
    supabase.from("org_verification_requests").select("id, organization_id, documents, message, status, review_note, created_at, organizations(name, type, country)").order("created_at", { ascending: false }).limit(50),
    supabase.from("verification_requirements").select("*").order("created_at"),
    supabase.from("countries").select("code, name").order("name"),
  ]);
  const requirementLabel = new Map((requirements ?? []).map((r) => [r.id, r.label]));
  const countryOptions = [{ value: "", label: "Tous les pays" }, ...(countries ?? []).map((c) => ({ value: c.code, label: c.name }))];
  return (
    <div className="grid gap-6" data-testid="verification-console">
      <section className="grid gap-2">
        <h2 className="font-semibold">Demandes de vérification</h2>
        <p className="text-xs text-muted-foreground">Le badge « Profil vérifié » ne dépend que des pièces contrôlées, jamais d&apos;un paiement.</p>
        {(requests ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Aucune demande.</p> : null}
        {(requests ?? []).map((r) => {
          const org = r.organizations as unknown as { name: string; type: string; country: string } | null;
          const docs = (r.documents ?? []) as { requirement_id: string; file_id: string }[];
          return (
            <div key={r.id} className="grid gap-2 rounded-xl border border-border bg-surface p-3 text-sm">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {org?.name}
                <span className="text-xs text-muted-foreground">
                  {ORG_TYPE_LABELS[org?.type ?? ""] ?? org?.type} · {org?.country} · {day(r.created_at)}
                </span>
                <StatusBadge value={r.status} map={{ pending: { label: "En attente", tone: "warning" }, approved: { label: "Acceptée", tone: "success" }, rejected: { label: "Refusée", tone: "danger" } }} />
              </p>
              {r.message ? <p className="text-muted-foreground">{r.message}</p> : null}
              <ul className="grid gap-1">
                {docs.map((d) => (
                  <li key={d.file_id}>
                    <a href={`/plateforme/ecosysteme/piece/${d.file_id}`} target="_blank" className="text-primary hover:underline">
                      {requirementLabel.get(d.requirement_id) ?? "Pièce"}
                    </a>
                  </li>
                ))}
              </ul>
              {r.review_note ? <p className="text-xs">Note : {r.review_note}</p> : null}
              {writable && r.status === "pending" ? (
                <div className="flex flex-wrap gap-2">
                  <InlineForm action={decideVerification} hidden={{ organization_id: r.organization_id, decision: "verified", reason: "" }} submit="Accorder le badge" className="flex" />
                  <ConfirmAction trigger={<Button size="sm" variant="secondary">Refuser</Button>} title="Refuser la vérification" confirmLabel="Refuser" tone="danger" action={decideVerification} fields={{ organization_id: r.organization_id, decision: "rejected" }} reason={{ label: "Motif (communiqué à l'établissement)", required: true }} />
                </div>
              ) : null}
              {writable && r.status === "approved" ? (
                <ConfirmAction trigger={<Button size="sm" variant="ghost" className="w-fit">Suspendre le badge</Button>} title="Suspendre le badge vérifié" confirmLabel="Suspendre" tone="danger" action={decideVerification} fields={{ organization_id: r.organization_id, decision: "suspended" }} reason={{ label: "Motif", required: true }} />
              ) : null}
            </div>
          );
        })}
      </section>

      <section className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Pièces demandées</h2>
          {writable ? (
            <QuickFormDialog
              title="Nouvelle pièce demandée"
              action={saveVerificationRequirement}
              triggerLabel="Ajouter une pièce"
              fields={[
                { name: "label", label: "Libellé", required: true, wide: true, placeholder: "ex. Autorisation d'ouverture du ministère" },
                { name: "description", label: "Précisions", type: "textarea", wide: true },
                { name: "country", label: "Pays", type: "select", options: countryOptions },
                { name: "org_type", label: "Type d'établissement", type: "select", options: [{ value: "", label: "Tous les types" }, ...typeOptions] },
                { name: "required", label: "Obligatoire", type: "checkbox", defaultValue: "true" },
                { name: "active", label: "Active", type: "checkbox", defaultValue: "true" },
              ]}
            />
          ) : null}
        </div>
        {(requirements ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Aucune pièce définie : les établissements ne peuvent pas encore demander la vérification.</p> : null}
        <ul className="grid gap-1 text-sm">
          {(requirements ?? []).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 border-b border-border py-1">
              <span className="font-medium">{r.label}</span>
              <span className="text-xs text-muted-foreground">
                {r.country ?? "tous pays"} · {r.org_type ? (ORG_TYPE_LABELS[r.org_type] ?? r.org_type) : "tous types"} · {r.required ? "obligatoire" : "facultative"} · {r.active ? "active" : "inactive"}
              </span>
              {writable ? (
                <QuickFormDialog
                  title="Modifier la pièce"
                  action={saveVerificationRequirement}
                  hidden={{ id: r.id }}
                  trigger={<Button size="sm" variant="ghost">Modifier</Button>}
                  fields={[
                    { name: "label", label: "Libellé", required: true, wide: true, defaultValue: r.label },
                    { name: "description", label: "Précisions", type: "textarea", wide: true, defaultValue: r.description ?? "" },
                    { name: "country", label: "Pays", type: "select", options: countryOptions, defaultValue: r.country ?? "" },
                    { name: "org_type", label: "Type d'établissement", type: "select", options: [{ value: "", label: "Tous les types" }, ...typeOptions], defaultValue: r.org_type ?? "" },
                    { name: "required", label: "Obligatoire", type: "checkbox", defaultValue: r.required ? "true" : "" },
                    { name: "active", label: "Active", type: "checkbox", defaultValue: r.active ? "true" : "" },
                  ]}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <p className="text-xs text-muted-foreground">
        Statuts possibles : {Object.values(VERIFICATION_STATUSES).map((s) => s.label).join(" · ")}.
      </p>
    </div>
  );
}

async function CategoriesTab({ writable }: { writable: boolean }) {
  const { data: categories } = await (await createClient()).from("opportunity_categories").select("*").order("sort_order");
  const fields = (c?: { key: string; label: string; kind: string; poster: string; description: string | null; sort_order: number; active: boolean }) => [
    { name: "key", label: "Code (minuscules)", required: true, defaultValue: c?.key ?? "", placeholder: "ex. teacher_job" },
    { name: "label", label: "Libellé", required: true, defaultValue: c?.label ?? "" },
    { name: "kind", label: "Type", type: "select" as const, options: toOptions(OPPORTUNITY_KINDS), defaultValue: c?.kind ?? "job" },
    { name: "poster", label: "Qui peut publier", type: "select" as const, options: [{ value: "organization", label: "Établissements" }, { value: "individual", label: "Particuliers" }, { value: "both", label: "Les deux" }], defaultValue: c?.poster ?? "both" },
    { name: "description", label: "Description", type: "textarea" as const, wide: true, defaultValue: c?.description ?? "" },
    { name: "sort_order", label: "Ordre", type: "number" as const, defaultValue: String(c?.sort_order ?? 100) },
    { name: "active", label: "Active", type: "checkbox" as const, defaultValue: c === undefined || c.active ? "true" : "" },
  ];
  return (
    <div className="grid gap-3" data-testid="categories-console">
      <div className="flex justify-end">{writable ? <QuickFormDialog title="Nouvelle catégorie" action={saveOpportunityCategory} triggerLabel="Ajouter une catégorie" fields={fields()} /> : null}</div>
      <ul className="grid gap-1 text-sm">
        {(categories ?? []).map((c) => (
          <li key={c.key} className="flex flex-wrap items-center gap-2 border-b border-border py-1">
            <span className="font-medium">{c.label}</span>
            <span className="text-xs text-muted-foreground">
              {OPPORTUNITY_KINDS[c.kind] ?? c.kind} · {c.poster === "organization" ? "établissements" : c.poster === "individual" ? "particuliers" : "tous"} · {c.active ? "active" : "inactive"}
            </span>
            {writable ? <QuickFormDialog title="Modifier la catégorie" action={saveOpportunityCategory} trigger={<Button size="sm" variant="ghost">Modifier</Button>} fields={fields(c)} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

async function VisibilityTab({ writable }: { writable: boolean }) {
  const supabase = await createClient();
  const [{ data: offers }, { data: orders }, { data: countries }] = await Promise.all([
    supabase.from("visibility_offers").select("*").order("created_at"),
    supabase.from("visibility_orders").select("id, number, amount, currency, status, created_at, target_type, payment_reference, organization_id, offer_id, organizations(name), visibility_offers(label)").order("created_at", { ascending: false }).limit(100),
    supabase.from("countries").select("code, name").order("name"),
  ]);
  const countryOptions = [{ value: "", label: "Tous les pays" }, ...(countries ?? []).map((c) => ({ value: c.code, label: c.name }))];
  type Offer = NonNullable<typeof offers>[number];
  const fields = (o?: Offer) => [
    { name: "code", label: "Code", required: true, defaultValue: o?.code ?? "", placeholder: "ex. UNE-30J" },
    { name: "label", label: "Libellé", required: true, defaultValue: o?.label ?? "" },
    { name: "kind", label: "Type", type: "select" as const, options: toOptions(OFFER_KINDS), defaultValue: o?.kind ?? "featured_profile" },
    { name: "price", label: "Prix", type: "number" as const, required: true, defaultValue: o ? String(o.price) : "" },
    { name: "currency", label: "Devise", defaultValue: o?.currency ?? "XOF" },
    { name: "duration_days", label: "Durée (jours)", type: "number" as const, defaultValue: o?.duration_days ? String(o.duration_days) : "" },
    { name: "country", label: "Pays", type: "select" as const, options: countryOptions, defaultValue: o?.country ?? "" },
    { name: "org_type", label: "Type d'établissement", type: "select" as const, options: [{ value: "", label: "Tous les types" }, ...typeOptions], defaultValue: o?.org_type ?? "" },
    { name: "description", label: "Description", type: "textarea" as const, wide: true, defaultValue: o?.description ?? "" },
    { name: "active", label: "Offre active (visible et commandable)", type: "checkbox" as const, defaultValue: o?.active ? "true" : "" },
  ];
  return (
    <div className="grid gap-6" data-testid="visibility-console">
      <section className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Offres de visibilité</h2>
            <p className="text-xs text-muted-foreground">Créées inactives : aucune n&apos;est proposée tant que vous ne l&apos;activez pas. Une mise en avant ne donne jamais le badge vérifié.</p>
          </div>
          {writable ? <QuickFormDialog title="Nouvelle offre de visibilité" action={saveVisibilityOffer} hidden={{ id: "" }} triggerLabel="Créer une offre" fields={fields()} /> : null}
        </div>
        {(offers ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Aucune offre.</p> : null}
        <ul className="grid gap-1 text-sm">
          {(offers ?? []).map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-2 border-b border-border py-1">
              <span className="font-medium">{o.label}</span>
              <span className="text-xs text-muted-foreground">
                {OFFER_KINDS[o.kind] ?? o.kind} · {money(o.price, o.currency)} {o.duration_days ? `· ${o.duration_days} j` : ""} · {o.country ?? "tous pays"}
              </span>
              <StatusBadge value={o.active ? "on" : "off"} map={{ on: { label: "Active", tone: "success" }, off: { label: "Inactive", tone: "neutral" } }} />
              {writable ? <QuickFormDialog title="Modifier l'offre" action={saveVisibilityOffer} hidden={{ id: o.id }} trigger={<Button size="sm" variant="ghost">Modifier</Button>} fields={fields(o)} /> : null}
            </li>
          ))}
        </ul>
      </section>
      <section className="grid gap-2">
        <h2 className="font-semibold">Commandes</h2>
        <p className="text-xs text-muted-foreground">Une commande n&apos;est confirmée qu&apos;avec la référence du paiement réellement reçu. Ces montants sont des frais de visibilité NeoScool, jamais un budget publicitaire.</p>
        {(orders ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Aucune commande.</p> : null}
        {(orders ?? []).map((o) => (
          <div key={o.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2 text-sm">
            <span className="font-mono text-xs">{o.number}</span>
            <span>{(o.organizations as unknown as { name: string } | null)?.name ?? "Particulier"}</span>
            <span className="text-muted-foreground">{(o.visibility_offers as unknown as { label: string } | null)?.label}</span>
            <span>{money(o.amount, o.currency)}</span>
            <StatusBadge value={o.status} map={ORDER_STATUSES} />
            {o.payment_reference ? <span className="text-xs text-muted-foreground">réf. {o.payment_reference}</span> : null}
            {writable && o.status === "awaiting_payment" ? (
              <>
                <QuickFormDialog title="Confirmer le paiement reçu" action={confirmVisibilityOrder} hidden={{ id: o.id, decision: "paid" }} submitLabel="Confirmer" trigger={<Button size="sm">Confirmer le paiement</Button>} fields={[{ name: "reference", label: "Référence du paiement reçu", required: true, wide: true }]} />
                <InlineForm action={confirmVisibilityOrder} hidden={{ id: o.id, decision: "refused", reference: "" }} submit="Refuser" variant="ghost" className="flex" />
              </>
            ) : null}
          </div>
        ))}
      </section>
    </div>
  );
}

async function AdsTab({ writable }: { writable: boolean }) {
  const supabase = await createClient();
  const [{ data: platforms }, { data: requests }] = await Promise.all([
    supabase.from("ad_platforms").select("*").order("provider"),
    supabase.from("ad_requests").select("*, organizations(name)").order("created_at", { ascending: false }).limit(100),
  ]);
  const next: Record<string, string[]> = {
    submitted: ["preparing", "awaiting_school", "refused"],
    preparing: ["awaiting_school", "refused"],
    awaiting_school: ["preparing", "refused"],
    validated: ["running", "completed"],
    running: ["completed"],
  };
  return (
    <div className="grid gap-6" data-testid="ads-console">
      <section className="grid gap-2">
        <h2 className="font-semibold">Plateformes publicitaires</h2>
        <p className="text-xs text-muted-foreground">Aucune connexion API n&apos;est active : NeoScool ne lance rien automatiquement et n&apos;affiche que des résultats saisis avec leur source.</p>
        {(platforms ?? []).map((p) => (
          <div key={p.provider} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-2 text-sm">
            <span className="min-w-28 font-medium">{p.label}</span>
            <StatusBadge value={p.enabled ? "on" : "off"} map={{ on: { label: "Autorisée", tone: "success" }, off: { label: "Non autorisée", tone: "neutral" } }} />
            <span className="text-xs text-muted-foreground">{p.api_connected ? "API connectée" : "API non connectée"}</span>
            {writable ? <InlineForm action={setAdPlatform} hidden={{ provider: p.provider, enabled: p.enabled ? "" : "on", note: p.note ?? "" }} submit={p.enabled ? "Retirer l'autorisation" : "Autoriser"} variant="secondary" className="ml-auto flex" /> : null}
          </div>
        ))}
      </section>
      <section className="grid gap-2">
        <h2 className="font-semibold">Demandes des établissements</h2>
        {(requests ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Aucune demande.</p> : null}
        {(requests ?? []).map((r) => (
          <div key={r.id} className="grid gap-2 rounded-xl border border-border bg-surface p-3 text-sm">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {(r.organizations as unknown as { name: string } | null)?.name} · {r.platform} · {r.objective} <StatusBadge value={r.status} map={AD_STATUSES} />
            </p>
            <p className="text-xs text-muted-foreground">
              {AD_MODES[r.mode] ?? r.mode} · budget prévu (payé à la plateforme) {money(r.budget_amount, r.budget_currency)} · {day(r.starts_on)} → {day(r.ends_on)} · {r.school_validated_at ? `plan validé le ${day(r.school_validated_at)}` : "plan non validé par l'établissement"}
            </p>
            {writable && next[r.status] ? (
              <QuickFormDialog
                title="Mettre à jour la demande"
                description="« En diffusion » n'est possible qu'après validation du plan par l'établissement. Les résultats exigent leur source."
                action={updateAdRequest}
                hidden={{ id: r.id }}
                trigger={<Button size="sm" variant="secondary" className="w-fit">Mettre à jour</Button>}
                fields={[
                  { name: "status", label: "Nouveau statut", type: "select", options: next[r.status]!.map((s) => ({ value: s, label: AD_STATUSES[s]?.label ?? s })) },
                  { name: "note", label: "Message à l'établissement (plan, budget, calendrier…)", type: "textarea", wide: true },
                  { name: "impressions", label: "Affichages", type: "number" },
                  { name: "clicks", label: "Clics", type: "number" },
                  { name: "leads", label: "Contacts", type: "number" },
                  { name: "spend", label: "Dépense réelle", type: "number" },
                  { name: "source", label: "Source des résultats", wide: true, placeholder: "ex. rapport Meta Ads du 12/10" },
                ]}
              />
            ) : null}
          </div>
        ))}
      </section>
    </div>
  );
}

async function SettingsTab({ writable }: { writable: boolean }) {
  const { data: s } = await (await createClient()).from("ecosystem_settings").select("*").eq("id", 1).maybeSingle();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Validation avant publication</CardTitle>
        <CardDescription>Contenus vérifiés par l&apos;équipe NeoScool avant d&apos;être visibles du public.</CardDescription>
      </CardHeader>
      <CardContent>
        <InlineForm action={saveEcosystemSettings} submit={writable ? "Enregistrer" : undefined} testId="ecosystem-settings">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="profiles" defaultChecked={s?.profiles_require_review ?? false} disabled={!writable} /> Fiches publiques des établissements
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="campaigns" defaultChecked={s?.campaigns_require_review ?? true} disabled={!writable} /> Campagnes de promotion
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="opportunities" defaultChecked={s?.opportunities_require_review ?? true} disabled={!writable} /> Annonces Opportunities (emplois, répétiteurs, services)
          </label>
        </InlineForm>
      </CardContent>
    </Card>
  );
}
