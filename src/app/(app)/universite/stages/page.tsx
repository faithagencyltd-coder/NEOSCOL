import { Briefcase, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog, type QuickField } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { saveUniversityInternship } from "@/features/university/actions";
import { UniversityHeader } from "@/features/university/components/university-header";
import { fmtNote, INTERNSHIP_HOSTS } from "@/features/university/config";
import { requireUniversity } from "@/features/university/guard";
import { internshipsList, studentOptions } from "@/features/university/queries";
import { can } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Stages" };

const STATUS = {
  planned: { label: "Prévu", tone: "neutral" as const },
  ongoing: { label: "En cours", tone: "info" as const },
  completed: { label: "Terminé", tone: "success" as const },
  cancelled: { label: "Annulé", tone: "warning" as const },
};
const val = (v: unknown) => (v === null || v === undefined ? undefined : String(v));
const d = (v: string | null) => (v ? formatDate(v, "fr-FR", { dateStyle: "medium" }) : "—");

function fields(students: { value: string; label: string }[], v: Record<string, unknown> = {}): QuickField[] {
  return [
    ...(v.id ? [] : [{ name: "student_id", label: "Étudiant", type: "select" as const, required: true, options: students, wide: true }]),
    { name: "company_name", label: "Structure d'accueil", required: true, defaultValue: val(v.company_name) },
    { name: "host_kind", label: "Type", type: "select", required: true, options: Object.entries(INTERNSHIP_HOSTS).map(([value, label]) => ({ value, label })), defaultValue: val(v.host_kind) ?? "entreprise" },
    { name: "tutor_name", label: "Tuteur en entreprise", defaultValue: val(v.tutor_name) },
    { name: "tutor_title", label: "Fonction du tuteur", defaultValue: val(v.tutor_title) },
    { name: "supervisor_name", label: "Encadreur pédagogique", defaultValue: val(v.supervisor_name), wide: true },
    { name: "starts_on", label: "Début", type: "date", required: true, defaultValue: val(v.starts_on) },
    { name: "ends_on", label: "Fin", type: "date", required: true, defaultValue: val(v.ends_on) },
    { name: "status", label: "Statut", type: "select", required: true, options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })), defaultValue: val(v.status) ?? "planned" },
    { name: "evaluation_score", label: "Évaluation (/20)", type: "number", min: 0, max: 20, step: "0.25", defaultValue: val(v.evaluation_score) },
    { name: "convention_signed", label: "Convention de stage signée", type: "checkbox", defaultValue: v.convention_signed ? "true" : undefined },
    { name: "missions", label: "Missions", type: "textarea", defaultValue: val(v.missions) },
    { name: "evaluation_comment", label: "Appréciation", type: "textarea", defaultValue: val(v.evaluation_comment) },
  ];
}

export default async function UniversityInternshipsPage() {
  const context = await requireUniversity(["students.read", "theses.manage"], "internships");
  const orgId = context.organization.id;
  const manage = can(context, "theses.manage") || can(context, "students.update");
  const [rows, students] = await Promise.all([internshipsList(orgId), manage ? studentOptions(orgId) : Promise.resolve([])]);

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <UniversityHeader
        title="Stages"
        description="Structure d'accueil, tuteur, encadreur pédagogique, convention, missions, dates et évaluation. L'attestation de stage se génère depuis les documents de l'étudiant."
        actions={manage ? <QuickFormDialog title="Nouveau stage" triggerLabel="Nouveau stage" action={saveUniversityInternship} fields={fields(students)} /> : null}
      />
      <Card>
        {rows.length === 0 ? (
          <CardContent>
            <EmptyState icon={Briefcase} title="Aucun stage" />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Étudiant</TH>
                <TH>Structure</TH>
                <TH>Tuteur / encadreur</TH>
                <TH>Période</TH>
                <TH>Convention</TH>
                <TH>Évaluation</TH>
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
                  <TD className="text-sm">
                    {r.company_name}
                    <span className="block text-xs text-muted-foreground">{INTERNSHIP_HOSTS[r.host_kind ?? ""] ?? ""}</span>
                  </TD>
                  <TD className="text-sm">
                    {r.tutor_name ?? "—"}
                    <span className="block text-xs text-muted-foreground">{r.supervisor_name ?? ""}</span>
                  </TD>
                  <TD className="whitespace-nowrap text-sm">
                    {d(r.starts_on)} → {d(r.ends_on)}
                  </TD>
                  <TD>{r.convention_signed ? <Badge tone="success">Signée</Badge> : <Badge tone="neutral">À signer</Badge>}</TD>
                  <TD className="tabular-nums">{r.evaluation_score !== null ? `${fmtNote(r.evaluation_score)}/20` : "—"}</TD>
                  <TD>
                    <StatusBadge value={r.status} map={STATUS} />
                  </TD>
                  {manage ? (
                    <TD className="text-right">
                      <QuickFormDialog
                        title={`Stage — ${r.student?.first_name} ${r.student?.last_name}`}
                        action={saveUniversityInternship}
                        hidden={{ id: r.id, student_id: r.student_id }}
                        fields={fields(students, r)}
                        trigger={
                          <Button variant="ghost" size="sm" aria-label={`Modifier le stage de ${r.student?.first_name} ${r.student?.last_name}`}>
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
