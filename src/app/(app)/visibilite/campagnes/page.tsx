import { Download, ExternalLink, Megaphone, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { InlineForm } from "@/features/ecosystem/components/inline-form";
import { KitPngButton } from "@/features/ecosystem/components/kit-download";
import { CAMPAIGN_OBJECTIVES, CAMPAIGN_STATUSES } from "@/features/ecosystem/constants";
import { KIT_FORMATS } from "@/features/ecosystem/media-kit";
import { moduleClosed } from "@/features/ecosystem/module-closed";
import { endCampaign, saveCampaign } from "@/features/ecosystem/school-actions";
import { requirePermission } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/features";
import { publicBaseUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Campagnes" };
export const dynamic = "force-dynamic";

type Campaign = {
  id: string;
  title: string;
  description: string | null;
  objective: string;
  target: string | null;
  media: string[];
  countries: string[];
  cities: string[];
  audience: string | null;
  starts_on: string | null;
  ends_on: string | null;
  budget_amount: number | null;
  destination_url: string | null;
  contact: string | null;
  status: string;
  moderation_note: string | null;
};

/** NeoScool Promotion : campagnes publiées sur la fiche publique, lien et QR code de suivi, Media Kit. */
export default async function CampaignsPage({ searchParams }: PageProps<"/visibilite/campagnes">) {
  const context = await requirePermission("communication.send");
  const closed = moduleClosed(context.organization, "promotion");
  const sp = await searchParams;
  const selected = param(sp, "campagne");
  const creating = param(sp, "nouvelle") === "1";
  const supabase = await createClient();
  const [{ data: campaigns }, { data: images }, { data: profile }, base] = await Promise.all([
    supabase.from("promo_campaigns").select("*").eq("organization_id", context.organization.id).order("created_at", { ascending: false }),
    supabase.from("file_objects").select("id, file_name").eq("organization_id", context.organization.id).eq("category", "public").order("created_at", { ascending: false }).limit(60),
    supabase.from("org_public_profiles").select("slug, published, review_status").eq("organization_id", context.organization.id).maybeSingle(),
    publicBaseUrl(),
  ]);
  const list = (campaigns ?? []) as unknown as Campaign[];
  const current = isUuid(selected) ? list.find((c) => c.id === selected) : undefined;
  const kit = featureEnabled(context.organization, "media_kit");
  const editing = current ?? (creating ? null : undefined);

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Campagnes"
        description="Annoncez vos inscriptions, formations et événements sur votre fiche publique. Chaque demande reçue garde la trace de la campagne d'origine."
        actions={
          closed ? null : (
            <Button asChild size="sm">
              <Link href="/visibilite/campagnes?nouvelle=1">
                <Plus aria-hidden /> Nouvelle campagne
              </Link>
            </Button>
          )
        }
      />
      {closed ?? (
        <>
          {!profile?.published ? (
            <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
              Votre fiche publique n&apos;est pas encore publiée : une campagne n&apos;est visible qu&apos;avec une fiche publiée.{" "}
              <Link href="/visibilite" className="font-semibold underline">
                Compléter la fiche
              </Link>
            </p>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="grid content-start gap-2">
              {list.length === 0 ? (
                <EmptyState icon={Megaphone} title="Aucune campagne" description="Créez votre première campagne : portes ouvertes, inscriptions, nouvelle formation…" />
              ) : (
                <ul className="grid gap-2" data-testid="campaigns-list">
                  {list.map((c) => (
                    <li key={c.id}>
                      <Link href={`/visibilite/campagnes?campagne=${c.id}`} scroll={false} className={`grid gap-1 rounded-xl border bg-surface p-3 hover:shadow ${current?.id === c.id ? "border-primary" : "border-border"}`}>
                        <span className="flex items-center justify-between gap-2 font-medium">
                          {c.title} <StatusBadge value={c.status} map={CAMPAIGN_STATUSES} />
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {CAMPAIGN_OBJECTIVES[c.objective] ?? c.objective}
                          {c.ends_on ? ` · jusqu'au ${new Date(c.ends_on).toLocaleDateString("fr-FR")}` : ""}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {editing !== undefined ? (
              <div className="grid content-start gap-4">
                {current ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Partager</CardTitle>
                      <CardDescription>Lien suivi : chaque demande venue de ce lien est rattachée à la campagne.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 text-sm">
                      {current.moderation_note ? <p className="text-danger">Motif NeoScool : {current.moderation_note}</p> : null}
                      {profile && current.status === "published" ? (
                        <>
                          <code className="break-all rounded bg-surface-muted p-2 text-xs">{`${base}/decouvrir/${profile.slug}/campagnes/${current.id}?source=link`}</code>
                          <Link href={`/decouvrir/${profile.slug}/campagnes/${current.id}`} target="_blank" className="inline-flex w-fit items-center gap-1 font-semibold text-primary hover:underline">
                            Voir la page publique <ExternalLink className="size-3.5" aria-hidden />
                          </Link>
                        </>
                      ) : (
                        <p className="text-muted-foreground">Le lien sera actif une fois la campagne publiée.</p>
                      )}
                      {kit ? (
                        <div className="grid gap-2" data-testid="media-kit">
                          <p className="font-semibold">Media Kit</p>
                          <p className="text-xs text-muted-foreground">Visuels prêts à publier, avec QR code vers la campagne. Ils reprennent uniquement vos textes et vos images.</p>
                          <ul className="grid gap-1">
                            {Object.entries(KIT_FORMATS).map(([key, f]) => (
                              <li key={key} className="flex flex-wrap items-center gap-3">
                                <span className="min-w-56">{f.label}</span>
                                <a href={`/visibilite/campagnes/${current.id}/kit?format=${key}&telecharger`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                                  <Download className="size-3.5" aria-hidden /> SVG
                                </a>
                                <KitPngButton href={`/visibilite/campagnes/${current.id}/kit?format=${key}`} width={f.width} height={f.height} name={`campagne-${key}`} />
                                <a href={`/visibilite/campagnes/${current.id}/kit?format=${key}`} target="_blank" className="text-xs text-muted-foreground hover:underline">
                                  Aperçu
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {current.status === "published" || current.status === "pending_review" ? (
                        <ConfirmAction
                          trigger={<Button variant="secondary" size="sm" className="w-fit">Terminer la campagne</Button>}
                          title="Terminer la campagne ?"
                          description="Elle disparaît de votre fiche publique. Les demandes reçues sont conservées."
                          confirmLabel="Terminer"
                          action={endCampaign}
                          fields={{ id: current.id }}
                        />
                      ) : null}
                    </CardContent>
                  </Card>
                ) : null}
                <Card>
                  <CardHeader>
                    <CardTitle>{current ? "Modifier la campagne" : "Nouvelle campagne"}</CardTitle>
                    <CardDescription>Le budget indiqué est votre budget de diffusion prévu ; il n&apos;est pas payé à NeoScool.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <InlineForm action={saveCampaign} hidden={current ? { id: current.id } : {}} className="grid gap-3" redirectTo={current ? undefined : "/visibilite/campagnes"} testId="campaign-form">
                      <label className="grid gap-1 text-sm">
                        Titre *
                        <Input name="title" defaultValue={current?.title ?? ""} required maxLength={140} />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm">
                          Objectif
                          <Select name="objective" defaultValue={current?.objective ?? "information"}>
                            {Object.entries(CAMPAIGN_OBJECTIVES).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <label className="grid gap-1 text-sm">
                          Public visé
                          <Input name="target" defaultValue={current?.target ?? ""} maxLength={200} placeholder="ex. bacheliers, parents d'élèves du primaire" />
                        </label>
                      </div>
                      <label className="grid gap-1 text-sm">
                        Message
                        <Textarea name="description" defaultValue={current?.description ?? ""} rows={4} maxLength={3000} />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm">
                          Début
                          <Input type="date" name="starts_on" defaultValue={current?.starts_on ?? ""} />
                        </label>
                        <label className="grid gap-1 text-sm">
                          Fin
                          <Input type="date" name="ends_on" defaultValue={current?.ends_on ?? ""} />
                        </label>
                        <label className="grid gap-1 text-sm">
                          Pays ciblés (codes, séparés par des virgules)
                          <Input name="countries" defaultValue={(current?.countries ?? []).join(", ")} placeholder="CI, SN" />
                        </label>
                        <label className="grid gap-1 text-sm">
                          Villes ciblées
                          <Input name="cities" defaultValue={(current?.cities ?? []).join(", ")} placeholder="Abidjan, Bouaké" />
                        </label>
                        <label className="grid gap-1 text-sm">
                          Lien « En savoir plus » (https://…)
                          <Input name="destination_url" defaultValue={current?.destination_url ?? ""} maxLength={300} />
                        </label>
                        <label className="grid gap-1 text-sm">
                          Contact affiché (téléphone ou e-mail de l&apos;établissement)
                          <Input name="contact" defaultValue={current?.contact ?? ""} maxLength={160} />
                        </label>
                        <label className="grid gap-1 text-sm">
                          Budget de diffusion prévu ({context.organization.currency})
                          <Input name="budget_amount" inputMode="numeric" defaultValue={current?.budget_amount ? String(current.budget_amount) : ""} />
                        </label>
                        <label className="grid gap-1 text-sm">
                          Audience
                          <Input name="audience" defaultValue={current?.audience ?? ""} maxLength={300} />
                        </label>
                      </div>
                      {(images ?? []).length ? (
                        <fieldset className="grid gap-2">
                          <legend className="text-sm">Images (bibliothèque de la fiche publique, 6 au plus)</legend>
                          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {(images ?? []).map((img) => (
                              <label key={img.id} className="grid gap-1 text-xs">
                                {/* eslint-disable-next-line @next/next/no-img-element -- image de la bibliothèque */}
                                <img src={`/api/fichiers/${img.id}`} alt="" className="aspect-[4/3] w-full rounded object-cover" />
                                <span className="flex items-center gap-1">
                                  <input type="checkbox" name="media" value={img.id} defaultChecked={current?.media.includes(img.id)} /> Utiliser
                                </span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Ajoutez des photos dans{" "}
                          <Link href="/visibilite?onglet=images" className="underline">
                            la bibliothèque d&apos;images
                          </Link>{" "}
                          pour illustrer la campagne.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" name="submit" value="true" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                          Publier
                        </button>
                        <button type="submit" name="submit" value="" className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">
                          Enregistrer le brouillon
                        </button>
                      </div>
                    </InlineForm>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sélectionnez une campagne ou créez-en une.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
