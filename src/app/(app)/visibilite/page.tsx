import { BadgeCheck, ExternalLink, Eye, ImagePlus, Inbox, Sparkles, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { TabNav } from "@/components/shared/tab-nav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InlineForm } from "@/features/ecosystem/components/inline-form";
import { LEAD_SOURCES, OFFER_KINDS, ORDER_STATUSES, VERIFICATION_STATUSES } from "@/features/ecosystem/constants";
import { moduleClosed } from "@/features/ecosystem/module-closed";
import { cancelVisibilityOrder, orderVisibility, savePublicProfile, submitVerification, uploadPublicMedia } from "@/features/ecosystem/school-actions";
import { requirePermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Fiche publique" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "fiche", label: "Fiche" },
  { key: "images", label: "Images" },
  { key: "verification", label: "Vérification" },
  { key: "statistiques", label: "Statistiques" },
  { key: "mise-en-avant", label: "Mise en avant" },
] as const;

const SOCIALS = [
  ["facebook", "Facebook"],
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
  ["whatsapp", "WhatsApp (numéro)"],
  ["linkedin", "LinkedIn"],
  ["youtube", "YouTube"],
] as const;

const money = (n: number, c: string) => `${new Intl.NumberFormat("fr-FR").format(n)} ${c === "XOF" ? "F CFA" : c}`;

type Stats = { profile_views_30d: number; visitors_30d: number; leads_30d: number; leads_by_source: Record<string, number>; converted: number; campaigns: { id: string; title: string; views: number; leads: number }[] };

/** NeoScool Discover côté établissement : fiche publique, images, vérification, statistiques, mise en avant payante. */
export default async function VisibilityPage({ searchParams }: PageProps<"/visibilite">) {
  const context = await requirePermission("settings.manage");
  const closed = moduleClosed(context.organization, "discover");
  const requested = param(await searchParams, "onglet");
  const tab = (TABS.find((t) => t.key === requested)?.key ?? "fiche") as (typeof TABS)[number]["key"];
  const org = context.organization;
  const supabase = await createClient();
  const [{ data: profile }, { data: images }, { data: orgRow }] = await Promise.all([
    supabase.from("org_public_profiles").select("*").eq("organization_id", org.id).maybeSingle(),
    supabase.from("file_objects").select("id, file_name, created_at").eq("organization_id", org.id).eq("category", "public").order("created_at", { ascending: false }).limit(60),
    supabase.from("organizations").select("country").eq("id", org.id).single(),
  ]);
  const p = profile;
  const socials = (p?.socials ?? {}) as Record<string, string>;
  const en = ((p?.translations ?? {}) as { en?: Record<string, string> }).en ?? {};
  const programs = ((p?.programs ?? []) as { name: string; description?: string | null }[]).map((x) => (x.description ? `${x.name} — ${x.description}` : x.name)).join("\n");
  const gallery = new Set(p?.gallery ?? []);

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Fiche publique"
        description="Votre établissement dans l'annuaire NeoScool Discover. Les informations sont rédigées par vous ; rien n'est publié sans votre action."
        actions={
          p?.published && p.review_status === "approved" ? (
            <Link href={`/decouvrir/${p.slug}`} target="_blank" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              Voir la fiche publique <ExternalLink className="size-4" aria-hidden />
            </Link>
          ) : null
        }
      />
      {closed ?? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="profile-status">
            {p ? (
              <>
                <StatusBadge
                  value={!p.published ? "draft" : p.moderation !== "ok" ? "hidden" : p.review_status}
                  map={{ draft: { label: "Non publiée", tone: "neutral" }, pending: { label: "En attente de validation NeoScool", tone: "warning" }, approved: { label: "Publiée", tone: "success" }, rejected: { label: "Refusée", tone: "danger" }, hidden: { label: "Masquée par NeoScool", tone: "danger" } }}
                />
                <StatusBadge value={p.verification_status} map={VERIFICATION_STATUSES} />
                {p.featured_until && new Date(p.featured_until) > new Date() ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                    <Sparkles className="size-3" aria-hidden /> À la une jusqu&apos;au {new Date(p.featured_until).toLocaleDateString("fr-FR")}
                  </span>
                ) : null}
                {p.moderation_note ? <span className="text-danger">Motif : {p.moderation_note}</span> : null}
              </>
            ) : (
              <span className="text-muted-foreground">Aucune fiche pour le moment : remplissez le formulaire ci-dessous.</span>
            )}
          </div>
          <TabNav label="Fiche publique" active={tab} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/visibilite?onglet=${t.key}` }))} />

          {tab === "fiche" ? (
            <InlineForm action={savePublicProfile} className="grid gap-5" testId="profile-form">
              <Card>
                <CardHeader>
                  <CardTitle>Présentation</CardTitle>
                  <CardDescription>Adresse de la fiche : neoscool…/decouvrir/<strong>{p?.slug ?? "votre-etablissement"}</strong></CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Adresse de la fiche (lettres, chiffres, tirets)
                    <Input name="slug" defaultValue={p?.slug ?? ""} maxLength={80} placeholder="laisser vide pour la créer à partir du nom" />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Phrase d&apos;accroche
                    <Input name="tagline" defaultValue={p?.tagline ?? ""} maxLength={160} />
                  </label>
                  <label className="grid gap-1 text-sm sm:col-span-2">
                    Présentation (30 caractères minimum pour publier)
                    <Textarea name="description" defaultValue={p?.description ?? ""} rows={6} maxLength={5000} />
                  </label>
                  <label className="grid gap-1 text-sm sm:col-span-2">
                    Formations / filières — une par ligne, « Nom — description » (description facultative)
                    <Textarea name="programs" defaultValue={programs} rows={5} />
                  </label>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Coordonnées publiques</CardTitle>
                  <CardDescription>Uniquement les coordonnées officielles de l&apos;établissement, jamais celles d&apos;une personne sans son accord.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["address", "Adresse", p?.address],
                      ["city", "Ville", p?.city],
                      ["phone", "Téléphone de l'établissement", p?.phone],
                      ["email", "E-mail de l'établissement", p?.email],
                      ["website", "Site web (https://…)", p?.website],
                      ["enrollment_url", "Lien de pré-inscription (https://…)", p?.enrollment_url],
                    ] as const
                  ).map(([name, label, value]) => (
                    <label key={name} className="grid gap-1 text-sm">
                      {label}
                      <Input name={name} defaultValue={value ?? ""} maxLength={300} />
                    </label>
                  ))}
                  {SOCIALS.map(([key, label]) => (
                    <label key={key} className="grid gap-1 text-sm">
                      {label}
                      <Input name={`social_${key}`} defaultValue={socials[key] ?? ""} maxLength={300} />
                    </label>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Admission</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm sm:col-span-2">
                    Conditions d&apos;admission
                    <Textarea name="admission" defaultValue={p?.admission ?? ""} rows={3} maxLength={3000} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Période d&apos;inscription
                    <Input name="enrollment_period" defaultValue={p?.enrollment_period ?? ""} maxLength={160} placeholder="ex. de juillet à septembre" />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Rentrée
                    <Input name="start_date" defaultValue={p?.start_date ?? ""} maxLength={160} placeholder="ex. 1er octobre" />
                  </label>
                  <label className="grid gap-1 text-sm sm:col-span-2">
                    Informations complémentaires
                    <Textarea name="extra" defaultValue={p?.extra ?? ""} rows={2} maxLength={2000} />
                  </label>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Version anglaise (facultatif)</CardTitle>
                  <CardDescription>Affichée aux visiteurs qui choisissent « EN » sur la fiche.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Input name="tagline_en" defaultValue={en.tagline ?? ""} maxLength={160} aria-label="Accroche en anglais" placeholder="Tagline" />
                  <Textarea name="description_en" defaultValue={en.description ?? ""} rows={4} maxLength={5000} aria-label="Présentation en anglais" placeholder="Description" />
                  <Textarea name="admission_en" defaultValue={en.admission ?? ""} rows={2} maxLength={3000} aria-label="Admission en anglais" placeholder="Admission" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Images de la fiche</CardTitle>
                  <CardDescription>Choisissez parmi les photos de votre bibliothèque (onglet « Images »). Utilisez de vraies photos de l&apos;établissement.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {(images ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune image : ajoutez-en dans l&apos;onglet « Images ».</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {(images ?? []).map((img) => (
                        <div key={img.id} className="grid gap-1 rounded-lg border border-border p-2 text-xs">
                          {/* eslint-disable-next-line @next/next/no-img-element -- image de la bibliothèque */}
                          <img src={`/api/fichiers/${img.id}`} alt="" className="aspect-[4/3] w-full rounded object-cover" />
                          <label className="flex items-center gap-1">
                            <input type="radio" name="cover_file_id" value={img.id} defaultChecked={p?.cover_file_id === img.id} /> Couverture
                          </label>
                          <label className="flex items-center gap-1">
                            <input type="checkbox" name="gallery" value={img.id} defaultChecked={gallery.has(img.id)} /> Galerie
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" name="publish" defaultChecked={p?.published ?? false} /> Publier la fiche dans NeoScool Discover
                </label>
                <button type="submit" className="ml-auto rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                  Enregistrer
                </button>
              </div>
            </InlineForm>
          ) : null}

          {tab === "images" ? (
            <Card>
              <CardHeader>
                <CardTitle>Bibliothèque d&apos;images</CardTitle>
                <CardDescription>Photos réelles de l&apos;établissement (JPEG ou PNG, 5 Mo). Une image n&apos;est visible du public que si vous l&apos;utilisez dans une fiche ou une campagne publiée.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <InlineForm action={uploadPublicMedia} submit="Ajouter l'image" reset className="flex flex-wrap items-center gap-3" testId="media-upload">
                  <ImagePlus className="size-5 text-muted-foreground" aria-hidden />
                  <input type="file" name="file" accept="image/jpeg,image/png" required className="text-sm" />
                </InlineForm>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(images ?? []).map((img) => (
                    // eslint-disable-next-line @next/next/no-img-element -- image de la bibliothèque
                    <img key={img.id} src={`/api/fichiers/${img.id}`} alt={img.file_name} className="aspect-[4/3] w-full rounded-lg border border-border object-cover" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {tab === "verification" ? <VerificationTab orgId={org.id} orgType={org.type} country={orgRow?.country ?? null} status={p?.verification_status ?? "unverified"} /> : null}
          {tab === "statistiques" ? <StatsTab orgId={org.id} /> : null}
          {tab === "mise-en-avant" ? <PromotionTab orgId={org.id} orgType={org.type} country={orgRow?.country ?? null} hasProfile={Boolean(p)} /> : null}
        </>
      )}
    </div>
  );
}

async function VerificationTab({ orgId, orgType, country, status }: { orgId: string; orgType: string; country: string | null; status: string }) {
  const supabase = await createClient();
  const [{ data: requirements }, { data: requests }] = await Promise.all([
    supabase.from("verification_requirements").select("id, label, description, required, country, org_type").eq("active", true).order("created_at"),
    supabase.from("org_verification_requests").select("id, status, review_note, created_at, documents").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(5),
  ]);
  const applicable = (requirements ?? []).filter((r) => (!r.country || r.country === country) && (!r.org_type || r.org_type === orgType));
  const pending = (requests ?? []).some((r) => r.status === "pending");
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BadgeCheck className="size-5 text-primary" aria-hidden /> Badge « Profil vérifié »
          </CardTitle>
          <CardDescription>Accordé par NeoScool après contrôle de vos documents officiels. Il ne s&apos;achète pas : une mise en avant payante ne donne jamais ce badge.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <StatusBadge value={status} map={VERIFICATION_STATUSES} />
          {pending ? (
            <p className="text-sm text-muted-foreground">Votre demande est en cours d&apos;examen.</p>
          ) : applicable.length === 0 ? (
            <p className="text-sm text-muted-foreground">NeoScool n&apos;a pas encore défini les pièces à fournir pour votre pays et votre type d&apos;établissement. Revenez bientôt.</p>
          ) : (
            <InlineForm action={submitVerification} submit="Envoyer la demande" testId="verification-form">
              {applicable.map((r) => (
                <label key={r.id} className="grid gap-1 text-sm">
                  {r.label} {r.required ? "*" : "(facultatif)"}
                  {r.description ? <span className="text-xs text-muted-foreground">{r.description}</span> : null}
                  <input type="file" name={`doc_${r.id}`} accept="application/pdf,image/jpeg,image/png" required={r.required} className="text-sm" />
                </label>
              ))}
              <label className="grid gap-1 text-sm">
                Message (facultatif)
                <Textarea name="message" rows={2} maxLength={2000} />
              </label>
              <p className="text-xs text-muted-foreground">Les pièces sont visibles uniquement par l&apos;équipe NeoScool chargée de la vérification.</p>
            </InlineForm>
          )}
        </CardContent>
      </Card>
      {(requests ?? []).length ? (
        <Card>
          <CardHeader>
            <CardTitle>Historique des demandes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {(requests ?? []).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  {new Date(r.created_at).toLocaleDateString("fr-FR")} ·{" "}
                  <StatusBadge value={r.status} map={{ pending: { label: "En attente", tone: "warning" }, approved: { label: "Acceptée", tone: "success" }, rejected: { label: "Refusée", tone: "danger" } }} />
                  {r.review_note ? <span className="text-muted-foreground">{r.review_note}</span> : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

async function StatsTab({ orgId }: { orgId: string }) {
  const { data } = await (await createClient()).rpc("org_visibility_stats", { p_org: orgId });
  const s = (data ?? { profile_views_30d: 0, visitors_30d: 0, leads_30d: 0, leads_by_source: {}, converted: 0, campaigns: [] }) as unknown as Stats;
  const tiles = [
    { label: "Vues de la fiche (30 j)", value: s.profile_views_30d, icon: Eye },
    { label: "Visiteurs (30 j)", value: s.visitors_30d, icon: Users },
    { label: "Demandes reçues (30 j)", value: s.leads_30d, icon: Inbox },
    { label: "Demandes devenues inscriptions", value: s.converted, icon: BadgeCheck },
  ];
  return (
    <div className="grid gap-4" data-testid="visibility-stats">
      <div className="grid gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="grid gap-1 p-4">
            <t.icon className="size-5 text-primary" aria-hidden />
            <span className="text-2xl font-bold">{t.value}</span>
            <span className="text-xs text-muted-foreground">{t.label}</span>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Origine des demandes</CardTitle>
          <CardDescription>Mesures réelles de NeoScool (fiche, campagnes, liens partagés). Aucun chiffre n&apos;est estimé.</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(s.leads_by_source).length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune demande pour le moment.</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {Object.entries(s.leads_by_source).map(([k, n]) => (
                <li key={k} className="flex justify-between border-b border-border py-1">
                  <span>{LEAD_SOURCES[k] ?? k}</span>
                  <span className="font-semibold">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {s.campaigns.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Campagnes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {s.campaigns.map((c) => (
                <li key={c.id} className="flex justify-between border-b border-border py-1">
                  <span>{c.title}</span>
                  <span>
                    {c.views} vue(s) · {c.leads} demande(s)
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

async function PromotionTab({ orgId, orgType, country, hasProfile }: { orgId: string; orgType: string; country: string | null; hasProfile: boolean }) {
  const supabase = await createClient();
  const [{ data: offers }, { data: orders }] = await Promise.all([
    supabase.from("visibility_offers").select("id, label, kind, description, price, currency, duration_days, country, org_type").eq("active", true).eq("kind", "featured_profile").order("price"),
    supabase.from("visibility_orders").select("id, number, amount, currency, status, created_at, offer_id, target_type").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(20),
  ]);
  const applicable = (offers ?? []).filter((o) => (!o.country || o.country === country) && (!o.org_type || o.org_type === orgType));
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-amber-500" aria-hidden /> Mettre la fiche « À la une »
          </CardTitle>
          <CardDescription>Option payante distincte de votre abonnement NeoScool. Elle améliore la position dans l&apos;annuaire, elle ne donne jamais le badge « Profil vérifié ».</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {!hasProfile ? (
            <p className="text-sm text-muted-foreground">Créez d&apos;abord votre fiche.</p>
          ) : applicable.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="no-offers">
              Aucune offre de mise en avant n&apos;est proposée pour le moment.
            </p>
          ) : (
            applicable.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="grid">
                  <span className="font-medium">{o.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {OFFER_KINDS[o.kind] ?? o.kind}
                    {o.duration_days ? ` · ${o.duration_days} jours` : ""} {o.description ? `· ${o.description}` : ""}
                  </span>
                </div>
                <InlineForm action={orderVisibility} hidden={{ offer_id: o.id, target_type: "profile", target_id: orgId }} submit={`Commander — ${money(o.price, o.currency)}`} className="flex" />
              </div>
            ))
          )}
          <p className="text-xs text-muted-foreground">Après la commande, réglez le montant selon les instructions de NeoScool : la mise en avant démarre seulement quand le paiement est confirmé.</p>
        </CardContent>
      </Card>
      {(orders ?? []).length ? (
        <Card>
          <CardHeader>
            <CardTitle>Mes commandes de visibilité</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {(orders ?? []).map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{o.number}</span> · {money(o.amount, o.currency)} · <StatusBadge value={o.status} map={ORDER_STATUSES} />
                  {o.status === "awaiting_payment" ? <InlineForm action={cancelVisibilityOrder} hidden={{ id: o.id }} submit="Annuler" variant="ghost" className="flex" /> : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
