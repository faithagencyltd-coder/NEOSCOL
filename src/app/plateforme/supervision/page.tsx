import { Activity, CircleAlert, CircleCheck, Database, HardDrive, PlugZap, RefreshCw, Webhook } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { publicBaseUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Supervision — Plateforme" };
export const dynamic = "force-dynamic";

type Hook = { processed_24h: number; rejected_24h: number; duplicate_24h: number; last_received: string | null; last_error: string | null };
type Health = {
  database: { size_bytes: number; connections: number; max_connections: number; started_at: string; version: string };
  storage: { files: number; bytes: number; by_bucket: { bucket: string; files: number; bytes: number }[]; top_organizations: { name: string; files: number; bytes: number }[] };
  volumes: Record<string, number>;
  integrations: { provider: string; enabled: boolean; last_test_at: string | null; last_test_ok: boolean | null; last_test_message: string | null }[];
  gateways: { provider: string; enabled: boolean; mode: string; last_test_at: string | null; last_test_ok: boolean | null }[];
  school_providers: { active: number; failing: number; untested: number };
  webhooks: { subscriptions: Hook; families: Hook };
  deliveries: { notifications: Record<string, number>; notifications_last_error: string | null; messages: Record<string, number>; messages_last_error: string | null };
  sync: { jobs_7d: number; failed_7d: number; with_errors_7d: number };
  errors: { failures_24h: number; denied_24h: number; top_7d: { action: string; n: number; last: string }[] };
  sms_low_balance: number;
  measured_at: string;
};

const PROVIDERS: Record<string, string> = {
  brevo_email: "E-mails (Brevo)",
  brevo_sms: "SMS (Brevo)",
  twilio_sms: "SMS (Twilio)",
  whatsapp_meta: "WhatsApp (Meta)",
  turnstile: "Anti-robot (Turnstile)",
  anthropic: "Assistant IA (Claude)",
  web_push: "Notifications push",
};
const VOLUMES: Record<string, string> = {
  students: "Élèves / apprenants",
  staff_members: "Personnel",
  grades: "Notes",
  attendance_records: "Présences",
  invoices: "Factures",
  payments: "Paiements",
  messages: "Messages",
  notifications: "Notifications",
  file_objects: "Fichiers",
  audit_logs: "Journal",
};

function bytes(n: number): string {
  if (n < 1024) return `${n} o`;
  const units = ["Ko", "Mo", "Go", "To"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${units[i]}`;
}
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR") : "jamais");

/** État d'un service : actif et testé avec succès, en échec, non testé ou désactivé. */
function State({ enabled, ok, tested }: { enabled: boolean; ok: boolean | null; tested: boolean }) {
  if (!enabled) return <Badge>Désactivé</Badge>;
  if (!tested) return <Badge tone="warning">Jamais testé</Badge>;
  return ok ? <Badge tone="success">Opérationnel</Badge> : <Badge tone="danger">En échec</Badge>;
}

/** Temps de réponse réel de la base (aller-retour d'une requête minimale). */
async function measurePing(supabase: Awaited<ReturnType<typeof createClient>>): Promise<{ latency: number; error: boolean }> {
  const started = performance.now();
  const { error } = await supabase.rpc("health_ping");
  return { latency: Math.round(performance.now() - started), error: Boolean(error) };
}

/** Centre de supervision : mesures réelles de la base, des intégrations, des envois et des notifications de paiement. */
export default async function PlatformSupervisionPage() {
  const supabase = await createClient();
  const ping = await measurePing(supabase);
  const latency = ping.latency;
  const { data, error } = await supabase.rpc("platform_service_health");
  const h = data as unknown as Health | null;
  if (error || !h) {
    return (
      <Card>
        <CardContent className="pt-5 text-sm text-danger">Mesures indisponibles : la base de données ne répond pas correctement.</CardContent>
      </Card>
    );
  }
  const notifFailed = (h.deliveries.notifications.failed ?? 0) + (h.deliveries.notifications.error ?? 0);
  const msgFailed = (h.deliveries.messages.failed ?? 0) + (h.deliveries.messages.error ?? 0);
  const failingIntegrations = h.integrations.filter((i) => i.enabled && i.last_test_ok === false).length + h.gateways.filter((g) => g.enabled && g.last_test_ok === false).length;
  const problems = [
    failingIntegrations ? `${failingIntegrations} service(s) externe(s) en échec au dernier test` : null,
    h.school_providers.failing ? `${h.school_providers.failing} fournisseur(s) de paiement d'établissement en échec` : null,
    h.webhooks.subscriptions.rejected_24h + h.webhooks.families.rejected_24h ? `${h.webhooks.subscriptions.rejected_24h + h.webhooks.families.rejected_24h} notification(s) de paiement rejetée(s) en 24 h` : null,
    notifFailed + msgFailed ? `${notifFailed + msgFailed} envoi(s) en échec en 24 h` : null,
    h.sync.failed_7d ? `${h.sync.failed_7d} synchronisation(s) Country Connect en échec (7 j)` : null,
    h.database.connections > h.database.max_connections * 0.8 ? "Connexions à la base proches de la limite" : null,
    latency > 1500 ? `Base lente : ${latency} ms` : null,
  ].filter(Boolean) as string[];
  const probe = `${await publicBaseUrl()}/api/sante`;

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-2xl font-bold">Supervision technique</h2>
          <p className="text-sm text-muted-foreground">Mesures prises à l&apos;instant ({new Date(h.measured_at).toLocaleTimeString("fr-FR")}). Aucune clé ni aucun secret n&apos;est affiché.</p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/plateforme/supervision">
            <RefreshCw aria-hidden /> Actualiser
          </Link>
        </Button>
      </div>

      <Card className={problems.length ? "border-danger/40" : "border-success/40"} data-testid="supervision-status">
        <CardContent className="grid gap-2 pt-5">
          {problems.length ? (
            <>
              <p className="flex items-center gap-2 font-semibold text-danger">
                <CircleAlert className="size-5" aria-hidden /> {problems.length} point(s) à surveiller
              </p>
              <ul className="ml-7 list-disc text-sm">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="flex items-center gap-2 font-semibold text-success">
              <CircleCheck className="size-5" aria-hidden /> Tous les services mesurés fonctionnent normalement.
            </p>
          )}
        </CardContent>
      </Card>

      <section className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicateurs techniques">
        <StatCard label="Temps de réponse de la base" value={ping.error ? "Erreur" : `${latency} ms`} hint={`PostgreSQL ${h.database.version}`} icon={Activity} tone={latency > 1500 || ping.error ? "danger" : "success"} />
        <StatCard label="Taille de la base" value={bytes(h.database.size_bytes)} hint={`${h.database.connections} / ${h.database.max_connections} connexions`} icon={Database} />
        <StatCard label="Fichiers stockés" value={bytes(h.storage.bytes)} hint={`${formatNumber(h.storage.files)} fichier(s)`} icon={HardDrive} tone="info" />
        <StatCard label="Erreurs (24 h)" value={{ count: h.errors.failures_24h }} hint={`${h.errors.denied_24h} accès refusé(s)`} icon={CircleAlert} tone={h.errors.failures_24h ? "warning" : "primary"} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlugZap className="size-5 text-primary" aria-hidden /> Services externes
            </CardTitle>
            <CardDescription>État issu du dernier test réel (bouton « Tester » dans Intégrations et Paiements en ligne).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {h.integrations.map((i) => (
              <div key={i.provider} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0" data-testid="service-row">
                <span className="grid">
                  <span className="font-medium">{PROVIDERS[i.provider] ?? i.provider}</span>
                  <span className="text-xs text-muted-foreground">
                    Dernier test : {when(i.last_test_at)}
                    {i.last_test_ok === false && i.last_test_message ? ` — ${i.last_test_message}` : ""}
                  </span>
                </span>
                <State enabled={i.enabled} ok={i.last_test_ok} tested={Boolean(i.last_test_at)} />
              </div>
            ))}
            {h.gateways.map((g) => (
              <div key={g.provider} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
                <span className="grid">
                  <span className="font-medium">Paiement des abonnements — {g.provider}</span>
                  <span className="text-xs text-muted-foreground">
                    Mode {g.mode === "live" ? "réel" : "test"} · dernier test : {when(g.last_test_at)}
                  </span>
                </span>
                <State enabled={g.enabled} ok={g.last_test_ok} tested={g.provider === "offline" || Boolean(g.last_test_at)} />
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              Paiements des familles : {h.school_providers.active} fournisseur(s) actif(s) dans les établissements, {h.school_providers.failing} en échec, {h.school_providers.untested} jamais testé(s). {h.sms_low_balance} établissement(s) avec moins de 10 SMS.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="size-5 text-primary" aria-hidden /> Notifications et envois (24 h)
            </CardTitle>
            <CardDescription>Messages reçus des fournisseurs de paiement, notifications et messages envoyés.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {([
              ["Paiements des abonnements", h.webhooks.subscriptions],
              ["Paiements des familles", h.webhooks.families],
            ] as const).map(([label, w]) => (
              <div key={label} className="grid gap-0.5">
                <span className="font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">
                  {w.processed_24h} traité(s), {w.rejected_24h} rejeté(s), {w.duplicate_24h} doublon(s) · dernier reçu : {when(w.last_received)}
                  {w.last_error ? ` · dernière erreur : ${w.last_error}` : ""}
                </span>
              </div>
            ))}
            <div className="grid gap-0.5">
              <span className="font-medium">Notifications (push, e-mail)</span>
              <span className="text-xs text-muted-foreground">
                {Object.entries(h.deliveries.notifications).map(([k, v]) => `${v} ${k}`).join(", ") || "aucun envoi"}
                {h.deliveries.notifications_last_error ? ` · dernière erreur : ${h.deliveries.notifications_last_error}` : ""}
              </span>
            </div>
            <div className="grid gap-0.5">
              <span className="font-medium">Messages (SMS, e-mail, WhatsApp)</span>
              <span className="text-xs text-muted-foreground">
                {Object.entries(h.deliveries.messages).map(([k, v]) => `${v} ${k}`).join(", ") || "aucun envoi"}
                {h.deliveries.messages_last_error ? ` · dernière erreur : ${h.deliveries.messages_last_error}` : ""}
              </span>
            </div>
            <div className="grid gap-0.5">
              <span className="font-medium">Synchronisations Country Connect (7 j)</span>
              <span className="text-xs text-muted-foreground">
                {h.sync.jobs_7d} traitement(s), {h.sync.failed_7d} en échec, {h.sync.with_errors_7d} avec des lignes rejetées
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Erreurs les plus fréquentes (7 jours)</CardTitle>
            <CardDescription>Actions refusées ou échouées, d&apos;après le journal.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1.5 text-sm">
            {h.errors.top_7d.length ? (
              h.errors.top_7d.map((e) => (
                <p key={e.action} className="flex justify-between gap-3">
                  <span className="font-mono text-xs">{e.action}</span>
                  <span className="text-muted-foreground">
                    {e.n} fois · {when(e.last)}
                  </span>
                </p>
              ))
            ) : (
              <p className="text-success">Aucune erreur enregistrée.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ressources</CardTitle>
            <CardDescription>Volumes estimés par la base et stockage des fichiers.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {Object.entries(VOLUMES).map(([key, label]) => (
                <p key={key} className="flex justify-between gap-2">
                  <span>{label}</span>
                  <span className="tabular-nums text-muted-foreground">≈ {formatNumber(h.volumes[key] ?? 0)}</span>
                </p>
              ))}
            </div>
            {h.storage.top_organizations.length ? (
              <div className="grid gap-1 border-t border-border pt-2">
                <span className="font-medium">Établissements utilisant le plus de stockage</span>
                {h.storage.top_organizations.map((o) => (
                  <p key={o.name} className="flex justify-between gap-2 text-xs">
                    <span>{o.name}</span>
                    <span className="text-muted-foreground">
                      {bytes(o.bytes)} · {o.files} fichier(s)
                    </span>
                  </p>
                ))}
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Les quotas d&apos;IA et de messages par établissement sont dans{" "}
              <Link href="/plateforme/integrations" className="text-primary underline-offset-4 hover:underline">
                Intégrations
              </Link>
              . Base démarrée le {when(h.database.started_at)}.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Surveillance 24 h/24</CardTitle>
          <CardDescription>Ce qui ne peut pas être mesuré depuis l&apos;intérieur de l&apos;application.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p>
            Une application ne peut pas constater sa propre panne : si le serveur est arrêté, cette page l&apos;est aussi. Pour être prévenu à toute heure, configurez un service de surveillance externe (par exemple UptimeRobot ou Better Stack) qui interroge toutes les 5 minutes l&apos;adresse :
          </p>
          <p className="rounded-xl bg-surface-muted px-3 py-2 font-mono text-xs" data-testid="health-url">
            {probe}
          </p>
          <p className="text-muted-foreground">
            Elle répond « ok » avec le temps de réponse lorsque l&apos;application et la base fonctionnent, et une erreur 503 sinon. Elle ne contient aucune donnée. Les sauvegardes et les journaux du serveur se consultent chez l&apos;hébergeur (voir Maintenance).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
