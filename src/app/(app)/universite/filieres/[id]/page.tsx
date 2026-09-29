import { GitBranch, Plus, School } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DetailList } from "@/components/shared/detail-list";
import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { savePromotion } from "@/features/university/actions";
import { UniversityHeader } from "@/features/university/components/university-header";
import { fmtCredits, TRACK_KINDS } from "@/features/university/config";
import { requireUniversity } from "@/features/university/guard";
import { academicCalendar, person, programDetail, teacherOptions, universityStructure } from "@/features/university/queries";
import { can } from "@/lib/auth/session";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Filière" };

export default async function ProgramPage({ params }: PageProps<"/universite/filieres/[id]">) {
  const context = await requireUniversity(["academic.read"]);
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const organization = context.organization;
  const data = await programDetail(organization.id, id);
  if (!data) notFound();
  const { program, tracks, units, classes } = data;
  const manage = can(context, "academic.manage");
  const [structure, calendar, teachers] = await Promise.all([
    manage ? universityStructure(organization.id) : Promise.resolve(null),
    manage ? academicCalendar(organization.id) : Promise.resolve(null),
    manage && can(context, "staff.read") ? teacherOptions(organization.id) : Promise.resolve([]),
  ]);
  // Programme d'études : niveau → semestre → UE → matières.
  const byLevel = new Map<string, { label: string; order: number; semesters: Map<number, typeof units> }>();
  for (const ue of units) {
    const key = ue.level_id ?? "none";
    const entry = byLevel.get(key) ?? { label: ue.level?.name ?? "Tous niveaux", order: ue.level?.sequence ?? 99, semesters: new Map() };
    entry.semesters.set(ue.semester_no, [...(entry.semesters.get(ue.semester_no) ?? []), ue]);
    byLevel.set(key, entry);
  }
  const levels = [...byLevel.values()].sort((a, b) => a.order - b.order);

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
        <Link href="/universite/structure?onglet=filieres" className="hover:text-primary">
          Filières
        </Link>{" "}
        / <span className="text-foreground">{program.name}</span>
      </nav>
      <UniversityHeader
        title={program.name}
        eyebrow={`Filière · ${program.code}${program.is_active ? "" : " · désactivée"}`}
        description={program.description ?? undefined}
        actions={
          <Button asChild size="sm" variant="secondary">
            <Link href={`/universite/ue?filiere=${program.id}`}>UE et matières</Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="pt-5">
          <DetailList
            items={[
              { label: "Diplôme préparé", value: program.degree_title },
              { label: "Durée", value: program.duration_years ? `${program.duration_years} an(s)` : null },
              { label: "Cycle", value: program.cycle ? `${program.cycle.name}${program.cycle.credits_required ? ` · ${fmtCredits(program.cycle.credits_required)} crédits requis` : ""}` : null },
              { label: "Faculté / département", value: [program.faculty?.name, program.department?.name].filter(Boolean).join(" · ") },
              { label: "Responsable de filière", value: person(program.responsible) },
              { label: "Conditions d'admission", value: program.admission_conditions },
              { label: "Programme", value: program.syllabus },
            ]}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Parcours et spécialités</CardTitle>
          </CardHeader>
          <CardContent>
            {tracks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun parcours : tronc commun.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {tracks.map((t) => (
                  <li key={t.id}>
                    <Badge tone={t.is_active ? "primary" : "neutral"}>
                      {TRACK_KINDS[t.kind]} · {t.name}
                      {t.starts_at?.short_name ? ` (dès ${t.starts_at.short_name})` : ""}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="grid gap-1">
              <CardTitle>Promotions</CardTitle>
              <CardDescription>Étudiants d&apos;un niveau pour une année académique.</CardDescription>
            </div>
            {manage && structure && calendar ? (
              <QuickFormDialog
                title="Nouvelle promotion"
                triggerLabel="Nouvelle promotion"
                action={savePromotion}
                hidden={{ program_id: program.id }}
                fields={[
                  { name: "name", label: "Nom", required: true, placeholder: `L2 ${program.name.replace(/^Licence /, "")}`, wide: true },
                  { name: "academic_year_id", label: "Année académique", type: "select", required: true, options: calendar.years.map((y) => ({ value: y.id, label: y.name })), defaultValue: calendar.years.find((y) => y.is_current)?.id },
                  { name: "level_id", label: "Niveau", type: "select", required: true, options: structure.levels.map((l) => ({ value: l.id, label: l.name })) },
                  { name: "track_id", label: "Parcours", type: "select", options: tracks.map((t) => ({ value: t.id, label: t.name })) },
                  { name: "capacity", label: "Capacité", type: "number", min: 1 },
                  { name: "head_teacher_id", label: "Responsable de la promotion", type: "select", options: teachers, wide: true },
                ]}
              />
            ) : null}
          </CardHeader>
          <CardContent>
            {classes.length === 0 ? (
              <EmptyState icon={School} title="Aucune promotion" />
            ) : (
              <ul className="grid gap-1.5">
                {classes.map((c) => (
                  <li key={c.id}>
                    <Link href={`/classes/${c.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm hover:border-primary/40">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground">
                        {c.academic_year?.name}
                        {c.track ? ` · ${c.track.name}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>Programme d&apos;études</CardTitle>
            <CardDescription>Niveau → semestre → UE → matières, avec les crédits.</CardDescription>
          </div>
          {manage ? (
            <Button asChild size="sm">
              <Link href={`/universite/ue?filiere=${program.id}`}>
                <Plus aria-hidden /> Ajouter une UE
              </Link>
            </Button>
          ) : null}
        </CardHeader>
        {levels.length === 0 ? (
          <EmptyState icon={GitBranch} title="Aucune UE" />
        ) : (
          <CardContent className="grid gap-5">
            {levels.map((level) => (
              <section key={level.label} className="grid gap-3">
                <h3 className="font-semibold">{level.label}</h3>
                {[...level.semesters.entries()]
                  .sort((a, b) => a[0] - b[0])
                  .map(([semester, list]) => (
                    <div key={semester} className="grid gap-2">
                      <p className="text-sm text-muted-foreground">
                        Semestre {semester} · {fmtCredits(list.reduce((s, u) => s + Number(u.credits), 0))} crédits
                      </p>
                      <Table>
                        <THead>
                          <tr>
                            <TH>UE</TH>
                            <TH>Matières</TH>
                            <TH className="text-right">Crédits</TH>
                            <TH className="text-right">Coef.</TH>
                          </tr>
                        </THead>
                        <tbody>
                          {list.map((ue) => (
                            <TR key={ue.id} className={ue.is_active ? undefined : "opacity-60"}>
                              <TD className="font-medium">
                                {ue.code} — {ue.name}
                                {ue.is_optional ? <Badge tone="info" className="ml-2">Optionnelle</Badge> : null}
                                {ue.track ? <span className="block text-xs text-muted-foreground">{ue.track.name}</span> : null}
                              </TD>
                              <TD className="text-sm">{(ue.subjects ?? []).map((s) => s.name).join(", ") || "—"}</TD>
                              <TD className="text-right tabular-nums">{fmtCredits(ue.credits)}</TD>
                              <TD className="text-right tabular-nums">{fmtCredits(ue.coefficient)}</TD>
                            </TR>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  ))}
              </section>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
