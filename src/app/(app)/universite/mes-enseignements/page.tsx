import { BookOpen, CalendarClock, ClipboardCheck, PenLine, ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { UniversityHeader } from "@/features/university/components/university-header";
import { THESIS_KINDS, THESIS_STATUS } from "@/features/university/config";
import { requireUniversity } from "@/features/university/guard";
import { myTeaching, thesesList } from "@/features/university/queries";
import { can } from "@/lib/auth/session";
import { WEEKDAYS } from "@/lib/dates";

export const metadata: Metadata = { title: "Mes enseignements" };

const SESSION_TYPES: Record<string, string> = { cm: "CM", td: "TD", tp: "TP", projet: "Projet", atelier: "Atelier", examen: "Examen", oral: "Oral", autre: "Autre" };

/** Portail enseignant : matières, promotions, emploi du temps, mémoires encadrés (données limitées à l'enseignant par la RLS). */
export default async function MyTeachingPage() {
  const context = await requireUniversity(["attendance.take", "grades.enter"], "teacher_portal");
  const orgId = context.organization.id;
  const [teaching, theses] = await Promise.all([myTeaching(orgId, context.user.id), context.university.features.theses ? thesesList(orgId) : Promise.resolve([])]);
  if (!teaching) {
    return (
      <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
        <UniversityHeader title="Mes enseignements" eyebrow="Portail enseignant" />
        <Card>
          <EmptyState icon={BookOpen} title="Aucune fiche enseignant" description="Votre compte n'est pas relié à une fiche du personnel enseignant de l'établissement." />
        </Card>
      </div>
    );
  }
  const { me, courses, slots } = teaching;
  const mine = theses.filter((t) => t.director_id === me.id);
  const courseOf = new Map(courses.map((c) => [c.id, c]));
  const totalStudents = new Set(courses.map((c) => c.class?.id)).size;

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <UniversityHeader
        eyebrow="Portail enseignant"
        title={`${me.academic_rank ? `${me.academic_rank} ` : ""}${me.first_name} ${me.last_name}`}
        description={`${courses.length} enseignement(s) cette année · ${totalStudents} promotion(s). L'appel s'ouvre après le scan de votre badge sur la tablette, pour vos cours uniquement.`}
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href="/mes-cours">
                <ClipboardCheck aria-hidden /> Mes cours du jour
              </Link>
            </Button>
            {can(context, "grades.enter") ? (
              <Button asChild variant="secondary" size="sm">
                <Link href="/notes">
                  <PenLine aria-hidden /> Saisir des notes
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Mes matières</CardTitle>
          <CardDescription>UE, matières et promotions qui vous sont affectées.</CardDescription>
        </CardHeader>
        {courses.length === 0 ? (
          <CardContent>
            <EmptyState icon={BookOpen} title="Aucune matière affectée" />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Matière</TH>
                <TH>UE</TH>
                <TH>Promotion</TH>
                <TH className="text-right">Étudiants</TH>
                <TH>Types</TH>
                <TH className="text-right">Notes</TH>
              </TR>
            </THead>
            <tbody>
              {courses.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium">
                    {c.subject?.name} <span className="font-mono text-xs text-muted-foreground">{c.subject?.code}</span>
                  </TD>
                  <TD className="text-sm">
                    {c.subject?.unit ? (
                      <>
                        <span className="font-mono text-xs text-primary">{c.subject.unit.code}</span> {c.subject.unit.name}
                        <span className="block text-xs text-muted-foreground">Semestre {c.subject.unit.semester_no}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="text-sm">
                    {c.class?.name}
                    <span className="block text-xs text-muted-foreground">
                      {c.class?.program?.name} · {c.class?.level?.name}
                    </span>
                  </TD>
                  <TD className="text-right tabular-nums">{c.students}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {(c.subject?.teaching_types ?? []).map((t) => (
                        <Badge key={t} tone="neutral">
                          {t.toUpperCase()}
                        </Badge>
                      ))}
                    </div>
                  </TD>
                  <TD className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/notes/${c.id}`}>Carnet de notes</Link>
                    </Button>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-4" aria-hidden /> Mon emploi du temps
          </CardTitle>
        </CardHeader>
        {slots.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">Aucun créneau planifié.</p>
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Jour</TH>
                <TH>Horaire</TH>
                <TH>Cours</TH>
                <TH>Type</TH>
                <TH>Salle</TH>
              </TR>
            </THead>
            <tbody>
              {slots.map((s) => {
                const course = s.class_subject_id ? courseOf.get(s.class_subject_id) : undefined;
                return (
                  <TR key={s.id}>
                    <TD className="text-sm font-medium">{WEEKDAYS[s.weekday]}</TD>
                    <TD className="tabular-nums text-sm">
                      {s.starts_at.slice(0, 5)} – {s.ends_at.slice(0, 5)}
                    </TD>
                    <TD className="text-sm">
                      {course ? `${course.subject?.name ?? ""} · ${course.class?.name ?? ""}` : "—"}
                      {s.group ? <span className="block text-xs text-muted-foreground">Groupe {s.group.name}</span> : null}
                    </TD>
                    <TD className="text-sm">{s.session_type ? (SESSION_TYPES[s.session_type] ?? s.session_type) : "—"}</TD>
                    <TD className="text-sm">{s.room?.name ?? "—"}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {context.university.features.theses ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="size-4" aria-hidden /> Mémoires que je dirige
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {mine.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun mémoire sous votre direction.</p>
            ) : (
              mine.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">
                      {t.student?.last_name} {t.student?.first_name}
                    </span>{" "}
                    — {THESIS_KINDS[t.kind] ?? t.kind} : {t.title}
                  </span>
                  <StatusBadge value={t.status} map={THESIS_STATUS} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
