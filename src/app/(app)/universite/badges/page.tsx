import { IdCard, Printer, RefreshCcw, ShieldOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkSelect } from "@/components/shared/link-select";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { issuePromotionBadges, issueStudentBadge, revokeStudentBadge } from "@/features/university/actions";
import { UniversityHeader } from "@/features/university/components/university-header";
import { requireUniversity } from "@/features/university/guard";
import { promotions, studentBadges } from "@/features/university/queries";
import { can } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils/format";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Badges étudiants" };

export default async function StudentBadgesPage({ searchParams }: PageProps<"/universite/badges">) {
  const context = await requireUniversity(["students.badges.manage"], "badges");
  const organization = context.organization;
  const params = await searchParams;
  const requested = param(params, "promotion");
  const sessionId = isUuid(requested) ? requested : undefined;
  const search = param(params, "q")?.slice(0, 80);
  const [sessions, rows] = await Promise.all([promotions(organization.id), studentBadges(organization.id, { classId: sessionId, query: search })]);
  const manage = can(context, "students.badges.manage");
  const missing = rows.filter((r) => !r.active && r.student.status === "active").length;

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <UniversityHeader
        title="Badges étudiants"
        description="Badge personnel avec QR code unique : logo, photo, nom, matricule, filière, niveau, année académique. Un badge perdu est désactivé et remplacé par un nouveau QR ; l'ancien ne scanne plus et l'historique est conservé."
        actions={
          sessionId ? (
            <>
              <Button asChild variant="secondary" size="sm">
                <a href={`/api/documents/badges-apprenants?session=${sessionId}`} target="_blank" rel="noreferrer">
                  <Printer aria-hidden /> Imprimer les badges de la promotion
                </a>
              </Button>
              {manage && missing > 0 ? (
                <ConfirmAction
                  trigger={
                    <Button size="sm">
                      <IdCard aria-hidden /> Générer les badges manquants ({missing})
                    </Button>
                  }
                  title="Générer les badges manquants ?"
                  confirmLabel="Générer"
                  action={issuePromotionBadges}
                  fields={{ class_id: sessionId }}
                />
              ) : null}
            </>
          ) : null
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <LinkSelect
          label="Promotion"
          className="w-full sm:w-80"
          value={sessionId ?? ""}
          options={[
            { value: "", label: "Toutes les promotions", href: "/universite/badges" },
            ...sessions.filter((s) => s.academic_year?.is_current).map((s) => ({ value: s.id, label: s.name, href: `/universite/badges?promotion=${s.id}` })),
          ]}
        />
        <form className="flex flex-wrap items-end gap-2" action="/universite/badges">
          {sessionId ? <input type="hidden" name="promotion" value={sessionId} /> : null}
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
          <EmptyState icon={IdCard} title="Aucun étudiant inscrit" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Étudiant</TH>
                <TH>Filière / niveau</TH>
                <TH>Badge actif</TH>
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
                  <TD className="text-sm">
                    <span className="grid">
                      <span>{r.program ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">
                        {r.level ?? ""} · {r.promotion}
                      </span>
                    </span>
                  </TD>
                  <TD>
                    {r.active ? (
                      <span className="grid">
                        <Badge tone="success">{r.active.number}</Badge>
                        <span className="text-xs text-muted-foreground">
                          Émis le {formatDate(r.active.issued_at, "fr-FR", { dateStyle: "short" })} · imprimé {r.active.printed_count} fois
                        </span>
                      </span>
                    ) : (
                      <Badge tone="neutral">Aucun badge actif</Badge>
                    )}
                  </TD>
                  <TD className="text-sm text-muted-foreground">{r.replaced ? `${r.replaced} ancien(s) badge(s) désactivé(s)` : "—"}</TD>
                  <TD>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {r.active ? (
                        <Button asChild variant="ghost" size="sm">
                          <a href={`/api/documents/badges-apprenants/${r.student.id}`} target="_blank" rel="noreferrer">
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
                          title={r.active ? "Remplacer ce badge ?" : "Générer le badge ?"}
                          description={r.active ? "L'ancien badge est désactivé immédiatement (il ne scanne plus) ; un nouveau QR est créé. L'historique est conservé." : "Un badge étudiant avec un QR personnel est créé."}
                          confirmLabel={r.active ? "Désactiver et remplacer" : "Générer"}
                          action={issueStudentBadge}
                          fields={{ student_id: r.student.id }}
                          reason={r.active ? { label: "Motif (badge perdu, abîmé…)", required: true } : undefined}
                        />
                      ) : null}
                      {manage && r.active ? (
                        <ConfirmAction
                          trigger={
                            <Button variant="ghost" size="sm" className="text-danger">
                              <ShieldOff aria-hidden /> Désactiver
                            </Button>
                          }
                          title="Désactiver ce badge ?"
                          description="Le QR ne sera plus accepté par la tablette. Aucun badge de remplacement n'est créé."
                          confirmLabel="Désactiver"
                          tone="danger"
                          action={revokeStudentBadge}
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
