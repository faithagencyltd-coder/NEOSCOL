import { Pencil, ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog, type QuickField } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { saveThesis } from "@/features/university/actions";
import { UniversityHeader } from "@/features/university/components/university-header";
import { fmtNote, THESIS_KINDS, THESIS_STATUS } from "@/features/university/config";
import { requireUniversity } from "@/features/university/guard";
import { studentOptions, teacherOptions, thesesList } from "@/features/university/queries";
import { can } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Mémoires / thèses" };

const val = (v: unknown) => (v === null || v === undefined ? undefined : String(v));
function fields(students: { value: string; label: string }[], teachers: { value: string; label: string }[], v: Record<string, unknown> = {}): QuickField[] {
  return [
    ...(v.id ? [] : [{ name: "student_id", label: "Étudiant", type: "select" as const, required: true, options: students, wide: true }]),
    { name: "kind", label: "Type", type: "select", required: true, options: Object.entries(THESIS_KINDS).map(([value, label]) => ({ value, label })), defaultValue: val(v.kind) ?? "memoire" },
    { name: "status", label: "Statut", type: "select", required: true, options: Object.entries(THESIS_STATUS).map(([value, s]) => ({ value, label: s.label })), defaultValue: val(v.status) ?? "proposed" },
    { name: "title", label: "Sujet", required: true, defaultValue: val(v.title), wide: true },
    { name: "director_id", label: "Directeur (enseignant de l'établissement)", type: "select", options: teachers, defaultValue: val(v.director_id), wide: true },
    { name: "director_name", label: "Directeur externe (si hors établissement)", defaultValue: v.director_id ? undefined : val(v.director_name) },
    { name: "co_director_name", label: "Co-directeur / encadreur", defaultValue: val(v.co_director_name) },
    { name: "grade", label: "Note (/20)", type: "number", min: 0, max: 20, step: "0.25", defaultValue: val(v.grade) },
    { name: "mention", label: "Mention", defaultValue: val(v.mention) },
    { name: "summary", label: "Résumé", type: "textarea", defaultValue: val(v.summary) },
    { name: "jury", label: "Jury proposé", type: "textarea", defaultValue: val(v.jury) },
  ];
}

export default async function ThesesPage() {
  const context = await requireUniversity(["students.read", "theses.manage"], "theses");
  const orgId = context.organization.id;
  const manage = can(context, "theses.manage");
  const [rows, students, teachers] = await Promise.all([
    thesesList(orgId),
    manage ? studentOptions(orgId) : Promise.resolve([]),
    manage ? teacherOptions(orgId) : Promise.resolve([]),
  ]);

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <UniversityHeader
        title="Mémoires et thèses"
        description="Sujet, directeur, co-directeur, statut (proposé → validé → en cours → déposé → soutenu), note et mention. Le directeur voit les mémoires qu'il encadre."
        actions={manage ? <QuickFormDialog title="Nouveau sujet" triggerLabel="Nouveau sujet" action={saveThesis} fields={fields(students, teachers)} /> : null}
      />
      <Card>
        {rows.length === 0 ? (
          <CardContent>
            <EmptyState icon={ScrollText} title="Aucun mémoire" />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Étudiant</TH>
                <TH>Sujet</TH>
                <TH>Direction</TH>
                <TH>Note</TH>
                <TH>Statut</TH>
                {manage ? <TH className="text-right">Actions</TH> : null}
              </TR>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/eleves/${r.student_id}?onglet=universite`} className="grid hover:text-primary">
                      <span className="font-medium">
                        {r.student?.last_name} {r.student?.first_name}
                      </span>
                      <span className="text-xs text-muted-foreground">{r.student?.matricule}</span>
                    </Link>
                  </TD>
                  <TD className="max-w-md text-sm">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">{THESIS_KINDS[r.kind] ?? r.kind}</span>
                    <span className="block">{r.title}</span>
                  </TD>
                  <TD className="text-sm">
                    {r.director_name ?? "—"}
                    {r.co_director_name ? <span className="block text-xs text-muted-foreground">Co-direction : {r.co_director_name}</span> : null}
                  </TD>
                  <TD className="text-sm tabular-nums">
                    {r.grade !== null ? `${fmtNote(r.grade)}/20` : "—"}
                    {r.mention ? <span className="block text-xs text-muted-foreground">{r.mention}</span> : null}
                  </TD>
                  <TD>
                    <StatusBadge value={r.status} map={THESIS_STATUS} />
                  </TD>
                  {manage ? (
                    <TD className="text-right">
                      <QuickFormDialog
                        title={`Mémoire — ${r.student?.first_name} ${r.student?.last_name}`}
                        action={saveThesis}
                        hidden={{ id: r.id, student_id: r.student_id }}
                        fields={fields(students, teachers, r)}
                        trigger={
                          <Button variant="ghost" size="sm" aria-label={`Modifier le mémoire de ${r.student?.first_name} ${r.student?.last_name}`}>
                            <Pencil aria-hidden />
                          </Button>
                        }
                      />
                    </TD>
                  ) : null}
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
