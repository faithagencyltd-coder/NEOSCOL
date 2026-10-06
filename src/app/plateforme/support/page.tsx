import { BookOpen, Bot, Headset, MessageCircle, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { TabNav } from "@/components/shared/tab-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Bars, Empty, Kpi, Panel } from "@/features/analytics/charts";
import { InlineForm } from "@/features/ecosystem/components/inline-form";
import { closeConversation, replyToConversation, saveKnowledgeArticle, saveSupportSettings, saveWhatsAppWebhook } from "@/features/support/center-actions";
import { canWritePlatform, getPlatformRole } from "@/lib/auth/platform";
import { publicBaseUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Support Center — Console" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "conversations", label: "Conversations" },
  { key: "connaissances", label: "Base de connaissances" },
  { key: "statistiques", label: "Statistiques" },
  { key: "reglages", label: "Réglages" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const CATEGORIES: Record<string, string> = {
  neoscool: "NeoScool",
  compte: "Création de compte",
  inscription: "Inscription d'un établissement",
  abonnement: "Abonnements",
  fonctionnalites: "Fonctionnalités",
  portails: "Portails",
  paiements: "Paiements",
  formation: "Formation",
  connexion: "Problèmes de connexion",
  technique: "Support technique",
  autre: "Autre",
};
const AUDIENCES: Record<string, string> = { all: "Tout le monde", public: "Site public", school: "Portails et établissements" };
const CONV_STATUS = {
  bot: { label: "Assistant", tone: "info" as const },
  waiting_agent: { label: "En attente d'un agent", tone: "warning" as const },
  agent: { label: "Prise en charge", tone: "primary" as const },
  closed: { label: "Clôturée", tone: "neutral" as const },
};
const CHANNELS: Record<string, string> = { chatbot: "Chatbot", whatsapp: "WhatsApp", portal: "Portail", site: "Site", email: "E-mail", platform: "Plateforme" };
const when = (d: string) => new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));

/** Console › Support Center : conversations (chatbot, WhatsApp), base de connaissances, statistiques, réglages. */
export default async function SupportCenterPage({ searchParams }: PageProps<"/plateforme/support">) {
  const sp = await searchParams;
  const requested = param(sp, "onglet");
  const tab: Tab = TABS.find((t) => t.key === requested)?.key ?? "conversations";
  const writable = canWritePlatform(await getPlatformRole());
  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Support Center</h1>
        <p className="text-sm text-muted-foreground">
          Assistant NeoScool (site et portails), WhatsApp et transfert vers l&apos;équipe. Les demandes transférées rejoignent{" "}
          <Link href="/plateforme/incidents" className="text-primary hover:underline">
            Assistance
          </Link>
          .
        </p>
      </div>
      <TabNav label="Support Center" active={tab} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/plateforme/support?onglet=${t.key}` }))} />
      {tab === "conversations" ? <ConversationsTab selected={param(sp, "conversation")} writable={writable} /> : null}
      {tab === "connaissances" ? <KnowledgeTab writable={writable} /> : null}
      {tab === "statistiques" ? <StatsTab /> : null}
      {tab === "reglages" ? <SettingsTab writable={writable} /> : null}
    </div>
  );
}

async function ConversationsTab({ selected, writable }: { selected?: string; writable: boolean }) {
  const supabase = await createClient();
  const { data: list } = await supabase
    .from("support_conversations")
    .select("id, channel, status, audience, page, ticket_id, whatsapp_from, created_at, updated_at, organizations(name), support_tickets(number, requester_name, requester_email)")
    .order("updated_at", { ascending: false })
    .limit(100);
  const rank = (s: string) => (s === "waiting_agent" ? 0 : s === "agent" ? 1 : s === "bot" ? 2 : 3);
  const rows = [...(list ?? [])].sort((a, b) => rank(a.status) - rank(b.status));
  const current = isUuid(selected) ? rows.find((c) => c.id === selected) : undefined;
  const { data: messages } = current ? await supabase.from("support_conversation_messages").select("id, sender, body, created_at, answered").eq("conversation_id", current.id).order("id") : { data: [] };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="grid content-start gap-2" data-testid="support-conversations">
        {rows.length === 0 ? <Empty>Aucune conversation pour le moment.</Empty> : null}
        {rows.map((c) => {
          const ticket = c.support_tickets as unknown as { number: number; requester_name: string | null; requester_email: string | null } | null;
          const org = c.organizations as unknown as { name: string } | null;
          return (
            <Link key={c.id} href={`/plateforme/support?onglet=conversations&conversation=${c.id}`} scroll={false} className={`grid gap-1 rounded-xl border bg-surface p-3 text-sm hover:shadow ${current?.id === c.id ? "border-primary" : "border-border"}`}>
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-medium">
                  {c.channel === "whatsapp" ? <MessageCircle className="size-4 text-emerald-600" aria-hidden /> : <Bot className="size-4 text-primary" aria-hidden />}
                  {ticket?.requester_name || org?.name || (c.channel === "whatsapp" ? `+${c.whatsapp_from}` : "Visiteur du site")}
                </span>
                <StatusBadge value={c.status} map={CONV_STATUS} />
              </span>
              <span className="text-xs text-muted-foreground">
                {CHANNELS[c.channel] ?? c.channel} · {c.audience === "school" ? "portail" : "site public"} · {when(c.updated_at)}
                {ticket ? ` · demande n° ${ticket.number}` : ""}
              </span>
            </Link>
          );
        })}
      </div>
      {current ? (
        <Card className="grid content-start gap-3 p-4" data-testid="support-thread">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {CHANNELS[current.channel]} · ouverte le {when(current.created_at)} {current.page ? `· page ${current.page}` : ""}
            </span>
            {current.ticket_id ? (
              <Link href={`/plateforme/incidents/${current.ticket_id}`} className="text-sm font-semibold text-primary hover:underline">
                Ouvrir la demande d&apos;assistance
              </Link>
            ) : null}
          </div>
          <ol className="grid max-h-[28rem] gap-2 overflow-y-auto">
            {(messages ?? []).map((m) => (
              <li key={m.id} className={`max-w-[85%] whitespace-pre-line rounded-xl p-2.5 text-sm ${m.sender === "visitor" ? "mr-auto bg-surface-muted" : m.sender === "agent" ? "ml-auto bg-emerald-50 text-emerald-950" : m.sender === "system" ? "mx-auto text-center text-xs text-muted-foreground" : "ml-auto bg-primary/10"}`}>
                <span className="mb-0.5 block text-[11px] text-muted-foreground">
                  {m.sender === "visitor" ? "Visiteur" : m.sender === "bot" ? `Assistant${m.answered === false ? " (sans réponse)" : ""}` : m.sender === "agent" ? "Équipe Support" : "Info"} · {when(m.created_at)}
                </span>
                {m.body}
              </li>
            ))}
          </ol>
          {writable && current.status !== "closed" ? (
            <>
              <InlineForm action={replyToConversation} hidden={{ conversation_id: current.id }} submit="Répondre" reset testId="support-reply">
                <Textarea name="body" rows={3} maxLength={4000} required aria-label="Réponse" placeholder="Votre réponse (visible par le visiteur)…" />
              </InlineForm>
              <InlineForm action={closeConversation} hidden={{ conversation_id: current.id }} submit="Clôturer la conversation" variant="ghost" className="flex" />
            </>
          ) : null}
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">Sélectionnez une conversation.</p>
      )}
    </div>
  );
}

async function KnowledgeTab({ writable }: { writable: boolean }) {
  const { data: articles } = await (await createClient()).from("knowledge_articles").select("*").order("category").order("sort_order");
  type A = NonNullable<typeof articles>[number];
  const fields = (a?: A) => [
    { name: "title", label: "Question / titre", required: true, wide: true, defaultValue: a?.title ?? "" },
    { name: "body", label: "Réponse", type: "textarea" as const, required: true, wide: true, defaultValue: a?.body ?? "" },
    { name: "category", label: "Catégorie", type: "select" as const, options: opts(CATEGORIES), defaultValue: a?.category ?? "neoscool" },
    { name: "audience", label: "Visible par", type: "select" as const, options: opts(AUDIENCES), defaultValue: a?.audience ?? "all" },
    { name: "keywords", label: "Mots-clés (séparés par des virgules)", wide: true, defaultValue: (a?.keywords ?? []).join(", ") },
    { name: "sort_order", label: "Ordre", type: "number" as const, defaultValue: String(a?.sort_order ?? 100) },
    { name: "published", label: "Publié (utilisé par l'assistant)", type: "checkbox" as const, defaultValue: a?.published ? "true" : "" },
  ];
  return (
    <div className="grid gap-3" data-testid="knowledge">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">L&apos;assistant ne répond qu&apos;à partir des articles publiés. Les articles de départ sont à relire avant publication.</p>
        {writable ? (
          <QuickFormDialog
            title="Nouvel article"
            action={saveKnowledgeArticle}
            trigger={
              <Button size="sm">
                <Plus aria-hidden /> Nouvel article
              </Button>
            }
            fields={fields()}
          />
        ) : null}
      </div>
      {(articles ?? []).length === 0 ? <Empty>Aucun article.</Empty> : null}
      <ul className="grid gap-2">
        {(articles ?? []).map((a) => (
          <li key={a.id} className="grid gap-1 rounded-xl border border-border bg-surface p-3 text-sm">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-medium">
                <BookOpen className="size-4 text-primary" aria-hidden /> {a.title}
              </span>
              <span className="flex items-center gap-2">
                <StatusBadge value={a.published ? "on" : "off"} map={{ on: { label: "Publié", tone: "success" }, off: { label: "Brouillon", tone: "neutral" } }} />
                {writable ? <QuickFormDialog title="Modifier l'article" action={saveKnowledgeArticle} hidden={{ id: a.id }} trigger={<Button size="sm" variant="ghost">Modifier</Button>} fields={fields(a)} /> : null}
              </span>
            </span>
            <span className="line-clamp-2 text-muted-foreground">{a.body}</span>
            <span className="text-xs text-muted-foreground">
              {CATEGORIES[a.category] ?? a.category} · {AUDIENCES[a.audience]} · utilisé {a.views} fois
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function StatsTab() {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 86_400_000);
  const { data } = await (await createClient()).rpc("platform_support_stats", { p_from: from.toISOString().slice(0, 10), p_to: to.toISOString().slice(0, 10) });
  const s = data as {
    conversations: number;
    by_channel: Record<string, number>;
    handoffs: number;
    waiting: number;
    bot_answered: number;
    bot_unanswered: number;
    tickets_by_channel: Record<string, number>;
    unanswered_questions: { question: string; created_at: string }[];
    top_articles: { id: string; title: string; views: number }[];
  } | null;
  if (!s) return <Empty>Statistiques indisponibles.</Empty>;
  const n = (v: number) => v.toLocaleString("fr-FR");
  return (
    <div className="grid gap-4" data-testid="support-stats">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Conversations (30 jours)" value={n(s.conversations)} />
        <Kpi label="Réponses de l'assistant" value={n(s.bot_answered)} hint={`${n(s.bot_unanswered)} question(s) sans réponse`} />
        <Kpi label="Transferts vers l'équipe" value={n(s.handoffs)} />
        <Kpi label="En attente d'un agent" value={n(s.waiting)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Conversations par canal">
          <Bars rows={Object.entries(s.by_channel).map(([k, v]) => ({ label: CHANNELS[k] ?? k, value: v }))} />
        </Panel>
        <Panel title="Demandes d'assistance par canal">
          <Bars rows={Object.entries(s.tickets_by_channel).map(([k, v]) => ({ label: CHANNELS[k] ?? k, value: v }))} />
        </Panel>
        <Panel title="Questions sans réponse" description="À couvrir par un nouvel article de la base de connaissances.">
          {s.unanswered_questions.length ? (
            <ul className="grid gap-1 text-sm">
              {s.unanswered_questions.map((q, i) => (
                <li key={i} className="border-b border-border py-1">
                  {q.question} <span className="text-xs text-muted-foreground">· {when(q.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Aucune question sans réponse.</Empty>
          )}
        </Panel>
        <Panel title="Articles les plus utilisés">
          <Bars rows={s.top_articles.filter((a) => a.views > 0).map((a) => ({ label: a.title, value: a.views }))} empty="Aucun article utilisé pour le moment." />
        </Panel>
      </div>
    </div>
  );
}

async function SettingsTab({ writable }: { writable: boolean }) {
  const admin = createAdminClient();
  const [{ data: s }, secrets, base] = await Promise.all([
    (await createClient()).from("support_settings").select("*").eq("id", 1).maybeSingle(),
    admin ? admin.from("support_secrets").select("whatsapp_verify_token_hash, whatsapp_app_secret_ciphertext").eq("id", 1).maybeSingle() : Promise.resolve({ data: null }),
    publicBaseUrl(),
  ]);
  if (!s) return null;
  const sec = secrets.data as { whatsapp_verify_token_hash: string | null; whatsapp_app_secret_ciphertext: string | null } | null;
  const box = (name: string, label: string, hint: string, checked: boolean) => (
    <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} disabled={!writable} className="mt-0.5 size-4" />
      <span className="grid">
        <strong>{label}</strong>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
  return (
    <div className="grid gap-4" data-testid="support-settings">
      <Panel title="Assistant NeoScool (chatbot)" description="Désactivé par défaut. Chaque option peut être activée ou désactivée à tout moment ; les conversations et demandes passées sont conservées.">
        <InlineForm action={saveSupportSettings} submit={writable ? "Enregistrer" : undefined}>
          {box("chatbot_enabled", "Assistant activé", "Interrupteur général de l'assistant.", s.chatbot_enabled)}
          {box("chatbot_on_site", "Sur le site public", "Bulle « Assistant NeoScool » sur les pages du site.", s.chatbot_on_site)}
          {box("chatbot_in_portals", "Dans l'application et les portails", "Pour les comptes connectés (établissements, parents, apprenants, enseignants).", s.chatbot_in_portals)}
          {box("ai_enabled", "Réponses rédigées par l'IA (Claude)", "Reformule à partir des seuls articles publiés ; nécessite la clé Claude (Console › Intégrations). Sinon l'article le plus pertinent est affiché tel quel.", s.ai_enabled)}
          <label className="grid max-w-sm gap-1 text-sm">
            Modèle Claude
            <select name="ai_model" defaultValue={s.ai_model} disabled={!writable} className="h-9 rounded-lg border border-border px-2">
              <option value="claude-haiku-4-5-20251001">Rapide et économique (Haiku 4.5)</option>
              <option value="claude-opus-5">Plus précis, plus coûteux (Opus 5)</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Instructions générales de l&apos;assistant (facultatif)
            <Textarea name="instructions" defaultValue={s.instructions ?? ""} rows={3} maxLength={2000} disabled={!writable} placeholder="ex. Toujours proposer la page Tarifs pour les questions de prix." />
          </label>
          <label className="grid gap-1 text-sm">
            Message d&apos;accueil
            <Textarea name="welcome_message" defaultValue={s.welcome_message} rows={2} maxLength={500} disabled={!writable} />
          </label>
          <label className="grid gap-1 text-sm">
            Proposition de transfert vers un humain
            <input name="handoff_message" defaultValue={s.handoff_message} maxLength={300} disabled={!writable} className="h-9 rounded-lg border border-border px-2" />
          </label>
          {box("whatsapp_inbound_enabled", "Recevoir les messages WhatsApp", "Les messages reçus sur le numéro WhatsApp Business (API officielle Meta) arrivent dans les conversations.", s.whatsapp_inbound_enabled)}
          {box("whatsapp_bot_replies", "L'assistant répond sur WhatsApp", "Sinon, chaque message WhatsApp devient directement une demande pour l'équipe.", s.whatsapp_bot_replies)}
        </InlineForm>
      </Panel>
      <Panel title="WhatsApp Business — réception (webhook Meta)" description="À renseigner dans Meta for Developers › WhatsApp › Configuration. L'envoi utilise l'intégration WhatsApp de la console.">
        <div className="grid gap-3 text-sm">
          <p>
            Adresse de rappel : <code className="rounded bg-surface-muted px-1.5 py-0.5">{base}/api/webhooks/whatsapp</code>
          </p>
          <p className="flex flex-wrap gap-3 text-xs">
            <span>Jeton de vérification : {sec?.whatsapp_verify_token_hash ? "configuré" : "non configuré"}</span>
            <span>Secret de l&apos;application : {sec?.whatsapp_app_secret_ciphertext ? "configuré" : "non configuré"}</span>
          </p>
          {writable ? (
            <InlineForm action={saveWhatsAppWebhook} submit="Enregistrer (jamais réaffichés)" reset className="grid gap-2 sm:max-w-md">
              <input name="verify_token" type="password" autoComplete="off" placeholder="Jeton de vérification (que vous choisissez)" className="h-9 rounded-lg border border-border px-2" aria-label="Jeton de vérification" />
              <input name="app_secret" type="password" autoComplete="off" placeholder="Secret de l'application Meta" className="h-9 rounded-lg border border-border px-2" aria-label="Secret de l'application Meta" />
            </InlineForm>
          ) : null}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Headset className="size-3.5" aria-hidden /> Sans ces réglages, rien n&apos;est reçu de WhatsApp : aucune conversation n&apos;est simulée.
          </p>
        </div>
      </Panel>
    </div>
  );
}
