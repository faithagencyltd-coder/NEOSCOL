import { KeyRound, Lock, MailWarning, ShieldAlert, ShieldCheck, UserCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { revokeUserSessions, saveSecuritySettings, unlockAccount } from "@/features/platform/integration-actions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sécurité — Plateforme" };

type Overview = {
  failures_24h: number;
  successes_24h: number;
  pending_verification: number;
  locked: { identifier_hash: string; failures: number; last: string }[];
  sensitive_accounts: { user_id: string; email: string; platform_admin: boolean; mfa: boolean; sessions: number }[];
};

/** Centre de sécurité : réglages, comptes verrouillés, double authentification des rôles sensibles, journal. */
export default async function PlatformSecurityPage() {
  const supabase = await createClient();
  const [{ data }, { data: settings }, { data: integrations }, { data: events }] = await Promise.all([
    supabase.rpc("platform_security_overview"),
    supabase.from("platform_security_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("platform_integrations").select("provider, enabled").in("provider", ["turnstile", "brevo_email"]),
    supabase
      .from("audit_logs")
      .select("id, action, summary, actor_email, created_at, result")
      .or("action.like.auth.%,action.like.platform.%")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  const o = (data ?? { failures_24h: 0, successes_24h: 0, pending_verification: 0, locked: [], sensitive_accounts: [] }) as Overview;
  const turnstile = integrations?.find((i) => i.provider === "turnstile")?.enabled ?? false;
  const email = integrations?.find((i) => i.provider === "brevo_email")?.enabled ?? false;
  const withoutMfa = o.sensitive_accounts.filter((a) => !a.mfa).length;

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-2xl font-bold">Centre de sécurité</h2>
          <p className="text-sm text-muted-foreground">Contrôles appliqués par le serveur et la base de données ; cette page permet de les régler et de surveiller.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href="/securite">
              <KeyRound aria-hidden /> Ma double authentification
            </Link>
          </Button>
          <QuickFormDialog
            title="Réglages de sécurité"
            description="S'appliquent à tous les établissements."
            triggerLabel="Réglages"
            action={saveSecuritySettings}
            fields={[
              { name: "lockout_threshold", label: "Verrouillage après (échecs)", type: "number", required: true, min: 3, max: 50, defaultValue: String(settings?.lockout_threshold ?? 5) },
              { name: "lockout_minutes", label: "Durée du verrouillage (minutes)", type: "number", required: true, min: 1, max: 1440, defaultValue: String(settings?.lockout_minutes ?? 15) },
              { name: "captcha_after", label: "Anti-robot après (échecs)", type: "number", required: true, min: 1, max: 50, defaultValue: String(settings?.captcha_after_failures ?? 3) },
              { name: "mfa_required", label: "Double authentification obligatoire (Super Admin, direction, comptabilité)", type: "checkbox", wide: true, defaultValue: settings?.mfa_required_sensitive ? "true" : "false" },
              { name: "email_verification", label: "Vérifier l'adresse e-mail des nouveaux établissements", type: "checkbox", wide: true, defaultValue: settings?.email_verification_required ? "true" : "false" },
            ]}
          />
        </div>
      </div>

      <section className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicateurs">
        <StatCard label="Échecs de connexion (24 h)" value={{ count: o.failures_24h }} hint={`${o.successes_24h} connexion(s) réussie(s)`} icon={ShieldAlert} tone="warning" />
        <StatCard label="Comptes verrouillés" value={{ count: o.locked.length }} hint={`Après ${settings?.lockout_threshold ?? 5} échecs, ${settings?.lockout_minutes ?? 15} min`} icon={Lock} tone="danger" />
        <StatCard label="Rôles sensibles sans double auth." value={{ count: withoutMfa }} hint={settings?.mfa_required_sensitive ? "Obligatoire : activation exigée" : "Recommandée"} icon={KeyRound} tone="info" />
        <StatCard label="Adresses à vérifier" value={{ count: o.pending_verification }} hint="Établissements en lecture seule" icon={MailWarning} tone="primary" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Protections actives</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {[
              ["Isolation des établissements (RLS sur chaque table)", true],
              ["Double authentification appliquée en base (aal2)", true],
              ["Verrouillage progressif des comptes", true],
              [turnstile ? "Anti-robot Turnstile actif" : "Anti-robot : Turnstile non activé (Intégrations)", turnstile],
              [email ? "Vérification e-mail possible (Brevo actif)" : "Vérification e-mail : Brevo non activé (Intégrations)", email && Boolean(settings?.email_verification_required)],
              ["Clés d'intégration chiffrées, jamais réaffichées", true],
            ].map(([label, ok]) => (
              <li key={String(label)} className="flex items-center gap-2">
                {ok ? <ShieldCheck className="size-4 text-success" aria-hidden /> : <ShieldAlert className="size-4 text-warning" aria-hidden />}
                {label}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Comptes verrouillés</CardTitle>
          <CardDescription>Identifiants hachés (jamais en clair). Le verrouillage se lève seul après le délai, ou ici.</CardDescription>
        </CardHeader>
        {o.locked.length === 0 ? (
          <CardContent>
            <EmptyState icon={UserCheck} title="Aucun compte verrouillé" />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr className="border-t border-border">
                <TH>Identifiant (haché)</TH>
                <TH className="text-right">Échecs</TH>
                <TH>Dernier échec</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {o.locked.map((l) => (
                <TR key={l.identifier_hash}>
                  <TD className="font-mono text-xs">{l.identifier_hash.slice(0, 16)}…</TD>
                  <TD className="text-right tabular-nums">{l.failures}</TD>
                  <TD className="text-xs">{new Date(l.last).toLocaleString("fr-FR")}</TD>
                  <TD>
                    <ConfirmAction
                      trigger={<Button size="sm" variant="secondary">Déverrouiller</Button>}
                      title="Déverrouiller ce compte ?"
                      confirmLabel="Déverrouiller"
                      action={unlockAccount}
                      fields={{ identifier_hash: l.identifier_hash }}
                    />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Rôles sensibles</CardTitle>
          <CardDescription>Super Admin, direction et comptabilité : état de la double authentification et sessions ouvertes.</CardDescription>
        </CardHeader>
        <Table>
          <THead>
            <tr className="border-t border-border">
              <TH>Compte</TH>
              <TH>Double authentification</TH>
              <TH className="text-right">Sessions</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {o.sensitive_accounts.map((a) => (
              <TR key={a.user_id}>
                <TD>
                  <span className="flex flex-wrap items-center gap-2">
                    {a.email}
                    {a.platform_admin ? <Badge tone="primary">Super Admin</Badge> : null}
                  </span>
                </TD>
                <TD>{a.mfa ? <Badge tone="success">Activée</Badge> : <Badge tone="warning">Non activée</Badge>}</TD>
                <TD className="text-right tabular-nums">{a.sessions}</TD>
                <TD>
                  {a.sessions > 0 ? (
                    <ConfirmAction
                      trigger={<Button size="sm" variant="ghost" className="text-danger">Fermer les sessions</Button>}
                      title="Fermer toutes les sessions de ce compte ?"
                      description="À utiliser si le compte est compromis : il devra se reconnecter sur tous ses appareils."
                      confirmLabel="Fermer les sessions"
                      tone="danger"
                      action={revokeUserSessions}
                      fields={{ user_id: a.user_id }}
                    />
                  ) : null}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Journal de sécurité</CardTitle>
          <CardDescription>30 derniers événements de connexion et d&apos;administration de la plateforme.</CardDescription>
        </CardHeader>
        <Table>
          <THead>
            <tr className="border-t border-border">
              <TH>Date</TH>
              <TH>Événement</TH>
              <TH>Compte</TH>
            </tr>
          </THead>
          <tbody>
            {(events ?? []).map((e) => (
              <TR key={e.id}>
                <TD className="whitespace-nowrap text-xs">{new Date(e.created_at).toLocaleString("fr-FR")}</TD>
                <TD>
                  <span className="flex flex-wrap items-center gap-2">
                    {e.summary}
                    {e.result !== "success" ? <Badge tone="danger">{e.result === "denied" ? "Refusé" : "Échec"}</Badge> : null}
                  </span>
                </TD>
                <TD className="text-xs">{e.actor_email ?? "—"}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
