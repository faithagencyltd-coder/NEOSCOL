import { History, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { isUuid, pageParam, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Journal — Plateforme" };

const PAGE_SIZE = 50;

/** Libellés lisibles des familles d'événements (préfixe de l'action). */
const CATEGORY_LABELS: Record<string, string> = {
  auth: "Connexions et comptes",
  platform: "Actions de la plateforme",
  settings: "Paramètres des établissements",
  billing: "Abonnements",
  membership: "Membres et rôles",
  finance: "Finances",
  student: "Élèves",
  staff: "Personnel",
  staff_attendance: "Pointage du personnel",
  attendance: "Présences",
  learner_attendance: "Présences des apprenants",
  grades: "Notes",
  academic: "Scolarité",
  enrollment: "Inscriptions",
  document: "Documents",
  export: "Exports",
  communication: "Communication",
  sms: "SMS",
  portal: "Portails",
  assistant: "Assistant IA",
  report: "Rapports",
  migration: "Données historiques",
  teacher_access: "Enseignants multi-établissements",
  country_connect: "Country Connect",
  university: "Université",
  training: "Formation professionnelle",
};

const SEVERITY: Record<string, { label: string; tone: "danger" | "warning" | "neutral" }> = {
  high: { label: "Élevée", tone: "danger" },
  medium: { label: "Moyenne", tone: "warning" },
  info: { label: "Information", tone: "neutral" },
};

const RESULT: Record<string, string> = { success: "Réussi", failure: "Échec", denied: "Refusé" };

const date = (value: string | undefined) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined);

/** Journal global : événements de toute la plateforme, filtrables. Le détail métier d'un établissement lui reste réservé. */
export default async function PlatformJournalPage({ searchParams }: PageProps<"/plateforme/journal">) {
  const params = await searchParams;
  const filters = {
    from: date(param(params, "du")),
    to: date(param(params, "au")),
    org: isUuid(param(params, "etablissement")) ? param(params, "etablissement") : undefined,
    actor: param(params, "acteur"),
    category: param(params, "categorie"),
    severity: ["info", "medium", "high"].includes(param(params, "gravite") ?? "") ? param(params, "gravite") : undefined,
    scope: ["platform", "schools"].includes(param(params, "portee") ?? "") ? param(params, "portee")! : "all",
  };
  const page = pageParam(params);
  const supabase = await createClient();
  const [{ data: rows, error }, { data: categories }, { data: orgs }] = await Promise.all([
    supabase.rpc("platform_activity_log", {
      p_from: filters.from,
      p_to: filters.to,
      p_org: filters.org,
      p_actor: filters.actor,
      p_category: filters.category,
      p_severity: filters.severity,
      p_scope: filters.scope,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    supabase.rpc("platform_activity_categories"),
    supabase.from("organizations").select("id, name").order("name"),
  ]);
  const list = rows ?? [];
  const total = Number(list[0]?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ du: filters.from, au: filters.to, etablissement: filters.org, acteur: filters.actor, categorie: filters.category, gravite: filters.severity, portee: filters.scope === "all" ? undefined : filters.scope })) if (v) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    return `/plateforme/journal${q.size ? `?${q}` : ""}`;
  };

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="grid gap-1">
        <h2 className="text-2xl font-bold">Journal général des activités</h2>
        <p className="text-sm text-muted-foreground">
          Connexions, actions de la plateforme, changements de paramètres et de rôles, abonnements, événements de sécurité. Le journal est inaltérable : rien ne peut y être modifié ni effacé. Aucun mot de passe ni clé n&apos;y est enregistré.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="journal-filters">
            <label className="grid gap-1 text-sm font-medium">
              Du
              <Input type="date" name="du" defaultValue={filters.from} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Au
              <Input type="date" name="au" defaultValue={filters.to} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Établissement
              <Select name="etablissement" defaultValue={filters.org ?? ""}>
                <option value="">Tous</option>
                {(orgs ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Utilisateur (e-mail)
              <Input name="acteur" defaultValue={filters.actor} placeholder="ex. direction@" maxLength={100} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Catégorie
              <Select name="categorie" defaultValue={filters.category ?? ""}>
                <option value="">Toutes</option>
                {(categories ?? []).map((c) => (
                  <option key={c.category} value={c.category}>
                    {CATEGORY_LABELS[c.category] ?? c.category} ({c.events})
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Gravité
              <Select name="gravite" defaultValue={filters.severity ?? ""}>
                <option value="">Toutes</option>
                <option value="high">Élevée</option>
                <option value="medium">Moyenne</option>
                <option value="info">Information</option>
              </Select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Origine
              <Select name="portee" defaultValue={filters.scope}>
                <option value="all">Plateforme et établissements</option>
                <option value="platform">Plateforme uniquement</option>
                <option value="schools">Établissements uniquement</option>
              </Select>
            </label>
            <div className="flex items-end gap-2">
              <Button type="submit">Filtrer</Button>
              <Button asChild variant="ghost">
                <Link href="/plateforme/journal">Effacer</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-5 text-primary" aria-hidden /> {total} événement(s)
          </CardTitle>
          <CardDescription>
            <Lock className="mr-1 inline size-3.5" aria-hidden />
            Pour les opérations internes d&apos;un établissement (élèves, notes, finances…), seul le type d&apos;action est affiché : le détail reste réservé à l&apos;établissement.
          </CardDescription>
        </CardHeader>
        {error ? (
          <CardContent>
            <p className="text-sm text-danger">Journal indisponible.</p>
          </CardContent>
        ) : list.length === 0 ? (
          <CardContent>
            <EmptyState icon={History} title="Aucun événement pour ces filtres" />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr className="border-t border-border">
                <TH>Date</TH>
                <TH>Gravité</TH>
                <TH>Catégorie</TH>
                <TH>Événement</TH>
                <TH>Utilisateur</TH>
                <TH>Établissement</TH>
                <TH>Résultat</TH>
              </tr>
            </THead>
            <tbody>
              {list.map((r) => (
                <TR key={r.id} data-testid="journal-row">
                  <TD className="whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString("fr-FR")}</TD>
                  <TD>
                    <Badge tone={SEVERITY[r.severity]?.tone ?? "neutral"}>{SEVERITY[r.severity]?.label ?? r.severity}</Badge>
                  </TD>
                  <TD className="text-xs">{CATEGORY_LABELS[r.category] ?? r.category}</TD>
                  <TD className="max-w-md">
                    <span className="grid">
                      <span className="text-sm">{r.summary ?? <span className="text-muted-foreground">Détail réservé à l&apos;établissement</span>}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{r.action}</span>
                    </span>
                  </TD>
                  <TD className="text-xs">{r.actor_email ?? "Système"}</TD>
                  <TD className="text-xs">{r.organization_name ?? "Plateforme"}</TD>
                  <TD className="text-xs">
                    {r.result === "success" ? RESULT.success : <span className="font-semibold text-danger">{RESULT[r.result] ?? r.result}</span>}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
        {pages > 1 ? (
          <CardContent className="flex items-center justify-between gap-3 border-t border-border pt-4 text-sm">
            <span className="text-muted-foreground">
              Page {page} sur {pages}
            </span>
            <span className="flex gap-2">
              {page > 1 ? (
                <Button asChild size="sm" variant="secondary">
                  <Link href={link(page - 1)}>Précédent</Link>
                </Button>
              ) : null}
              {page < pages ? (
                <Button asChild size="sm" variant="secondary">
                  <Link href={link(page + 1)}>Suivant</Link>
                </Button>
              ) : null}
            </span>
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
