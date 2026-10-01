import { Archive, PlugZap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { PageHeader } from "@/components/shared/page-header";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { archiveFeeProvider, setFeeProviderState, testFeeProvider } from "@/features/fee-payments/actions";
import { FeeForm } from "@/features/fee-payments/components/fee-form";
import { ProviderForm } from "@/features/fee-payments/components/provider-form";
import { getFeeProvider, listProviderEvents } from "@/features/fee-payments/queries";
import { feeWebhookUrl, listSchoolAdapters } from "@/features/fee-payments/server";
import { requirePermission } from "@/lib/auth/guards";
import { publicBaseUrl } from "@/lib/site-url";
import { formatDateTime } from "@/lib/utils/format";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Fournisseur de paiement" };

export default async function FeeProviderPage({ params }: PageProps<"/parametres/paiements/fournisseurs/[id]">) {
  const context = await requirePermission("finance.online.manage");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const org = context.organization;
  const [provider, adapters, events, base] = await Promise.all([getFeeProvider(org.id, id), listSchoolAdapters(), listProviderEvents(org.id, id), publicBaseUrl()]);
  if (!provider) notFound();
  const adapter = adapters.find((a) => a.code === provider.adapter);
  const archived = Boolean(provider.archived_at);

  return (
    <div className="mx-auto grid w-full max-w-3xl min-w-0 gap-6 [&>*]:min-w-0">
      <Link href="/parametres/paiements" className="text-sm font-semibold text-primary hover:underline">
        ← Paramètres des paiements
      </Link>
      <PageHeader title={provider.label} description={`${adapter?.name ?? provider.adapter} · ${provider.currency}${provider.country ? ` · ${provider.country}` : ""}`} />
      <div className="flex flex-wrap gap-2" data-testid="fee-provider-badges">
        {archived ? <Badge tone="neutral">Archivé</Badge> : <Badge tone={provider.is_active ? "success" : "neutral"}>{provider.is_active ? "ACTIF" : "INACTIF"}</Badge>}
        <Badge tone={provider.mode === "live" ? "primary" : "warning"}>{provider.mode === "live" ? "PRODUCTION" : "TEST"}</Badge>
        {provider.is_default ? <Badge tone="info">Par défaut</Badge> : null}
      </div>
      {!adapter ? <Alert tone="warning">Ce type de fournisseur n&apos;est plus disponible sur ce serveur : il ne peut pas être activé (historique conservé).</Alert> : null}

      {!archived ? (
        <Card>
          <CardHeader>
            <CardTitle>Connexion et activation</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <FeeForm action={testFeeProvider} className="grid gap-2" testId="fee-provider-test">
              <input type="hidden" name="id" value={provider.id} />
              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton variant="secondary" pendingLabel="Test en cours…">
                  <PlugZap aria-hidden /> TESTER LA CONNEXION
                </SubmitButton>
                {provider.last_test_at ? (
                  <span className={`text-sm ${provider.last_test_ok ? "text-success" : "text-danger"}`} data-testid="fee-provider-last-test">
                    {provider.last_test_ok ? "Réussi" : "Échec"} le {formatDateTime(provider.last_test_at, "fr-FR", org.timezone)} — {provider.last_test_message}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">Jamais testé.</span>
                )}
              </div>
            </FeeForm>
            <FeeForm action={setFeeProviderState} className="grid gap-3 rounded-2xl border border-border p-4" testId="fee-provider-state">
              <input type="hidden" name="id" value={provider.id} />
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" name="is_active" defaultChecked={provider.is_active} className="size-5 accent-[var(--primary)]" /> ACTIF (proposé aux familles)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="is_default" defaultChecked={provider.is_default} className="size-4 accent-[var(--primary)]" /> Fournisseur par défaut
                </label>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <FormField id="fee-priority" label="Priorité (ordre d'affichage, 0 = en premier)">
                  <Input id="fee-priority" name="priority" type="number" min={0} max={9999} defaultValue={provider.priority} className="w-32" />
                </FormField>
                <SubmitButton pendingLabel="Enregistrement…">Appliquer</SubmitButton>
              </div>
            </FeeForm>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Adresses à déclarer chez le fournisseur</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <FormField id="fee-webhook" label="Webhook URL (notification de paiement)" hint="Propre à ce fournisseur : chaque notification reçue est journalisée puis revérifiée auprès du fournisseur.">
            <Input id="fee-webhook" readOnly value={feeWebhookUrl(base, provider.webhook_token)} className="font-mono text-xs" data-testid="fee-webhook-url" />
          </FormField>
          <FormField id="fee-callback" label="Callback URL (retour de la famille après paiement)" hint="Le retour du navigateur n'est jamais une preuve : il relance seulement la vérification serveur.">
            <Input id="fee-callback" readOnly value={`${base.replace(/\/+$/, "")}/portail/finances/retour`} className="font-mono text-xs" />
          </FormField>
        </CardContent>
      </Card>

      {!archived && adapter ? (
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <ProviderForm
              adapters={adapters}
              defaultCurrency={org.currency}
              initial={{
                id: provider.id,
                adapter: provider.adapter,
                label: provider.label,
                country: provider.country,
                currency: provider.currency,
                methods: provider.methods,
                mode: provider.mode,
                config: (provider.config ?? {}) as Record<string, string>,
                custom_definition: provider.custom_definition,
                secret_hint: provider.secret_hint,
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Historique du fournisseur</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun événement.</p>
          ) : (
            <ol className="grid gap-2 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap justify-between gap-2 border-b border-border pb-2 last:border-0">
                  <span>{e.summary}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(e.created_at, "fr-FR", org.timezone)}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {!archived ? (
        <div className="flex justify-end">
          <ConfirmAction
            trigger={
              <Button variant="ghost">
                <Archive aria-hidden /> Archiver ce fournisseur
              </Button>
            }
            title="Archiver ce fournisseur ?"
            description="Il ne sera plus proposé aux familles. Ses transactions, reçus et son historique sont conservés ; les paiements déjà commencés restent vérifiables."
            confirmLabel="Archiver"
            tone="danger"
            action={archiveFeeProvider}
            fields={{ id: provider.id }}
          />
        </div>
      ) : null}
    </div>
  );
}
