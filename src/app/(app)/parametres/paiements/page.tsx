import { ArrowRight, BookText, CircleAlert, CreditCard, Globe2, Plus, Receipt, RefreshCcw, Scale, ShieldCheck, Webhook } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { saveFeePaymentSettings } from "@/features/fee-payments/actions";
import { FeeForm } from "@/features/fee-payments/components/fee-form";
import { getFeeAdminState } from "@/features/fee-payments/queries";
import { listSchoolAdapters } from "@/features/fee-payments/server";
import { requirePermission } from "@/lib/auth/guards";
import { GLOBAL_OFF_MESSAGE, methodLabel } from "@/lib/payments/school-adapters";
import { formatDateTime } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Paiements en ligne" };

/** Paramètres › Paiements : activation, fournisseurs (sans limite), moyens, devises, suivi. */
export default async function FeePaymentSettingsPage() {
  const context = await requirePermission("finance.online.manage");
  const org = context.organization;
  const [{ globalEnabled, settings, providers }, adapters] = await Promise.all([getFeeAdminState(org.id), listSchoolAdapters()]);
  const adapterName = (code: string) => adapters.find((a) => a.code === code)?.name ?? code;
  const live = providers.filter((p) => !p.archived_at);
  const archived = providers.filter((p) => p.archived_at);
  const active = live.filter((p) => p.is_active);
  const methods = Array.from(new Set(active.flatMap((p) => p.methods)));
  const currencies = Array.from(new Set(active.map((p) => p.currency)));
  const open = globalEnabled && settings.online_enabled && active.length > 0;

  const providerItem = (p: (typeof providers)[number]) => (
    <li key={p.id}>
      <Link href={`/parametres/paiements/fournisseurs/${p.id}`} className="grid gap-2 rounded-2xl border border-border p-4 transition-colors hover:border-primary/50 hover:bg-primary-soft/20 sm:grid-cols-[1fr_auto] sm:items-center">
        <span className="grid gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{p.label}</span>
            {p.archived_at ? <Badge tone="neutral">Archivé</Badge> : <Badge tone={p.is_active ? "success" : "neutral"}>{p.is_active ? "ACTIF" : "INACTIF"}</Badge>}
            <Badge tone={p.mode === "live" ? "primary" : "warning"}>{p.mode === "live" ? "PRODUCTION" : "TEST"}</Badge>
            {p.is_default ? <Badge tone="info">Par défaut</Badge> : null}
          </span>
          <span className="text-xs text-muted-foreground">
            {adapterName(p.adapter)} · {p.currency}
            {p.country ? ` · ${p.country}` : ""} · {p.methods.map(methodLabel).join(", ")} · priorité {p.priority}
          </span>
          <span className="text-xs text-muted-foreground">
            {p.adapter === "mock" ? "Aucune clé (fournisseur de test)" : p.secret_hint ? `Clés enregistrées (${p.secret_hint})` : "Clés à renseigner"}
            {p.last_test_at ? ` · dernier test ${p.last_test_ok ? "réussi" : "en échec"} le ${formatDateTime(p.last_test_at, "fr-FR", org.timezone)}` : " · jamais testé"}
          </span>
        </span>
        <span className="text-sm font-semibold text-primary">Configurer →</span>
      </Link>
    </li>
  );

  return (
    <div className="mx-auto grid w-full max-w-5xl min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Paiements en ligne"
        description="Les familles paient les frais depuis leur portail ; chaque paiement confirmé par le fournisseur est enregistré automatiquement en comptabilité, avec reçu et notifications."
        actions={
          <Link href="/finances/paiements-en-ligne" className={buttonVariants({ variant: "secondary" })}>
            Suivi des paiements <ArrowRight aria-hidden />
          </Link>
        }
      />

      {!globalEnabled ? (
        <Alert tone="warning" title={GLOBAL_OFF_MESSAGE} data-testid="fee-global-off">
          Vos réglages et fournisseurs sont conservés : ils seront de nouveau utilisés dès la réactivation par NeoScool.
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3" aria-label="État">
        <Card className="grid gap-1 p-4">
          <span className="text-xs font-medium text-muted-foreground">Plateforme NeoScool</span>
          <Badge tone={globalEnabled ? "success" : "danger"} className="justify-self-start">{globalEnabled ? "Autorisé" : "Désactivé"}</Badge>
        </Card>
        <Card className="grid gap-1 p-4">
          <span className="text-xs font-medium text-muted-foreground">Votre établissement</span>
          <Badge tone={settings.online_enabled ? "success" : "neutral"} className="justify-self-start">{settings.online_enabled ? "Activé" : "Désactivé"}</Badge>
        </Card>
        <Card className="grid gap-1 p-4">
          <span className="text-xs font-medium text-muted-foreground">Côté familles</span>
          <Badge tone={open ? "success" : "warning"} className="justify-self-start" data-testid="fee-open-state">
            {open ? `Bouton « Payer maintenant » visible (${active.length} fournisseur${active.length > 1 ? "s" : ""})` : "Paiement en ligne indisponible"}
          </Badge>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Activation et 2. options de paiement</CardTitle>
        </CardHeader>
        <CardContent>
          <FeeForm action={saveFeePaymentSettings} className="grid gap-4" testId="fee-settings-form">
            <label className="flex items-start gap-3 rounded-xl border border-border p-3">
              <input type="checkbox" name="online_enabled" defaultChecked={settings.online_enabled} className="mt-0.5 size-5 accent-[var(--primary)]" />
              <span className="grid">
                <span className="font-semibold">Activer le paiement en ligne pour les familles</span>
                <span className="text-xs text-muted-foreground">Désactiver ne supprime rien : fournisseurs, transactions et reçus sont conservés.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-border p-3">
              <input type="checkbox" name="allow_partial" defaultChecked={settings.allow_partial} className="mt-0.5 size-5 accent-[var(--primary)]" />
              <span className="grid">
                <span className="font-semibold">Autoriser un montant libre (acompte)</span>
                <span className="text-xs text-muted-foreground">Sinon, la famille paie une échéance ou le solde complet.</span>
              </span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="fee-min" label={`Montant minimum d'un acompte (${org.currency})`}>
                <Input id="fee-min" name="min_partial" type="number" min={0} step={1} defaultValue={Number(settings.min_partial_amount)} />
              </FormField>
              <FormField id="fee-pending" label="Délai pour finaliser un paiement (minutes)" hint="Au-delà, la demande expire ; une confirmation tardive du fournisseur reste acceptée.">
                <Input id="fee-pending" name="pending_minutes" type="number" min={10} max={1440} defaultValue={settings.pending_minutes} />
              </FormField>
            </div>
            <div className="flex justify-end">
              <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
            </div>
          </FeeForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>3. Fournisseurs de paiement</CardTitle>
          <Link href="/parametres/paiements/fournisseurs/nouveau" className={buttonVariants()} data-testid="fee-add-provider">
            <Plus aria-hidden /> AJOUTER UN FOURNISSEUR
          </Link>
        </CardHeader>
        <CardContent className="grid gap-3">
          {live.length === 0 && archived.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun fournisseur. Ajoutez-en autant que nécessaire (Mobile Money, carte, banque…) ; les familles choisiront parmi les fournisseurs actifs.</p>
          ) : (
            <>
              <ul className="grid gap-3" data-testid="fee-provider-list">
                {live.map(providerItem)}
              </ul>
              {archived.length ? (
                <details className="rounded-2xl border border-dashed border-border p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">Fournisseurs archivés ({archived.length}) — historique conservé</summary>
                  <ul className="mt-3 grid gap-3">{archived.map(providerItem)}</ul>
                </details>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="grid gap-2 p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <CreditCard className="size-4 text-primary" aria-hidden /> 4. Moyens de paiement proposés
          </h2>
          <p className="text-sm text-muted-foreground">{methods.length ? methods.map(methodLabel).join(" · ") : "Aucun pour le moment (aucun fournisseur actif)."}</p>
        </Card>
        <Card className="grid gap-2 p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Globe2 className="size-4 text-primary" aria-hidden /> 5. Devises
          </h2>
          <p className="text-sm text-muted-foreground">
            Devise de l&apos;établissement : <strong>{org.currency}</strong>. Acceptées en ligne : {currencies.length ? currencies.join(", ") : "—"}.
            {currencies.length && !currencies.includes(org.currency) ? (
              <span className="mt-1 flex items-center gap-1 text-warning">
                <CircleAlert className="size-4" aria-hidden /> Aucun fournisseur actif n&apos;accepte la devise de vos factures.
              </span>
            ) : null}
          </p>
        </Card>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Suivi">
        {(
          [
            [Webhook, "6. Notifications des fournisseurs", "Adresse propre à chaque fournisseur (fiche du fournisseur) ; chaque notification est journalisée puis revérifiée.", "/finances/paiements-en-ligne?onglet=notifications"],
            [Receipt, "7. Transactions", "Toutes les transactions, filtres et totaux.", "/finances/paiements-en-ligne"],
            [RefreshCcw, "8. Remboursements", "Demandes, validations, remboursements automatiques ou manuels.", "/finances/paiements-en-ligne?onglet=remboursements"],
            [Scale, "9. Rapprochement", "Montants différents, confirmations tardives, paiements à vérifier.", "/finances/paiements-en-ligne?onglet=a-traiter"],
            [BookText, "10. Journal", "Historique complet : créations, confirmations, tests, changements de fournisseur.", "/finances/paiements-en-ligne?onglet=journal"],
            [ShieldCheck, "Sécurité", "Clés chiffrées, confirmation uniquement par le serveur, contrôles d'établissement, de montant, de devise et de doublon en base.", "/audit"],
          ] as const
        ).map(([Icon, title, text, href]) => (
          <Link key={title} href={href} className="grid gap-1.5 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-primary/50">
            <span className="flex items-center gap-2 font-semibold">
              <Icon className="size-4 text-primary" aria-hidden /> {title}
            </span>
            <span className="text-xs text-muted-foreground">{text}</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
