import { Mail, MessageCircle, MessageSquareText, Pencil, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { QuickFormDialog, type QuickField } from "@/components/shared/quick-form-dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { cancelCampaign, saveAutomation, saveMessageTemplate } from "@/features/communication/campaign-actions";
import { CampaignComposer, ResumeCampaignButton, type ComposerTemplate } from "@/features/communication/components/campaign-composer";
import { MESSAGE_VARIABLES } from "@/features/communication/render";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { requirePermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Centre d'envois" };

type Channels = Record<"email" | "sms" | "whatsapp", { enabled: boolean; used: number; limit: number }>;
type Template = ComposerTemplate & { whatsapp_template_id: string | null; whatsapp_variables: string[]; is_active: boolean };

const CHANNEL = { email: "E-mail", sms: "SMS", whatsapp: "WhatsApp" } as const;
const CAMPAIGN_STATUS = {
  ready: { label: "Préparé", tone: "neutral" },
  sending: { label: "Interrompu", tone: "warning" },
  done: { label: "Terminé", tone: "success" },
  cancelled: { label: "Arrêté", tone: "danger" },
} as const;
const RECIPIENT_STATUS = {
  pending: { label: "En attente", tone: "neutral" },
  sent: { label: "Envoyé", tone: "success" },
  failed: { label: "Échec", tone: "danger" },
  blocked_quota: { label: "Quota atteint", tone: "warning" },
  not_configured: { label: "Canal non configuré", tone: "warning" },
  no_contact: { label: "Sans coordonnée", tone: "neutral" },
} as const;
const AUDIENCE = { guardians: "Tous les parents", classes: "Parents de classes", unpaid: "Parents en impayé", staff: "Personnel" } as const;

function templateFields(t: Template | null, waTemplates: { value: string; label: string }[]): QuickField[] {
  return [
    { name: "name", label: "Nom du modèle", required: true, defaultValue: t?.name, placeholder: "Rappel de paiement" },
    {
      name: "channel",
      label: "Canal",
      type: "select",
      required: true,
      options: [
        { value: "sms", label: "SMS" },
        { value: "email", label: "E-mail" },
        { value: "whatsapp", label: "WhatsApp (modèle approuvé)" },
      ],
      defaultValue: t?.channel ?? "sms",
    },
    { name: "subject", label: "Objet (e-mail)", defaultValue: t?.subject ?? "", wide: true },
    {
      name: "body",
      label: "Message",
      type: "textarea",
      required: true,
      wide: true,
      defaultValue: t?.body ?? "Bonjour {{destinataire}}, ",
      hint: `Variables : ${MESSAGE_VARIABLES.map((v) => `{{${v.key}}}`).join(" ")}. SMS : 480 caractères au plus.`,
    },
    ...(waTemplates.length
      ? ([
          { name: "whatsapp_template_id", label: "Modèle WhatsApp approuvé", type: "select", options: [{ value: "", label: "—" }, ...waTemplates], defaultValue: t?.whatsapp_template_id ?? "" },
          { name: "whatsapp_variables", label: "Variables WhatsApp dans l'ordre {{1}}, {{2}}…", defaultValue: t?.whatsapp_variables.join(", ") ?? "", placeholder: "destinataire, eleve_prenom, solde" },
        ] satisfies QuickField[])
      : []),
    { name: "is_active", label: "Actif", type: "checkbox", defaultValue: !t || t.is_active ? "true" : "false" },
  ];
}

/**
 * Centre d'envois : SMS, e-mails et WhatsApp groupés aux parents et au
 * personnel, modèles avec variables, relance automatique des impayés.
 * Fournisseurs et quotas gérés par la plateforme ; aucun envoi simulé.
 */
export default async function SendingCenterPage({ searchParams }: PageProps<"/communication/envois">) {
  const context = await requirePermission("communication.send");
  const orgId = context.organization.id;
  const params = await searchParams;
  const detailId = typeof params.envoi === "string" && isUuid(params.envoi) ? params.envoi : null;
  const supabase = await createClient();
  const [{ data: channels }, { data: templates }, { data: campaigns }, { data: automation }, { data: classes }, { data: wa }] = await Promise.all([
    supabase.rpc("communication_channels", { p_org: orgId }),
    supabase.from("message_templates").select("*").eq("organization_id", orgId).order("name"),
    supabase.from("message_campaigns").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(20),
    supabase.from("communication_automations").select("*").eq("organization_id", orgId).eq("kind", "invoice_overdue").maybeSingle(),
    supabase.from("classes").select("id, name, academic_year:academic_years!inner(is_current)").eq("organization_id", orgId).eq("academic_year.is_current", true).order("name"),
    supabase.from("whatsapp_templates").select("id, name, language, variables_count").eq("enabled", true).order("name"),
  ]);
  const ch = channels as unknown as Channels;
  const list = (templates ?? []) as unknown as Template[];
  const waOptions = (wa ?? []).map((w) => ({ value: w.id, label: `${w.name} (${w.language}, ${w.variables_count} variable(s))` }));
  const detail = detailId ? (campaigns ?? []).find((c) => c.id === detailId) : null;
  const { data: recipients } = detail
    ? await supabase.from("message_campaign_recipients").select("id, display_name, contact_masked, status, error, sent_at").eq("campaign_id", detail.id).order("display_name").limit(300)
    : { data: null };
  const disabled = (["sms", "email", "whatsapp"] as const).filter((c) => !ch[c].enabled);

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Centre d'envois"
        description="SMS, e-mails et WhatsApp groupés aux parents et au personnel, avec vos modèles et la relance automatique des impayés."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/communication">Annonces</Link>
            </Button>
            <QuickFormDialog title="Nouveau modèle de message" triggerLabel="Nouveau modèle" action={saveMessageTemplate} fields={templateFields(null, waOptions)} />
          </>
        }
      />
      {disabled.length ? (
        <Alert tone="warning" title="Canal non activé par la plateforme">
          {disabled.map((c) => CHANNEL[c]).join(", ")} : le fournisseur n&apos;est pas encore activé par NéoScol. Les destinataires de ces canaux seront marqués « canal non configuré » — aucun message n&apos;est simulé.
        </Alert>
      ) : null}

      <section className="stagger grid gap-4 sm:grid-cols-3" aria-label="Consommation du mois">
        <StatCard label="SMS ce mois-ci" value={{ count: ch.sms.used }} hint={`Quota : ${ch.sms.limit}${ch.sms.enabled ? "" : " — non activé"}`} icon={MessageSquareText} tone="primary" />
        <StatCard label="E-mails ce mois-ci" value={{ count: ch.email.used }} hint={`Quota : ${ch.email.limit}${ch.email.enabled ? "" : " — non activé"}`} icon={Mail} tone="info" />
        <StatCard label="WhatsApp ce mois-ci" value={{ count: ch.whatsapp.used }} hint={`Quota : ${ch.whatsapp.limit}${ch.whatsapp.enabled ? "" : " — non activé"}`} icon={MessageCircle} tone="success" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Nouvel envoi</CardTitle>
          <CardDescription>Les destinataires et leurs coordonnées sont calculés par le serveur ; vérifiez l&apos;aperçu avant d&apos;envoyer.</CardDescription>
        </CardHeader>
        <CardContent>
          <CampaignComposer
            templates={list.filter((t) => t.is_active).map((t) => ({ id: t.id, name: t.name, channel: t.channel, subject: t.subject, body: t.body }))}
            classes={(classes ?? []).map((c) => ({ id: c.id, name: c.name }))}
          />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Modèles de messages</CardTitle>
          <CardDescription>Réutilisables pour les envois et les relances automatiques.</CardDescription>
        </CardHeader>
        {list.length === 0 ? (
          <CardContent>
            <EmptyState icon={MessageSquareText} title="Aucun modèle" description="Créez un modèle (SMS, e-mail ou WhatsApp) avec des variables comme {{eleve_prenom}}." />
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <tr className="border-t border-border">
                  <TH>Modèle</TH>
                  <TH>Canal</TH>
                  <TH className="hidden md:table-cell">Message</TH>
                  <TH />
                </tr>
              </THead>
              <tbody>
                {list.map((t) => (
                  <TR key={t.id}>
                    <TD>
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        {t.name}
                        {!t.is_active ? <Badge>Inactif</Badge> : null}
                      </span>
                    </TD>
                    <TD>{CHANNEL[t.channel]}</TD>
                    <TD className="hidden max-w-md truncate text-xs text-muted-foreground md:table-cell">{t.body}</TD>
                    <TD>
                      <QuickFormDialog
                        title={`Modifier — ${t.name}`}
                        trigger={
                          <Button size="sm" variant="ghost" aria-label={`Modifier ${t.name}`}>
                            <Pencil aria-hidden />
                          </Button>
                        }
                        action={saveMessageTemplate}
                        fields={templateFields(t, waOptions)}
                        hidden={{ id: t.id }}
                      />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>Relance automatique des impayés</CardTitle>
            <CardDescription>
              {automation?.enabled
                ? `Active : parents d'élèves en impayé, tous les ${automation.interval_days} jour(s)${automation.last_run_at ? ` — dernière le ${new Date(automation.last_run_at).toLocaleDateString("fr-FR")}` : ""}.`
                : "Inactive. Les rappels dans l'application restent envoyés comme avant."}
            </CardDescription>
          </div>
          <QuickFormDialog
            title="Relance automatique des impayés"
            description="Envoyée par le planificateur quotidien aux parents d'élèves ayant une échéance dépassée."
            triggerLabel="Régler"
            action={saveAutomation}
            fields={[
              { name: "template_id", label: "Modèle de message", type: "select", options: [{ value: "", label: "—" }, ...list.filter((t) => t.is_active).map((t) => ({ value: t.id, label: `${CHANNEL[t.channel]} — ${t.name}` }))], defaultValue: automation?.template_id ?? "", wide: true },
              { name: "interval_days", label: "Fréquence (jours)", type: "number", min: 1, max: 60, defaultValue: String(automation?.interval_days ?? 7) },
              { name: "enabled", label: "Activer la relance automatique", type: "checkbox", defaultValue: automation?.enabled ? "true" : "false" },
            ]}
          />
        </CardHeader>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Historique des envois</CardTitle>
          <CardDescription>Chaque envoi garde le détail par destinataire (coordonnées masquées).</CardDescription>
        </CardHeader>
        {campaigns?.length ? (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <tr className="border-t border-border">
                  <TH>Envoi</TH>
                  <TH className="hidden sm:table-cell">Public</TH>
                  <TH>Résultat</TH>
                  <TH />
                </tr>
              </THead>
              <tbody>
                {campaigns.map((c) => {
                  const st = CAMPAIGN_STATUS[c.status as keyof typeof CAMPAIGN_STATUS];
                  return (
                    <TR key={c.id}>
                      <TD>
                        <Link href={`/communication/envois?envoi=${c.id}`} className="font-medium hover:underline">
                          {c.name}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {CHANNEL[c.channel as keyof typeof CHANNEL]} · {new Date(c.created_at).toLocaleString("fr-FR")}
                          {c.source === "automation" ? " · automatique" : ""}
                        </span>
                      </TD>
                      <TD className="hidden text-xs sm:table-cell">{AUDIENCE[(c.audience as { kind: keyof typeof AUDIENCE }).kind] ?? "—"}</TD>
                      <TD>
                        <span className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge tone={st.tone}>{st.label}</Badge>
                          {c.sent} envoyé(s) · {c.failed} échec(s) · {c.skipped} sans coordonnée
                        </span>
                      </TD>
                      <TD>
                        {c.status === "ready" || c.status === "sending" ? (
                          <span className="flex justify-end gap-1">
                            <ResumeCampaignButton id={c.id} />
                            <ConfirmAction
                              trigger={<Button size="sm" variant="ghost" className="text-danger">Arrêter</Button>}
                              title="Arrêter cet envoi ?"
                              description="Les destinataires restants ne seront pas contactés. L'historique est conservé."
                              confirmLabel="Arrêter"
                              tone="danger"
                              action={cancelCampaign}
                              fields={{ campaign_id: c.id }}
                            />
                          </span>
                        ) : null}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </div>
        ) : (
          <CardContent>
            <EmptyState icon={Send} title="Aucun envoi pour l'instant" />
          </CardContent>
        )}
      </Card>

      {detail ? (
        <Card className="overflow-hidden" id="detail">
          <CardHeader>
            <CardTitle>Détail — {detail.name}</CardTitle>
            <CardDescription>{detail.total} destinataire(s).</CardDescription>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <tr className="border-t border-border">
                  <TH>Destinataire</TH>
                  <TH className="hidden sm:table-cell">Coordonnée</TH>
                  <TH>Statut</TH>
                </tr>
              </THead>
              <tbody>
                {(recipients ?? []).map((r) => {
                  const st = RECIPIENT_STATUS[r.status as keyof typeof RECIPIENT_STATUS];
                  return (
                    <TR key={r.id} data-recipient-status={r.status}>
                      <TD>{r.display_name}</TD>
                      <TD className="hidden font-mono text-xs sm:table-cell">{r.contact_masked ?? "—"}</TD>
                      <TD>
                        <span className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge tone={st.tone}>{st.label}</Badge>
                          {r.error ? <span className="text-muted-foreground">{r.error}</span> : null}
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
