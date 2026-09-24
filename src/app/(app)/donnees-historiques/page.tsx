import { Archive, ArrowRight, Award, CalendarRange, FileSpreadsheet, GraduationCap, History, Plus, Shuffle, Upload, UserRoundPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { createPastYears } from "@/features/migration/actions";
import { BATCH_STATUS, IMPORT_KINDS } from "@/features/migration/fields";
import { getHistoricalOverview, listImportBatches } from "@/features/migration/queries";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { vocabularyFor } from "@/lib/vocabulary";

export const metadata: Metadata = { title: "Données historiques" };

/** Tableau de bord de la migration : anciens élèves, années disponibles, historique des imports. */
export default async function HistoricalDataPage() {
  const context = await requirePermission("students.import");
  const organizationId = context.organization.id;
  const v = vocabularyFor(context.organization.type);
  const [overview, batches] = await Promise.all([getHistoricalOverview(organizationId), listImportBatches(organizationId)]);
  const pastYears = overview.years.filter((y) => y.status === "closed" || (!y.is_current && y.status !== "planned"));
  const thisYear = new Date().getFullYear();
  const students = v.students.toLowerCase();

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">Établissement · Migration</p>
          <h1 className="text-2xl font-semibold sm:text-[26px]">Données historiques</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Intégrez l&apos;historique de l&apos;établissement sans rien perdre : anciens {students}, années scolaires, parcours, notes, paiements et diplômes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <QuickFormDialog
            title="Créer les anciennes années scolaires"
            description="Crée les années manquantes, clôturées (1er septembre → 31 juillet). Les années existantes ne sont pas modifiées."
            trigger={
              <Button variant="secondary">
                <CalendarRange aria-hidden /> Anciennes années
              </Button>
            }
            submitLabel="Créer les années"
            action={createPastYears}
            fields={[
              { name: "from", label: "Première année (ex. 2015 pour 2015-2016)", type: "number", required: true, min: 1950, max: thisYear, defaultValue: String(thisYear - 10) },
              { name: "to", label: "Dernière année", type: "number", required: true, min: 1950, max: thisYear, defaultValue: String(thisYear - 1) },
            ]}
          />
          {can(context, "students.create") ? (
            <Button asChild variant="secondary">
              <Link href="/donnees-historiques/ancien-eleve">
                <UserRoundPlus aria-hidden /> Ajouter un ancien {v.student.toLowerCase()}
              </Link>
            </Button>
          ) : null}
          <Button asChild>
            <Link href="/donnees-historiques/importer">
              <Upload aria-hidden /> Importer (Excel / CSV)
            </Link>
          </Button>
        </div>
      </div>

      <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label={`Anciens ${students}`} value={{ count: overview.former_total }} hint={`${overview.imported} importés · ${overview.manual} saisis`} icon={History} tone="primary" />
        <StatCard label="Diplômés" value={{ count: overview.graduated }} hint={`${overview.diplomas} diplôme(s) enregistré(s)`} icon={GraduationCap} tone="success" />
        <StatCard label="Transférés" value={{ count: overview.transferred }} hint={`${overview.withdrawn} retiré(s)`} icon={Shuffle} tone="info" />
        <StatCard label="Archivés" value={{ count: overview.archived }} hint="Dossiers conservés" icon={Archive} tone="warning" />
        <StatCard label="Années scolaires" value={{ count: overview.years.length }} hint={`${pastYears.length} ancienne(s)`} icon={CalendarRange} tone="primary" />
      </div>

      <div className="anim-fade-up grid gap-4 lg:grid-cols-3" style={{ "--delay": "160ms" } as React.CSSProperties}>
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Années scolaires disponibles</CardTitle>
            <CardDescription>Parcours historiques et inscriptions par année</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.years.length === 0 ? (
              <EmptyState icon={CalendarRange} title="Aucune année" description="Créez les anciennes années ou importez un fichier : elles sont créées automatiquement." />
            ) : (
              <ul className="stagger grid max-h-[26rem] gap-1.5 overflow-y-auto pr-1">
                {overview.years.map((y) => (
                  <li key={y.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm transition-colors hover:bg-surface-muted/60">
                    <span className="flex items-center gap-2 font-semibold tabular-nums">
                      {y.name}
                      {y.is_current ? <Badge tone="success">En cours</Badge> : y.status === "closed" ? <Badge>Clôturée</Badge> : null}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {y.history} parcours · {y.enrollments} inscr.
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden lg:col-span-2">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div className="grid gap-1">
              <CardTitle>Historique des migrations</CardTitle>
              <CardDescription>Chaque import : date, administrateur, fichier, lignes, résultats</CardDescription>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {Object.entries(IMPORT_KINDS).map(([kind, k]) => (
                <a key={kind} href={`/api/migration/modele/${kind}`} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 font-medium transition-colors hover:border-primary hover:text-primary">
                  <FileSpreadsheet className="size-3.5" aria-hidden /> Modèle « {k.label.split(" ")[0]} {k.label.split(" ")[1] ?? ""} »
                </a>
              ))}
            </div>
          </CardHeader>
          {batches.length === 0 ? (
            <CardContent>
              <EmptyState
                icon={Upload}
                title="Aucun import pour le moment"
                description="Téléchargez un modèle ou importez directement votre fichier Excel / CSV : les colonnes sont reconnues automatiquement."
                action={
                  <Button asChild size="sm">
                    <Link href="/donnees-historiques/importer">
                      <Plus aria-hidden /> Premier import
                    </Link>
                  </Button>
                }
              />
            </CardContent>
          ) : (
            <Table>
              <THead>
                <tr className="border-t border-border">
                  <TH>Date</TH>
                  <TH>Fichier</TH>
                  <TH className="text-right">Lignes</TH>
                  <TH className="text-right">Importées</TH>
                  <TH className="text-right">Doublons</TH>
                  <TH className="text-right">Rejetées</TH>
                  <TH>Statut</TH>
                  <TH />
                </tr>
              </THead>
              <tbody>
                {batches.map((b) => {
                  const author = b.author ? [b.author.first_name, b.author.last_name].filter(Boolean).join(" ") || b.author.email : "—";
                  const href = b.status === "completed" || b.status === "cancelled" ? `/donnees-historiques/imports/${b.id}` : `/donnees-historiques/importer?lot=${b.id}`;
                  return (
                    <TR key={b.id}>
                      <TD>
                        <span className="grid whitespace-nowrap">
                          <span className="tabular-nums">
                            {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: context.organization.timezone }).format(new Date(b.created_at))}
                          </span>
                          <span className="text-xs text-muted-foreground">{author}</span>
                        </span>
                      </TD>
                      <TD>
                        <span className="grid min-w-[9rem] max-w-[16rem]">
                          <span className="truncate font-medium">{b.file_name}</span>
                          <span className="text-xs text-muted-foreground">{IMPORT_KINDS[b.kind]?.label}</span>
                        </span>
                      </TD>
                      <TD className="text-right tabular-nums">{b.row_count}</TD>
                      <TD className="text-right font-semibold tabular-nums text-success">{b.stats.imported ?? "—"}</TD>
                      <TD className="text-right tabular-nums">{b.stats.duplicates ?? "—"}</TD>
                      <TD className={`text-right tabular-nums ${(b.stats.rejected ?? b.stats.invalid ?? 0) > 0 ? "text-danger" : ""}`}>{b.stats.rejected ?? b.stats.invalid ?? "—"}</TD>
                      <TD>
                        <StatusBadge value={b.status} map={BATCH_STATUS} />
                      </TD>
                      <TD>
                        <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                          {b.status === "completed" || b.status === "cancelled" ? "Rapport" : "Reprendre"} <ArrowRight className="size-3.5" aria-hidden />
                        </Link>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card className="anim-fade-up" style={{ "--delay": "240ms" } as React.CSSProperties}>
        <CardHeader>
          <CardTitle>Où retrouver les données migrées ?</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          {[
            { href: "/eleves?vue=anciens", icon: History, title: `Anciens ${students}`, text: "Onglets Anciens, Diplômés, Transférés et Archivés de la liste." },
            { href: "/eleves?vue=diplomes", icon: Award, title: "Diplômés", text: "Diplômes et certificats dans l'onglet « Parcours antérieur » du dossier." },
            { href: "/eleves?vue=archives", icon: Archive, title: "Archivés", text: "Dossiers conservés, consultables et restaurables." },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="hover-lift group flex gap-3 rounded-xl border border-border p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary transition-transform duration-200 group-hover:scale-110">
                <item.icon className="size-5" aria-hidden />
              </span>
              <span className="grid gap-0.5">
                <span className="font-semibold">{item.title}</span>
                <span className="text-muted-foreground">{item.text}</span>
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
