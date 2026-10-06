import { HandCoins, Link2, Megaphone, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { applyAffiliate, disputeCommission, updateAffiliatePayout } from "@/features/affiliates/actions";
import { AFFILIATE_KINDS, AFFILIATE_STATUS, ATTRIBUTION_SOURCES, COMMISSION_STATUS, PAYOUT_METHODS, rewardText } from "@/features/affiliates/constants";
import { InlineForm } from "@/features/ecosystem/components/inline-form";
import { CopyLinkButton } from "@/features/organization/components/portal-link-share";
import { publicBaseUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Programme d'affiliation — NeoScool" };
export const dynamic = "force-dynamic";

type Space = {
  affiliate: { id: string; status: keyof typeof AFFILIATE_STATUS; code: string; kind: string; phone: string | null; payout_method: string | null; payout_details: string | null; review_note: string | null; campaign: { name: string; ends_on: string | null } | null };
  clicks: number;
  referrals: { organization: string; created_at: string; source: string; status: string; subscription: string | null }[];
  commissions: { id: string; organization: string; amount: number; currency: string; payment_amount: number; status: keyof typeof COMMISSION_STATUS; reason: string | null; disputed: boolean; created_at: string; mode: string }[];
  payouts: { amount: number; currency: string; method: string; reference: string; paid_on: string }[];
  totals: { estimated: number; validated: number; payable: number; paid: number };
};
const money = (v: number, c = "XOF") => `${v.toLocaleString("fr-FR")} ${c === "XOF" ? "FCFA" : c}`;
const day = (d: string) => new Date(d).toLocaleDateString("fr-FR");
const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));

/** Espace affilié : demande d'adhésion, lien et code, écoles recommandées, commissions et versements. */
export default async function AffiliateSpacePage() {
  const supabase = await createClient();
  const [{ data: settings }, { data: raw }, { data: countries }, base] = await Promise.all([
    supabase.from("affiliate_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.rpc("my_affiliate_space"),
    supabase.from("countries").select("code, name").eq("is_active", true).order("name"),
    publicBaseUrl(),
  ]);
  const space = raw as unknown as Space | null;
  if (!settings) return null;
  const reward = rewardText(settings, settings.currency === "XOF" ? "FCFA" : settings.currency);

  if (!space) {
    return (
      <div className="grid gap-5" data-testid="affiliate-join">
        <div className="grid gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Megaphone className="size-6 text-primary" aria-hidden /> Programme d&apos;affiliation NeoScool
          </h1>
          <p className="text-sm text-muted-foreground">Recommandez NeoScool à des établissements et recevez une récompense quand ils s&apos;abonnent.</p>
        </div>
        {!settings.enabled || !settings.signups_open ? (
          <p className="rounded-xl bg-surface-muted p-4 text-sm" data-testid="affiliate-closed">
            Le programme n&apos;accepte pas de nouvelles demandes pour le moment.
          </p>
        ) : (
          <>
            <Card className="grid gap-2 p-4 text-sm">
              <p>
                <strong>Récompense actuelle :</strong> {reward}, une fois le paiement de l&apos;établissement confirmé
                {settings.hold_days ? ` et après un délai de vérification de ${settings.hold_days} jours` : ""}.
              </p>
              <p className="text-muted-foreground">
                Une simple visite ou une inscription en essai gratuit ne donne pas droit à une récompense. Un établissement déjà client ne compte pas. Vous ne pouvez pas recommander votre propre établissement.
              </p>
              {settings.terms ? <p className="whitespace-pre-line rounded-lg bg-surface-muted p-3 text-xs">{settings.terms}</p> : null}
            </Card>
            <InlineForm action={applyAffiliate} submit="Envoyer ma demande" className="grid gap-3 sm:grid-cols-2" testId="affiliate-apply">
              <label className="grid gap-1 text-sm">
                Vous êtes
                <select name="kind" required className="h-10 rounded-lg border border-border px-2">
                  {settings.allowed_kinds.map((k) => (
                    <option key={k} value={k}>
                      {AFFILIATE_KINDS[k] ?? k}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Téléphone{settings.require_phone ? " *" : ""}
                <input name="phone" type="tel" maxLength={25} required={settings.require_phone} className="h-10 rounded-lg border border-border px-2" />
              </label>
              <label className="grid gap-1 text-sm">
                Pays
                <select name="country" className="h-10 rounded-lg border border-border px-2">
                  <option value="">—</option>
                  {(countries ?? []).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Ville
                <input name="city" maxLength={80} className="h-10 rounded-lg border border-border px-2" />
              </label>
              <label className="grid gap-1 text-sm">
                Recevoir mes commissions par{settings.require_payout_details ? " *" : ""}
                <select name="payout_method" required={settings.require_payout_details} className="h-10 rounded-lg border border-border px-2">
                  <option value="">—</option>
                  {Object.entries(PAYOUT_METHODS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Numéro Mobile Money ou coordonnées bancaires{settings.require_payout_details ? " *" : ""}
                <input name="payout_details" maxLength={300} required={settings.require_payout_details} className="h-10 rounded-lg border border-border px-2" />
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                Comment comptez-vous présenter NeoScool ? (facultatif)
                <Textarea name="motivation" rows={3} maxLength={1000} />
              </label>
              <label className="flex items-start gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="accept_terms" required className="mt-0.5 size-4" /> J&apos;accepte les conditions du programme d&apos;affiliation.
              </label>
            </InlineForm>
          </>
        )}
        <Link href="/espace" className="text-sm text-primary hover:underline">
          ← Mon espace
        </Link>
      </div>
    );
  }

  const a = space.affiliate;
  const link = `${base}/r/${a.code}`;
  const approved = a.status === "approved";
  return (
    <div className="grid gap-5" data-testid="affiliate-space">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Megaphone className="size-6 text-primary" aria-hidden /> Mon affiliation
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StatusBadge value={a.status} map={AFFILIATE_STATUS} /> {AFFILIATE_KINDS[a.kind] ?? a.kind}
            {a.campaign ? <span>· Campagne : {a.campaign.name}</span> : null}
          </p>
        </div>
        <Link href="/espace" className="text-sm text-primary hover:underline">
          ← Mon espace
        </Link>
      </div>
      {!settings.enabled ? (
        <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">Le programme est suspendu : aucune nouvelle recommandation n&apos;est enregistrée. Vos commissions validées restent dues.</p>
      ) : null}
      {a.status === "pending" ? <p className="rounded-xl bg-surface-muted p-3 text-sm">Votre demande est en cours d&apos;examen par l&apos;équipe NeoScool.</p> : null}
      {a.status !== "approved" && a.review_note ? <p className="rounded-xl bg-surface-muted p-3 text-sm">Message de l&apos;équipe : {a.review_note}</p> : null}

      {approved ? (
        <Card className="grid gap-3 p-4" data-testid="affiliate-link">
          <p className="flex items-center gap-2 font-semibold">
            <Link2 className="size-4 text-primary" aria-hidden /> Votre lien et votre code
          </p>
          {settings.links_enabled ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-lg bg-surface-muted px-2 py-1 text-sm break-all">{link}</code>
              <CopyLinkButton text={link} size="sm" label="Copier le lien" />
            </div>
          ) : null}
          {settings.codes_enabled ? (
            <p className="text-sm">
              Code à saisir à l&apos;inscription : <strong data-testid="affiliate-code">{a.code}</strong>
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Récompense : {reward}. Une école est attribuée à son inscription (lien suivi pendant {settings.attribution_days} jours, ou code saisi) ; la commission est calculée sur ses paiements réellement confirmés.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="grid gap-1 p-4">
          <span className="text-xs text-muted-foreground">Clics sur votre lien</span>
          <span className="text-2xl font-bold">{space.clicks.toLocaleString("fr-FR")}</span>
          <span className="text-xs text-muted-foreground">{space.referrals.length} établissement(s) recommandé(s)</span>
        </Card>
        <Card className="grid gap-1 p-4">
          <span className="text-xs text-muted-foreground">Commissions estimées</span>
          <span className="text-2xl font-bold" data-testid="affiliate-estimated">{money(space.totals.estimated)}</span>
          <span className="text-xs text-muted-foreground">en attente de vérification</span>
        </Card>
        <Card className="grid gap-1 p-4">
          <span className="text-xs text-muted-foreground">Commissions validées</span>
          <span className="text-2xl font-bold">{money(space.totals.validated)}</span>
          <span className="text-xs text-muted-foreground">dont {money(space.totals.payable)} payable(s)</span>
        </Card>
        <Card className="grid gap-1 p-4">
          <span className="text-xs text-muted-foreground">Versements reçus</span>
          <span className="text-2xl font-bold" data-testid="affiliate-paid">{money(space.totals.paid)}</span>
          <span className="text-xs text-muted-foreground">versements enregistrés avec leur référence</span>
        </Card>
      </div>

      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">Établissements recommandés</h2>
        {space.referrals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun établissement pour le moment.</p>
        ) : (
          <ul className="grid gap-2" data-testid="affiliate-referrals">
            {space.referrals.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
                <span className="font-medium">{r.organization}</span>
                <span className="text-xs text-muted-foreground">
                  {day(r.created_at)} · {ATTRIBUTION_SOURCES[r.source] ?? r.source} · {r.status === "rejected" ? "non retenu" : r.subscription === "ACTIVE" ? "abonné" : r.subscription === "TRIALING" ? "en essai" : (r.subscription ?? "—").toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <HandCoins className="size-5" aria-hidden /> Commissions
        </h2>
        {space.commissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune commission : elles apparaissent quand un établissement recommandé paie son abonnement.</p>
        ) : (
          <ul className="grid gap-2" data-testid="affiliate-commissions">
            {space.commissions.map((c) => (
              <li key={c.id} className="grid gap-1 rounded-xl border border-border p-3 text-sm">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {c.organization} · {money(c.amount, c.currency)}
                    {c.mode === "test" ? <span className="ml-1 text-xs text-warning">(paiement de test)</span> : null}
                  </span>
                  <StatusBadge value={c.status} map={COMMISSION_STATUS} />
                </span>
                <span className="text-xs text-muted-foreground">
                  Paiement de {money(c.payment_amount, c.currency)} du {day(c.created_at)}
                  {c.reason ? ` · ${c.reason}` : ""}
                  {c.disputed ? " · contestation envoyée" : ""}
                </span>
                {c.status !== "paid" && !c.disputed ? (
                  <QuickFormDialog
                    title="Contester cette commission"
                    action={disputeCommission}
                    hidden={{ id: c.id }}
                    trigger={
                      <Button size="sm" variant="ghost" className="w-fit">
                        Contester
                      </Button>
                    }
                    fields={[{ name: "message", label: "Votre explication", type: "textarea", required: true, wide: true }]}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Wallet className="size-5" aria-hidden /> Versements
        </h2>
        {space.payouts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun versement. Les commissions payables sont versées par l&apos;équipe NeoScool à partir de {money(settings.min_payout)} ; chaque versement porte sa référence (Mobile Money, virement).
          </p>
        ) : (
          <ul className="grid gap-2" data-testid="affiliate-payouts">
            {space.payouts.map((p, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 rounded-xl border border-border p-3 text-sm">
                <span className="font-medium">{money(p.amount, p.currency)}</span>
                <span className="text-xs text-muted-foreground">
                  {day(p.paid_on)} · {PAYOUT_METHODS[p.method] ?? p.method} · réf. {p.reference}
                </span>
              </li>
            ))}
          </ul>
        )}
        <QuickFormDialog
          title="Coordonnées de versement"
          action={updateAffiliatePayout}
          trigger={
            <Button size="sm" variant="secondary" className="w-fit">
              Modifier mes coordonnées de versement
            </Button>
          }
          fields={[
            { name: "payout_method", label: "Moyen", type: "select", options: opts(PAYOUT_METHODS), defaultValue: a.payout_method ?? "mobile_money", required: true },
            { name: "payout_details", label: "Numéro Mobile Money ou coordonnées bancaires", required: true, wide: true, defaultValue: a.payout_details ?? "" },
            { name: "phone", label: "Téléphone", defaultValue: a.phone ?? "" },
          ]}
        />
      </section>
    </div>
  );
}
