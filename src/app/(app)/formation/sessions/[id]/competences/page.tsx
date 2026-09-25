import { Award } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { evaluateCompetency } from "@/features/training/actions";
import { COMPETENCY_LEVELS } from "@/features/training/config";
import { requireTraining } from "@/features/training/guard";
import { can } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Compétences de la session" };

/**
 * Grille d'évaluation des compétences d'une session : un apprenant par ligne,
 * une compétence visée par colonne. Le formateur n'accède qu'à ses sessions (RLS).
 */
export default async function SessionCompetenciesPage({ params }: PageProps<"/formation/sessions/[id]/competences">) {
  const context = await requireTraining("grades.enter", "grades.manage");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("classes")
    .select("id, name, kind, program:programs(id, name)")
    .eq("organization_id", context.organization.id)
    .eq("id", id)
    .maybeSingle();
  if (!session || session.kind !== "training_session" || !session.program) notFound();
  const [{ data: catalog }, { data: enrollments }] = await Promise.all([
    supabase.from("training_competencies").select("id, name, sequence").eq("program_id", session.program.id).eq("is_active", true).order("sequence").order("name"),
    supabase.from("enrollments").select("id, student:students(id, matricule, first_name, last_name)").eq("class_id", id).eq("status", "validated"),
  ]);
  const learners = (enrollments ?? []).filter((e) => e.student).sort((a, b) => a.student!.last_name.localeCompare(b.student!.last_name, "fr"));
  const { data: evaluations } = learners.length
    ? await supabase.from("learner_competencies").select("enrollment_id, competency_id, level, comment").in("enrollment_id", learners.map((l) => l.id))
    : { data: [] };
  const byKey = new Map((evaluations ?? []).map((e) => [`${e.enrollment_id}:${e.competency_id}`, e]));
  const editable = can(context, "grades.enter") || can(context, "grades.manage");

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
        <Link href={`/formation/sessions/${id}`} className="hover:text-primary">
          {session.name}
        </Link>{" "}
        / <span className="text-foreground">Compétences</span>
      </nav>
      <PageHeader title={`Compétences — ${session.program.name}`} description="Niveau atteint par chaque apprenant pour chaque compétence visée par la formation." />
      <Card>
        {!catalog?.length || learners.length === 0 ? (
          <EmptyState icon={Award} title={!catalog?.length ? "Aucune compétence définie pour la formation" : "Aucun apprenant inscrit"} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Apprenant</TH>
                {catalog.map((c) => (
                  <TH key={c.id} className="min-w-40 normal-case tracking-normal">
                    {c.name}
                  </TH>
                ))}
              </tr>
            </THead>
            <tbody>
              {learners.map((l) => (
                <TR key={l.id}>
                  <TD className="font-medium">
                    {l.student!.last_name} {l.student!.first_name}
                    <span className="block text-xs text-muted-foreground">{l.student!.matricule}</span>
                  </TD>
                  {catalog.map((c) => {
                    const ev = byKey.get(`${l.id}:${c.id}`);
                    const level = ev ? COMPETENCY_LEVELS[ev.level] : null;
                    const badge = level ? <Badge tone={level.tone}>{level.label}</Badge> : <Badge tone="neutral">Non évaluée</Badge>;
                    return (
                      <TD key={c.id}>
                        {editable ? (
                          <QuickFormDialog
                            title={`${c.name} — ${l.student!.first_name} ${l.student!.last_name}`}
                            action={evaluateCompetency}
                            hidden={{ enrollment_id: l.id, competency_id: c.id, student_id: l.student!.id, session_id: id }}
                            fields={[
                              {
                                name: "level",
                                label: "Niveau atteint",
                                type: "select",
                                required: true,
                                options: Object.entries(COMPETENCY_LEVELS).map(([value, x]) => ({ value, label: x.label })),
                                defaultValue: ev?.level ?? "in_progress",
                                wide: true,
                              },
                              { name: "comment", label: "Observation", type: "textarea", defaultValue: ev?.comment ?? undefined, wide: true },
                            ]}
                            trigger={
                              <Button variant="ghost" size="sm" aria-label={`Évaluer ${c.name} pour ${l.student!.first_name} ${l.student!.last_name}`}>
                                {badge}
                              </Button>
                            }
                          />
                        ) : (
                          badge
                        )}
                      </TD>
                    );
                  })}
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
