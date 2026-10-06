import { Archive, GitCommitHorizontal, History, Wrench } from "lucide-react";
import type { Metadata } from "next";

import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { setMaintenance } from "@/features/platform/team-actions";
import { canWritePlatform, getPlatformRole } from "@/lib/auth/platform";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Maintenance — Plateforme" };
export const dynamic = "force-dynamic";

type Backup = { inserted_at: string; status: string; is_physical_backup?: boolean };

/**
 * Sauvegardes : lues chez l'hébergeur de la base si un jeton d'accès en lecture
 * est configuré sur le serveur (variables SUPABASE_ACCESS_TOKEN et
 * SUPABASE_PROJECT_REF, jamais affichées). Sinon : rien n'est inventé.
 */
async function loadBackups(): Promise<{ configured: boolean; backups: Backup[]; pitr: boolean | null; error: string | null }> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!token || !ref) return { configured: false, backups: [], pitr: null, error: null };
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/database/backups`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { configured: true, backups: [], pitr: null, error: `L'hébergeur a répondu ${res.status}.` };
    const body = (await res.json()) as { backups?: Backup[]; pitr_enabled?: boolean };
    return { configured: true, backups: (body.backups ?? []).sort((a, b) => b.inserted_at.localeCompare(a.inserted_at)).slice(0, 10), pitr: body.pitr_enabled ?? null, error: null };
  } catch {
    return { configured: true, backups: [], pitr: null, error: "Hébergeur injoignable." };
  }
}

/** Maintenance : mode maintenance, version en service et historique, sauvegardes et procédures. */
export default async function PlatformMaintenancePage() {
  const supabase = await createClient();
  const [{ data: m }, { data: releases }, role, backups] = await Promise.all([
    supabase.from("platform_maintenance").select("enabled, message, ends_at, updated_at").eq("id", 1).maybeSingle(),
    supabase.rpc("platform_release_history"),
    getPlatformRole(),
    loadBackups(),
  ]);
  const writable = canWritePlatform(role);
  const active = Boolean(m?.enabled && (!m.ends_at || new Date(m.ends_at) > new Date()));
  const lastBackup = backups.backups[0];

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="grid gap-1">
        <h2 className="text-2xl font-bold">Maintenance et versions</h2>
        <p className="text-sm text-muted-foreground">Aucune mise à jour, restauration ni retour arrière n&apos;est déclenché depuis cette page : ces opérations se font chez l&apos;hébergeur, avec votre autorisation explicite.</p>
      </div>

      <Card className={active ? "border-warning/50" : ""}>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle className="flex items-center gap-2">
              <Wrench className="size-5 text-primary" aria-hidden /> Mode maintenance {active ? <Badge tone="warning">Actif</Badge> : <Badge tone="success">Désactivé</Badge>}
            </CardTitle>
            <CardDescription>
              Pendant une maintenance, les établissements et les portails affichent un message ; l&apos;équipe de la plateforme garde l&apos;accès. Prévenez à l&apos;avance avec une annonce (Communication).
            </CardDescription>
          </div>
          {writable ? (
            <QuickFormDialog
              title={active ? "Désactiver ou modifier la maintenance" : "Activer le mode maintenance"}
              trigger={<Button variant={active ? "secondary" : "primary"} data-testid="maintenance-toggle">{active ? "Modifier / désactiver" : "Activer"}</Button>}
              action={setMaintenance}
              fields={[
                { name: "enabled", label: "Maintenance active", type: "checkbox", wide: true, defaultValue: active ? "false" : "true" },
                { name: "message", label: "Message affiché aux utilisateurs", type: "textarea", wide: true, defaultValue: m?.message ?? "" },
                { name: "end_date", label: "Fin prévue — date (facultatif)", type: "date" },
                { name: "end_time", label: "Heure (GMT)", type: "time" },
                { name: "reason", label: "Motif (journal)", type: "text", required: true, wide: true },
              ]}
            />
          ) : null}
        </CardHeader>
        <CardContent className="text-sm">
          <p className="rounded-xl bg-surface-muted px-3 py-2">« {m?.message} »</p>
          {active && m?.ends_at ? <p className="mt-2 text-muted-foreground">Fin prévue : {formatDateTime(m.ends_at)}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitCommitHorizontal className="size-5 text-primary" aria-hidden /> Version en service
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm" data-testid="app-version">
            <p>
              Version <span className="font-semibold">{process.env.APP_VERSION ?? "inconnue"}</span>
              {process.env.APP_COMMIT ? <span className="font-mono text-xs text-muted-foreground"> · {process.env.APP_COMMIT}</span> : null}
            </p>
            <p className="text-muted-foreground">Construite le {process.env.APP_BUILT_AT ? formatDateTime(process.env.APP_BUILT_AT) : "—"}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Retour à une version précédente : depuis l&apos;hébergeur de l&apos;application (par exemple « Instant Rollback » sur Vercel), en choisissant le déploiement correspondant au commit voulu. Les migrations de base ne sont jamais annulées automatiquement.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Archive className="size-5 text-primary" aria-hidden /> Sauvegardes de la base
            </CardTitle>
            <CardDescription>Réalisées par l&apos;hébergeur de la base de données (Supabase).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm" data-testid="backups">
            {!backups.configured ? (
              <>
                <Badge tone="warning">Suivi non connecté</Badge>
                <p>
                  Les sauvegardes quotidiennes sont faites par l&apos;hébergeur (selon l&apos;offre souscrite). Pour afficher ici la date et l&apos;état des dernières sauvegardes, configurez sur le serveur un jeton d&apos;accès en lecture (<span className="font-mono text-xs">SUPABASE_ACCESS_TOKEN</span> et{" "}
                  <span className="font-mono text-xs">SUPABASE_PROJECT_REF</span>). Il ne sera jamais affiché.
                </p>
              </>
            ) : backups.error ? (
              <p className="text-danger">Lecture impossible : {backups.error}</p>
            ) : (
              <>
                <p>
                  Dernière sauvegarde : <span className="font-semibold">{lastBackup ? formatDateTime(lastBackup.inserted_at) : "aucune"}</span>
                  {lastBackup ? <Badge tone={lastBackup.status === "COMPLETED" ? "success" : "warning"} className="ml-2">{lastBackup.status}</Badge> : null}
                </p>
                <p className="text-muted-foreground">Restauration à un instant précis (PITR) : {backups.pitr == null ? "inconnue" : backups.pitr ? "activée" : "non activée"}.</p>
                <ul className="grid gap-0.5 text-xs text-muted-foreground">
                  {backups.backups.slice(1).map((b) => (
                    <li key={b.inserted_at}>
                      {formatDateTime(b.inserted_at)} — {b.status}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Procédure de restauration (jamais automatique) : 1) activer le mode maintenance ; 2) chez l&apos;hébergeur, choisir la sauvegarde et restaurer après accord écrit du propriétaire ; 3) vérifier les comptes de test ; 4) désactiver la maintenance.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-5 text-primary" aria-hidden /> Historique des mises en service
          </CardTitle>
          <CardDescription>Enregistré automatiquement à chaque démarrage d&apos;une nouvelle version, avec les erreurs et demandes d&apos;assistance constatées pendant sa période de service.</CardDescription>
        </CardHeader>
        {(releases ?? []).length ? (
          <Table data-testid="release-history">
            <THead>
              <tr className="border-t border-border">
                <TH>Version</TH>
                <TH>Mise en service</TH>
                <TH>Dernier démarrage</TH>
                <TH className="text-right">Erreurs</TH>
                <TH className="text-right">Accès refusés</TH>
                <TH className="text-right">Demandes</TH>
              </tr>
            </THead>
            <tbody>
              {(releases ?? []).map((r) => (
                <TR key={`${r.version}-${r.commit_sha}`}>
                  <TD>
                    <span className="font-semibold">{r.version}</span> <span className="font-mono text-xs text-muted-foreground">{r.commit_sha}</span>
                  </TD>
                  <TD className="text-xs">{formatDateTime(r.first_seen_at)}</TD>
                  <TD className="text-xs">{formatDateTime(r.last_seen_at)}</TD>
                  <TD className="text-right tabular-nums">{r.failures}</TD>
                  <TD className="text-right tabular-nums">{r.denied}</TD>
                  <TD className="text-right tabular-nums">{r.incidents}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <CardContent className="text-sm text-muted-foreground">Aucune version enregistrée pour l&apos;instant (enregistrement au prochain démarrage du serveur).</CardContent>
        )}
      </Card>
    </div>
  );
}
