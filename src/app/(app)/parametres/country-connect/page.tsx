import { Download, FileSpreadsheet, Globe2, IdCard, Pencil, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { saveMapping, setNationalId } from "@/features/country-connect/actions";
import { CountryImportPanel } from "@/features/country-connect/components/import-panel";
import { mappingFields } from "@/features/country-connect/mapping-fields";
import { CC_FIELDS, type CcMapping } from "@/features/country-connect/types";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { requireOrganization } from "@/lib/auth/guards";
import { can, canAny } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Country Connect" };

type Overview = { country: string; country_name: string; label: string; pattern: string | null; students: number; with_id: number };

const FIELD_LABEL = new Map<string, string>(CC_FIELDS.map((f) => [f.key, f.label]));
const JOB_STATUS = { checked: "Vérifié", applied: "Appliqué", exported: "Exporté" } as const;

/**
 * Country Connect : échanges avec les systèmes nationaux par fichiers
 * configurables (aucune API inventée). Identifiant national des élèves,
 * exports au format demandé, imports vérifiés avant application, historique.
 */
export default async function CountryConnectPage() {
  const context = await requireOrganization();
  if (!canAny(context, ["students.import", "settings.manage"])) notFound();
  const orgId = context.organization.id;
  const supabase = await createClient();
  const [{ data: overview }, { data: mappings }, { data: jobs }, { data: missing, count: missingCount }] = await Promise.all([
    supabase.rpc("country_connect_overview", { p_org: orgId }),
    supabase.from("country_connect_mappings").select("*").order("direction").order("name"),
    supabase.from("country_connect_jobs").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(20),
    supabase
      .from("students")
      .select("id, matricule, last_name, first_name, birth_date", { count: "exact" })
      .eq("organization_id", orgId)
      .eq("status", "active")
      .is("archived_at", null)
      .is("national_id", null)
      .order("last_name")
      .order("first_name")
      .limit(30),
  ]);
  const o = overview as Overview | null;
  const label = o?.label ?? "Identifiant national";
  const lower = label === label.toUpperCase() ? label : label.toLowerCase();
  // Modèles du pays de l'établissement + correspondances propres (la RLS masque les autres établissements).
  const all = ((mappings ?? []) as unknown as CcMapping[]).filter((m) => m.organization_id === orgId || m.country_code === o?.country);
  const usable = all.filter((m) => m.is_active);
  const canManage = can(context, "settings.manage");
  const canImport = canAny(context, ["students.import", "students.update"]);
  const canUpdate = can(context, "students.update");
  const coverage = o && o.students > 0 ? Math.round((o.with_id / o.students) * 100) : 0;

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Country Connect"
        description="Échanges de fichiers avec les systèmes nationaux (ministère, examens) : formats configurables, vérifiés avant tout enregistrement."
        actions={
          canManage ? (
            <QuickFormDialog
              title="Nouvelle correspondance"
              description="Colonnes du fichier officiel et champ NeoScool correspondant."
              triggerLabel="Nouvelle correspondance"
              action={saveMapping}
              fields={mappingFields(null)}
            />
          ) : null
        }
      />
      <Alert tone="info" title="Aucune connexion directe inventée">
        NeoScool ne se connecte à aucune plateforme nationale sans API officielle publiée. Les échanges se font par fichiers au format demandé par l&apos;administration. Un import ne modifie que le{" "}
        {lower} : l&apos;identité des élèves n&apos;est jamais écrasée.
      </Alert>

      <section className="stagger grid gap-4 sm:grid-cols-3" aria-label="Couverture">
        <StatCard label="Pays" value={o?.country_name ?? "—"} hint={o?.pattern ? `Format ${label} contrôlé` : `${label} : format libre`} icon={Globe2} tone="primary" />
        <StatCard label={`Élèves avec ${lower}`} value={{ count: o?.with_id ?? 0 }} hint={`sur ${o?.students ?? 0} élève(s) actif(s) — ${coverage} %`} icon={IdCard} tone="success" />
        <StatCard label="À compléter" value={{ count: missingCount ?? 0 }} hint="Import d'un fichier officiel ou saisie manuelle" icon={Users} tone="warning" />
      </section>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Correspondances</CardTitle>
          <CardDescription>Modèles fournis pour {o?.country_name ?? "votre pays"} par NeoScool, et formats propres à l&apos;établissement.</CardDescription>
        </CardHeader>
        {all.length === 0 ? (
          <CardContent>
            <EmptyState icon={FileSpreadsheet} title="Aucune correspondance" description="Créez le format du fichier demandé par votre administration (colonnes et séparateur)." />
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <tr className="border-t border-border">
                  <TH>Nom</TH>
                  <TH>Sens</TH>
                  <TH className="hidden md:table-cell">Colonnes</TH>
                  <TH />
                </tr>
              </THead>
              <tbody>
                {all.map((m) => (
                  <TR key={m.id}>
                    <TD>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{m.name}</span>
                        {m.country_code ? <Badge tone="primary">Modèle {m.country_code}</Badge> : null}
                        {!m.is_active ? <Badge>Inactive</Badge> : null}
                      </span>
                      {m.description ? <span className="block text-xs text-muted-foreground">{m.description}</span> : null}
                      <span className="block text-xs text-muted-foreground md:hidden">{m.columns.map((c) => c.header).join(" · ")}</span>
                    </TD>
                    <TD>{m.direction === "import" ? "Import" : "Export"}</TD>
                    <TD className="hidden text-xs text-muted-foreground md:table-cell">{m.columns.map((c) => `${c.header} → ${FIELD_LABEL.get(c.field) ?? c.field}`).join(" · ")}</TD>
                    <TD>
                      <span className="flex justify-end gap-1">
                        {m.direction === "export" && m.is_active ? (
                          <Button asChild size="sm" variant="secondary">
                            <a href={`/api/country-connect/export/${m.id}`} download>
                              <Download aria-hidden /> Exporter
                            </a>
                          </Button>
                        ) : null}
                        {canManage && m.organization_id === orgId ? (
                          <QuickFormDialog
                            title={`Modifier — ${m.name}`}
                            trigger={
                              <Button size="sm" variant="ghost" aria-label={`Modifier ${m.name}`}>
                                <Pencil aria-hidden />
                              </Button>
                            }
                            action={saveMapping}
                            fields={mappingFields(m)}
                            hidden={{ id: m.id }}
                          />
                        ) : null}
                      </span>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      {canImport ? (
        <Card>
          <CardHeader>
            <CardTitle>Importer un fichier officiel</CardTitle>
            <CardDescription>
              Les élèves sont retrouvés par matricule NeoScool, ou par nom, prénom et date de naissance. Vérifiez d&apos;abord : rien n&apos;est enregistré avant votre confirmation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {usable.some((m) => m.direction === "import") ? (
              <CountryImportPanel mappings={usable.filter((m) => m.direction === "import").map((m) => ({ id: m.id, name: m.name }))} label={label} />
            ) : (
              <EmptyState icon={FileSpreadsheet} title="Aucune correspondance d'import active" description="Créez d'abord le format du fichier reçu." />
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Élèves sans {lower}</CardTitle>
          <CardDescription>
            {missingCount ? `${missingCount} élève(s) actif(s)${missingCount > 30 ? " — les 30 premiers" : ""}.` : "Tous les élèves actifs ont un identifiant."}
            {o?.pattern ? " Le format est contrôlé à l'enregistrement." : null}
          </CardDescription>
        </CardHeader>
        {missing?.length ? (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <tr className="border-t border-border">
                  <TH>Élève</TH>
                  <TH>Matricule</TH>
                  <TH className="hidden sm:table-cell">Naissance</TH>
                  <TH />
                </tr>
              </THead>
              <tbody>
                {missing.map((s) => (
                  <TR key={s.id}>
                    <TD>
                      <Link href={`/eleves/${s.id}`} className="font-medium hover:underline">
                        {s.last_name} {s.first_name}
                      </Link>
                    </TD>
                    <TD className="font-mono text-xs">{s.matricule}</TD>
                    <TD className="hidden text-xs sm:table-cell">{s.birth_date ? new Date(s.birth_date).toLocaleDateString("fr-FR") : "—"}</TD>
                    <TD>
                      {canUpdate ? (
                        <QuickFormDialog
                          title={`${label} — ${s.last_name} ${s.first_name}`}
                          trigger={
                            <Button size="sm" variant="secondary">
                              Saisir
                            </Button>
                          }
                          action={setNationalId}
                          hidden={{ student_id: s.id }}
                          fields={[{ name: "national_id", label, required: true, wide: true }]}
                        />
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Historique des échanges</CardTitle>
          <CardDescription>Chaque export, vérification et import est conservé et journalisé.</CardDescription>
        </CardHeader>
        {jobs?.length ? (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <tr className="border-t border-border">
                  <TH>Date</TH>
                  <TH>Correspondance</TH>
                  <TH className="hidden sm:table-cell">Fichier</TH>
                  <TH>Résultat</TH>
                </tr>
              </THead>
              <tbody>
                {jobs.map((j) => (
                  <TR key={j.id}>
                    <TD className="whitespace-nowrap text-xs">{new Date(j.created_at).toLocaleString("fr-FR")}</TD>
                    <TD>{j.mapping_name}</TD>
                    <TD className="hidden text-xs sm:table-cell">{j.file_name ?? "—"}</TD>
                    <TD>
                      <span className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge tone={j.status === "applied" ? "success" : j.status === "exported" ? "primary" : "neutral"}>{JOB_STATUS[j.status as keyof typeof JOB_STATUS]}</Badge>
                        {j.direction === "export"
                          ? `${j.total_rows} élève(s)`
                          : `${j.ok_rows} valide(s), ${j.error_rows} erreur(s)${j.status === "applied" ? `, ${j.updated_rows} enregistré(s)` : ""}`}
                      </span>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        ) : (
          <CardContent>
            <EmptyState icon={FileSpreadsheet} title="Aucun échange pour l'instant" />
          </CardContent>
        )}
      </Card>
    </div>
  );
}
