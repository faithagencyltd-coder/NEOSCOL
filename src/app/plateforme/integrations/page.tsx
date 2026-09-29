import { History, MessageCircle, Plus, Send } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { IntegrationCard, type IntegrationView } from "@/features/platform/components/integration-card";
import { saveMessagingDefaults, saveOrganizationQuota, saveWhatsappTemplate } from "@/features/platform/integration-actions";
import { encryptionKeyFrom } from "@/lib/messaging/crypto";
import { PROVIDERS } from "@/lib/messaging/providers";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Intégrations — Plateforme" };

const STATUS: Record<string, { label: string; tone: "success" | "danger" | "warning" | "neutral" }> = {
  sent: { label: "Envoyé", tone: "success" },
  failed: { label: "Échec", tone: "danger" },
  blocked_quota: { label: "Quota atteint", tone: "warning" },
  not_configured: { label: "Non configuré", tone: "neutral" },
};
const CHANNEL: Record<string, string> = { email: "E-mail", sms: "SMS", whatsapp: "WhatsApp" };
const nf = new Intl.NumberFormat("fr-FR");

/**
 * Intégrations de la plateforme (Super Admin) : configurées une fois ici, elles
 * servent à tous les établissements, dans la limite de leur quota mensuel.
 */
export default async function PlatformIntegrationsPage() {
  const supabase = await createClient();
  const [{ data: rows }, { data: settings }, { data: usage }, { data: templates }, { data: deliveries }] = await Promise.all([
    supabase.from("platform_integrations").select("provider, enabled, config, secret_hint, last_test_at, last_test_ok, last_test_message"),
    supabase.from("messaging_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.rpc("platform_messaging_usage"),
    supabase.from("whatsapp_templates").select("id, name, language, description, variables_count, enabled").order("name"),
    supabase
      .from("message_deliveries")
      .select("id, channel, provider, recipient_masked, purpose, status, error, created_at, organization:organizations(name)")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);
  const encryptionReady = encryptionKeyFrom(process.env) !== null;
  const dedicatedKey = Boolean(process.env.INTEGRATIONS_ENCRYPTION_KEY);

  const integrations: IntegrationView[] = PROVIDERS.map((p) => {
    const row = rows?.find((r) => r.provider === p.code);
    return {
      code: p.code,
      label: p.label,
      channel: p.channel,
      description: p.description,
      docs: p.docs,
      fields: p.fields.map(({ key, label, hint, required, placeholder }) => ({ key, label, hint, required, placeholder })),
      secret: p.secret,
      enabled: row?.enabled ?? false,
      config: (row?.config ?? {}) as Record<string, string>,
      secretHint: row?.secret_hint ?? null,
      lastTest: row?.last_test_at ? { at: row.last_test_at, ok: Boolean(row.last_test_ok), message: row.last_test_message } : null,
    };
  });

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="grid gap-1">
        <h2 className="text-2xl font-bold">Intégrations</h2>
        <p className="text-sm text-muted-foreground">
          E-mail, SMS, WhatsApp et anti-robot : configurés une seule fois ici, utilisés par tous les établissements. Sans intégration active, aucun message n&apos;est envoyé
          et l&apos;application continue de fonctionner normalement.
        </p>
      </div>

      {!encryptionReady ? (
        <Alert tone="danger" title="Chiffrement indisponible">
          La clé de service Supabase est absente du serveur : impossible d&apos;enregistrer des clés d&apos;intégration.
        </Alert>
      ) : !dedicatedKey ? (
        <Alert tone="info">
          Les clés sont chiffrées (AES-256-GCM) avec une clé dérivée de la clé de service du serveur. Recommandé en production : définir INTEGRATIONS_ENCRYPTION_KEY
          (32 octets en base64) avant d&apos;enregistrer les clés.
        </Alert>
      ) : null}

      <section className="stagger grid gap-4 xl:grid-cols-2" aria-label="Fournisseurs">
        {integrations.map((integration) => (
          <IntegrationCard key={integration.code} integration={integration} />
        ))}
      </section>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>Quotas mensuels par établissement</CardTitle>
            <CardDescription>
              Par défaut : {nf.format(settings?.default_email_limit ?? 0)} e-mails, {nf.format(settings?.default_sms_limit ?? 0)} SMS, {nf.format(settings?.default_whatsapp_limit ?? 0)}{" "}
              WhatsApp par mois. Au-delà, l&apos;envoi est refusé et journalisé.
            </CardDescription>
          </div>
          <QuickFormDialog
            title="Quotas par défaut"
            description="Nombre de messages envoyés par mois et par établissement."
            triggerLabel="Modifier les quotas par défaut"
            action={saveMessagingDefaults}
            fields={[
              { name: "email", label: "E-mails / mois", type: "number", required: true, min: 0, defaultValue: String(settings?.default_email_limit ?? 2000) },
              { name: "sms", label: "SMS / mois", type: "number", required: true, min: 0, defaultValue: String(settings?.default_sms_limit ?? 200) },
              { name: "whatsapp", label: "WhatsApp / mois", type: "number", required: true, min: 0, defaultValue: String(settings?.default_whatsapp_limit ?? 500) },
            ]}
          />
        </CardHeader>
        {!usage?.length ? (
          <CardContent>
            <EmptyState icon={Send} title="Aucun établissement" />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr className="border-t border-border">
                <TH>Établissement</TH>
                <TH className="text-right">E-mails</TH>
                <TH className="text-right">SMS</TH>
                <TH className="text-right">WhatsApp</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {usage.map((u) => (
                <TR key={u.organization_id}>
                  <TD>
                    <span className="grid">
                      <span className="font-semibold">{u.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {u.code}
                        {u.custom ? " · quota personnalisé" : ""}
                      </span>
                    </span>
                  </TD>
                  <TD className="text-right tabular-nums">
                    {nf.format(u.email_used)} / {nf.format(u.email_limit)}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {nf.format(u.sms_used)} / {nf.format(u.sms_limit)}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {nf.format(u.whatsapp_used)} / {nf.format(u.whatsapp_limit)}
                  </TD>
                  <TD>
                    <span className="flex justify-end">
                      <QuickFormDialog
                        title={`Quota — ${u.name}`}
                        description="Laisser un champ vide pour appliquer la valeur par défaut de la plateforme."
                        trigger={
                          <Button size="sm" variant="secondary">
                            Quota
                          </Button>
                        }
                        action={saveOrganizationQuota}
                        hidden={{ organization_id: u.organization_id }}
                        fields={[
                          { name: "email", label: "E-mails / mois", type: "number", min: 0, defaultValue: u.email_override == null ? "" : String(u.email_override) },
                          { name: "sms", label: "SMS / mois", type: "number", min: 0, defaultValue: u.sms_override == null ? "" : String(u.sms_override) },
                          { name: "whatsapp", label: "WhatsApp / mois", type: "number", min: 0, defaultValue: u.whatsapp_override == null ? "" : String(u.whatsapp_override) },
                        ]}
                      />
                    </span>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>Modèles WhatsApp</CardTitle>
            <CardDescription>
              L&apos;API officielle n&apos;envoie que des modèles approuvés par Meta. Enregistrez ici chaque modèle approuvé (même nom, même langue, même nombre de variables).
            </CardDescription>
          </div>
          <QuickFormDialog
            title="Modèle WhatsApp approuvé"
            trigger={
              <Button>
                <Plus aria-hidden /> Ajouter un modèle
              </Button>
            }
            action={saveWhatsappTemplate}
            fields={[
              { name: "name", label: "Nom du modèle (chez Meta)", required: true, placeholder: "rappel_paiement" },
              { name: "language", label: "Langue", required: true, defaultValue: "fr", placeholder: "fr" },
              { name: "variables", label: "Nombre de variables {{1}}, {{2}}…", type: "number", min: 0, max: 20, defaultValue: "0" },
              { name: "description", label: "Usage", type: "textarea", wide: true, placeholder: "Rappel d'échéance envoyé aux parents" },
            ]}
          />
        </CardHeader>
        {!templates?.length ? (
          <CardContent>
            <EmptyState icon={MessageCircle} title="Aucun modèle" description="Le test d'intégration utilise « hello_world », fourni par Meta sur tout compte." />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr className="border-t border-border">
                <TH>Modèle</TH>
                <TH>Langue</TH>
                <TH className="text-right">Variables</TH>
                <TH>Usage</TH>
              </tr>
            </THead>
            <tbody>
              {templates.map((t) => (
                <TR key={t.id}>
                  <TD className="font-mono text-xs font-semibold">{t.name}</TD>
                  <TD>{t.language}</TD>
                  <TD className="text-right tabular-nums">{t.variables_count}</TD>
                  <TD className="text-sm text-muted-foreground">{t.description ?? "—"}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Journal des envois</CardTitle>
          <CardDescription>40 derniers envois. Destinataire masqué ; ni le contenu ni les clés ne sont conservés.</CardDescription>
        </CardHeader>
        {!deliveries?.length ? (
          <CardContent>
            <EmptyState icon={History} title="Aucun envoi" description="Les envois et les tests apparaîtront ici." />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr className="border-t border-border">
                <TH>Date</TH>
                <TH>Canal</TH>
                <TH>Destinataire</TH>
                <TH>Établissement</TH>
                <TH>Statut</TH>
              </tr>
            </THead>
            <tbody>
              {deliveries.map((d) => (
                <TR key={d.id}>
                  <TD className="whitespace-nowrap text-xs tabular-nums">{formatDateTime(d.created_at, "fr-FR", "Africa/Porto-Novo")}</TD>
                  <TD>
                    <span className="grid">
                      <span>{CHANNEL[d.channel] ?? d.channel}</span>
                      <span className="text-xs text-muted-foreground">
                        {d.provider ?? "—"} · {d.purpose}
                      </span>
                    </span>
                  </TD>
                  <TD className="font-mono text-xs">{d.recipient_masked}</TD>
                  <TD className="text-sm">{d.organization?.name ?? "Plateforme"}</TD>
                  <TD>
                    <span className="grid gap-0.5">
                      <Badge tone={STATUS[d.status]?.tone ?? "neutral"}>{STATUS[d.status]?.label ?? d.status}</Badge>
                      {d.error ? <span className="max-w-xs text-xs text-muted-foreground">{d.error}</span> : null}
                    </span>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
