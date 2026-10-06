import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { InlineForm } from "@/features/ecosystem/components/inline-form";
import { AD_MODES, AD_STATUSES } from "@/features/ecosystem/constants";
import { moduleClosed } from "@/features/ecosystem/module-closed";
import { adRequestAction, saveAdRequest } from "@/features/ecosystem/school-actions";
import { requirePermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Publicité externe" };
export const dynamic = "force-dynamic";

const money = (n: number | null, c: string | null) => (n ? `${new Intl.NumberFormat("fr-FR").format(n)} ${c === "XOF" ? "F CFA" : (c ?? "")}` : "—");

/**
 * Publicité externe (Facebook, Instagram, TikTok, Google…) : demandes et suivi.
 * Rien n'est lancé automatiquement : aucune connexion aux régies n'est simulée ;
 * une campagne accompagnée démarre seulement après validation du plan par l'établissement.
 */
export default async function ExternalAdsPage() {
  const context = await requirePermission("communication.send");
  const closed = moduleClosed(context.organization, "external_ads");
  const supabase = await createClient();
  const [{ data: platforms }, { data: requests }, { data: campaigns }] = await Promise.all([
    supabase.from("ad_platforms").select("provider, label, enabled, api_connected, note").order("provider"),
    supabase.from("ad_requests").select("*").eq("organization_id", context.organization.id).order("created_at", { ascending: false }),
    supabase.from("promo_campaigns").select("id, title").eq("organization_id", context.organization.id).in("status", ["published", "draft", "pending_review"]),
  ]);
  const allowed = (platforms ?? []).filter((p) => p.enabled);
  const label = new Map((platforms ?? []).map((p) => [p.provider, p.label]));

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Publicité externe"
        description="Préparez une campagne sur les réseaux sociaux ou les moteurs de recherche, seul ou avec l'accompagnement de NeoScool."
      />
      {closed ?? (
        <>
          <Card>
            <CardContent className="grid gap-2 pt-5 text-sm">
              <p>
                <strong>Trois montants distincts</strong> : votre abonnement NeoScool, les éventuels frais d&apos;accompagnement NeoScool, et le budget publicitaire que vous payez directement à la plateforme (Meta, TikTok, Google…). NeoScool n&apos;encaisse jamais ce budget.
              </p>
              <p className="text-muted-foreground">
                Aucune campagne n&apos;est lancée automatiquement.{" "}
                {(platforms ?? []).some((p) => p.api_connected) ? "" : "NeoScool n'est connecté à aucune régie publicitaire : les résultats affichés sont ceux que vous ou NeoScool saisissez à partir des rapports de la plateforme, avec leur source."}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Nouvelle demande</CardTitle>
              <CardDescription>{allowed.length ? "Plateformes autorisées par NeoScool : " + allowed.map((p) => p.label).join(", ") + "." : "Aucune plateforme publicitaire n'est encore autorisée par NeoScool."}</CardDescription>
            </CardHeader>
            {allowed.length ? (
              <CardContent>
                <InlineForm action={saveAdRequest} className="grid gap-3 sm:grid-cols-2" testId="ad-request-form">
                  <label className="grid gap-1 text-sm">
                    Mode
                    <Select name="mode" defaultValue="assisted">
                      {Object.entries(AD_MODES).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    Plateforme
                    <Select name="platform" required>
                      {allowed.map((p) => (
                        <option key={p.provider} value={p.provider}>
                          {p.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    Campagne NeoScool liée (facultatif)
                    <Select name="campaign_id" defaultValue="">
                      <option value="">—</option>
                      {(campaigns ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    Objectif *
                    <Input name="objective" required maxLength={300} placeholder="ex. 50 demandes d'information pour la rentrée" />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Pays (codes)
                    <Input name="countries" placeholder="CI" />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Villes
                    <Input name="cities" placeholder="Abidjan" />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Début
                    <Input type="date" name="starts_on" />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Fin
                    <Input type="date" name="ends_on" />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Budget publicitaire prévu ({context.organization.currency}) — payé à la plateforme
                    <Input name="budget_amount" inputMode="numeric" />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Audience
                    <Input name="audience" maxLength={300} placeholder="ex. parents 30-50 ans" />
                  </label>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    <button type="submit" name="submit" value="true" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                      Envoyer à NeoScool
                    </button>
                    <button type="submit" name="submit" value="" className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">
                      Brouillon
                    </button>
                  </div>
                </InlineForm>
              </CardContent>
            ) : null}
          </Card>

          <section className="grid gap-3" data-testid="ad-requests">
            <h2 className="text-lg font-semibold">Mes demandes</h2>
            {(requests ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Aucune demande.</p> : null}
            {(requests ?? []).map((r) => {
              const results = (r.results ?? null) as Record<string, number> | null;
              return (
                <Card key={r.id}>
                  <CardContent className="grid gap-3 pt-5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {label.get(r.platform) ?? r.platform} · {r.objective}
                      </span>
                      <StatusBadge value={r.status} map={AD_STATUSES} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {AD_MODES[r.mode] ?? r.mode} · budget prévu {money(r.budget_amount, r.budget_currency)}
                      {r.starts_on ? ` · du ${new Date(r.starts_on).toLocaleDateString("fr-FR")}` : ""}
                      {r.ends_on ? ` au ${new Date(r.ends_on).toLocaleDateString("fr-FR")}` : ""}
                    </p>
                    {r.platform_note ? <p className="rounded-lg bg-surface-muted p-2">NeoScool : {r.platform_note}</p> : null}
                    {results ? (
                      <p className="text-xs">
                        Résultats : {results.impressions ?? 0} affichages · {results.clicks ?? 0} clics · {results.leads ?? 0} contacts · dépense {money(results.spend ?? 0, r.budget_currency)}
                        {r.results_source ? ` — source : ${r.results_source}` : ""}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {r.status === "awaiting_school" ? <InlineForm action={adRequestAction} hidden={{ id: r.id, action: "validate" }} submit="Valider le plan" className="flex" /> : null}
                      {!["running", "completed", "cancelled", "refused"].includes(r.status) ? <InlineForm action={adRequestAction} hidden={{ id: r.id, action: "cancel" }} submit="Annuler" variant="ghost" className="flex" /> : null}
                    </div>
                    {r.mode === "self" && ["validated", "running", "completed", "submitted"].includes(r.status) ? (
                      <details>
                        <summary className="cursor-pointer text-xs font-semibold">Saisir les résultats (depuis le rapport de la plateforme)</summary>
                        <InlineForm action={adRequestAction} hidden={{ id: r.id, action: "results" }} submit="Enregistrer les résultats" className="mt-2 grid gap-2 sm:grid-cols-4">
                          <Input name="impressions" inputMode="numeric" placeholder="Affichages" aria-label="Affichages" />
                          <Input name="clicks" inputMode="numeric" placeholder="Clics" aria-label="Clics" />
                          <Input name="leads" inputMode="numeric" placeholder="Contacts" aria-label="Contacts" />
                          <Input name="spend" inputMode="numeric" placeholder="Dépense" aria-label="Dépense" />
                          <Input name="source" required className="sm:col-span-4" placeholder="Source (ex. rapport Meta Ads du 12/10)" aria-label="Source des résultats" />
                        </InlineForm>
                      </details>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
