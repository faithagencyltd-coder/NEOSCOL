import { IdCard, Printer, RefreshCcw, ShieldOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkSelect } from "@/components/shared/link-select";
import { PageHeader } from "@/components/shared/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { issueCard, issueClassCards, regenerateCardQr, revokeCard } from "@/features/cards/actions";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils/format";
import { isUuid, param } from "@/lib/utils/search-params";
import { vocabularyFor } from "@/lib/vocabulary";

export const metadata: Metadata = { title: "Cartes scolaires" };

/** Module scolaire : cartes des élèves, par classe (génération groupée, impression, remplacement). */
export default async function SchoolCardsPage({ searchParams }: PageProps<"/eleves/cartes">) {
  const context = await requirePermission("students.badges.manage");
  if (vocabularyFor(context.organization.type).family !== "school") notFound();
  const organization = context.organization;
  const params = await searchParams;
  const requested = param(params, "classe");
  const classId = isUuid(requested) ? requested : undefined;
  const search = param(params, "q")?.slice(0, 80);
  const supabase = await createClient();

  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, academic_year:academic_years!inner(is_current)")
    .eq("organization_id", organization.id)
    .eq("academic_year.is_current", true)
    .order("name");
  let enrollmentQuery = supabase
    .from("enrollments")
    .select("class:classes!inner(id, name, academic_year:academic_years!inner(is_current)), student:students!inner(id, first_name, last_name, matricule, photo_path, status, archived_at)")
    .eq("organization_id", organization.id)
    .eq("status", "validated")
    .eq("class.academic_year.is_current", true)
    .is("student.archived_at", null);
  if (classId) enrollmentQuery = enrollmentQuery.eq("class_id", classId);
  if (search) enrollmentQuery = enrollmentQuery.or(`last_name.ilike.%${search.replace(/[%,()]/g, "")}%,matricule.ilike.%${search.replace(/[%,()]/g, "")}%`, { referencedTable: "student" });
  const { data: enrollments } = await enrollmentQuery.limit(500);
  const ids = [...new Set((enrollments ?? []).map((e) => e.student.id))];
  const { data: badges } = ids.length
    ? await supabase.from("student_badges").select("student_id, number, status, issued_at, printed_count").eq("organization_id", organization.id).in("student_id", ids)
    : { data: [] };
  const rows = (enrollments ?? [])
    .map((e) => ({
      student: e.student,
      className: e.class.name,
      active: (badges ?? []).find((b) => b.student_id === e.student.id && b.status === "active") ?? null,
      replaced: (badges ?? []).filter((b) => b.student_id === e.student.id && b.status === "revoked").length,
    }))
    .sort((a, b) => `${a.student.last_name} ${a.student.first_name}`.localeCompare(`${b.student.last_name} ${b.student.first_name}`, "fr"));
  const manage = can(context, "students.badges.manage");
  const missing = rows.filter((r) => !r.active && r.student.status === "active").length;

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Cartes scolaires"
        description="Carte scolaire 3D avec photo, classe, QR code et code-barres, au design de l'établissement (Paramètres › Cartes et badges). Une carte perdue est désactivée et remplacée ; l'ancienne ne scanne plus."
        actions={
          classId ? (
            <>
              <Button asChild variant="secondary" size="sm">
                <a href={`/api/documents/badges-apprenants?session=${classId}`} target="_blank" rel="noreferrer">
                  <Printer aria-hidden /> Imprimer les cartes de la classe
                </a>
              </Button>
              {manage && missing > 0 ? (
                <ConfirmAction
                  trigger={
                    <Button size="sm">
                      <IdCard aria-hidden /> Générer les cartes manquantes ({missing})
                    </Button>
                  }
                  title="Générer les cartes manquantes ?"
                  confirmLabel="Générer"
                  action={issueClassCards}
                  fields={{ class_id: classId }}
                />
              ) : null}
            </>
          ) : null
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <LinkSelect
          label="Classe"
          className="w-full sm:w-80"
          value={classId ?? ""}
          options={[
            { value: "", label: "Toutes les classes", href: "/eleves/cartes" },
            ...(classes ?? []).map((c) => ({ value: c.id, label: c.name, href: `/eleves/cartes?classe=${c.id}` })),
          ]}
        />
        <form className="flex flex-wrap items-end gap-2" action="/eleves/cartes">
          {classId ? <input type="hidden" name="classe" value={classId} /> : null}
          <label className="grid gap-1.5 text-sm font-medium">
            Rechercher
            <input name="q" defaultValue={search} placeholder="Nom ou matricule" className="h-12 w-full max-w-64 rounded-xl border border-input bg-surface px-3 text-sm" />
          </label>
          <Button type="submit" variant="secondary">
            Chercher
          </Button>
        </form>
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={IdCard} title="Aucun élève inscrit" description="Les cartes sont proposées aux élèves inscrits (inscription validée) de l'année en cours." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Élève</TH>
                <TH>Classe</TH>
                <TH>Carte active</TH>
                <TH>Historique</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.student.id}>
                  <TD>
                    <Link href={`/eleves/${r.student.id}?onglet=badge`} className="flex items-center gap-3 hover:text-primary">
                      <Avatar name={`${r.student.first_name} ${r.student.last_name}`} photoId={r.student.photo_path} className="size-9" />
                      <span className="grid">
                        <span className="font-medium">
                          {r.student.last_name} {r.student.first_name}
                        </span>
                        <span className="text-xs text-muted-foreground">{r.student.matricule}</span>
                      </span>
                    </Link>
                  </TD>
                  <TD className="text-sm">{r.className}</TD>
                  <TD>
                    {r.active ? (
                      <span className="grid">
                        <Badge tone="success">{r.active.number}</Badge>
                        <span className="text-xs text-muted-foreground">
                          Émise le {formatDate(r.active.issued_at, "fr-FR", { dateStyle: "short" })} · imprimée {r.active.printed_count} fois
                        </span>
                      </span>
                    ) : (
                      <Badge tone="neutral">Aucune carte active</Badge>
                    )}
                  </TD>
                  <TD className="text-sm text-muted-foreground">{r.replaced ? `${r.replaced} ancienne(s) carte(s) désactivée(s)` : "—"}</TD>
                  <TD>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {r.active ? (
                        <Button asChild variant="ghost" size="sm">
                          <a href={`/api/cartes/${r.student.id}/pdf`} target="_blank" rel="noreferrer">
                            <Printer aria-hidden /> {r.active.printed_count > 0 ? "Réimprimer" : "Imprimer"}
                          </a>
                        </Button>
                      ) : null}
                      {manage && r.student.status === "active" ? (
                        <ConfirmAction
                          trigger={
                            <Button variant="ghost" size="sm">
                              <RefreshCcw aria-hidden /> {r.active ? "Remplacer" : "Générer"}
                            </Button>
                          }
                          title={r.active ? "Remplacer cette carte ?" : "Générer la carte ?"}
                          description={r.active ? "L'ancienne carte est désactivée immédiatement (elle ne scanne plus) ; une nouvelle carte avec un nouveau QR est créée." : "Une carte scolaire avec un QR personnel est créée."}
                          confirmLabel={r.active ? "Désactiver et remplacer" : "Générer"}
                          action={r.active ? regenerateCardQr : issueCard}
                          fields={{ student_id: r.student.id }}
                          reason={r.active ? { label: "Motif (carte perdue, abîmée…)", required: true } : undefined}
                        />
                      ) : null}
                      {manage && r.active ? (
                        <ConfirmAction
                          trigger={
                            <Button variant="ghost" size="sm" className="text-danger">
                              <ShieldOff aria-hidden /> Désactiver
                            </Button>
                          }
                          title="Désactiver cette carte ?"
                          description="Le QR ne sera plus accepté par la tablette. Aucune carte de remplacement n'est créée."
                          confirmLabel="Désactiver"
                          tone="danger"
                          action={revokeCard}
                          fields={{ student_id: r.student.id }}
                          reason={{ label: "Motif", required: true }}
                        />
                      ) : null}
                    </div>
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
