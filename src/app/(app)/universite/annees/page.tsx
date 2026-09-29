import { CalendarRange, Pencil } from "lucide-react";
import type { Metadata } from "next";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveAcademicYear, saveExamSession, saveSemester, setCurrentAcademicYear } from "@/features/university/actions";
import { UniversityHeader } from "@/features/university/components/university-header";
import { requireUniversity } from "@/features/university/guard";
import { academicCalendar } from "@/features/university/queries";
import { can } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Années académiques" };

const d = (v: string | null) => (v ? formatDate(v, "fr-FR", { dateStyle: "medium" }) : "—");
const SESSION_STATUS: Record<string, string> = { planned: "Prévue", ongoing: "En cours", closed: "Close" };

export default async function AcademicYearsPage() {
  const context = await requireUniversity(["academic.read"]);
  const { years, periods, sessions } = await academicCalendar(context.organization.id);
  const manage = can(context, "academic.manage");
  const semesterLabel = context.university.features.semesters ? "semestre" : "période";

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <UniversityHeader
        title="Années académiques"
        description="Dates, statut, périodes d'inscription, semestres et sessions d'examen (normale, rattrapage). L'historique des années est conservé."
        actions={
          manage ? (
            <QuickFormDialog
              title="Nouvelle année académique"
              triggerLabel="Nouvelle année"
              action={saveAcademicYear}
              fields={[
                { name: "name", label: "Année", required: true, placeholder: "2027-2028", wide: true },
                { name: "starts_on", label: "Début", type: "date", required: true },
                { name: "ends_on", label: "Fin", type: "date", required: true },
                { name: "registration_starts_on", label: "Ouverture des inscriptions", type: "date" },
                { name: "registration_ends_on", label: "Clôture des inscriptions", type: "date" },
              ]}
            />
          ) : null
        }
      />
      {years.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarRange} title="Aucune année académique" />
        </Card>
      ) : (
        years.map((y) => {
          const yPeriods = periods.filter((p) => p.academic_year_id === y.id);
          const ySessions = sessions.filter((s) => s.academic_year_id === y.id);
          return (
            <Card key={y.id} className="anim-fade-up">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="grid gap-1">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {y.name} {y.is_current ? <Badge tone="success">En cours</Badge> : <Badge tone="neutral">{y.status === "closed" ? "Close" : "Historique / à venir"}</Badge>}
                  </CardTitle>
                  <CardDescription>
                    Du {d(y.starts_on)} au {d(y.ends_on)} · inscriptions : {d(y.registration_starts_on)} → {d(y.registration_ends_on)}
                  </CardDescription>
                </div>
                {manage ? (
                  <div className="flex flex-wrap gap-2">
                    <QuickFormDialog
                      title={`Modifier ${y.name}`}
                      action={saveAcademicYear}
                      hidden={{ id: y.id }}
                      fields={[
                        { name: "name", label: "Année", required: true, defaultValue: y.name, wide: true },
                        { name: "starts_on", label: "Début", type: "date", required: true, defaultValue: y.starts_on },
                        { name: "ends_on", label: "Fin", type: "date", required: true, defaultValue: y.ends_on },
                        { name: "registration_starts_on", label: "Ouverture des inscriptions", type: "date", defaultValue: y.registration_starts_on ?? undefined },
                        { name: "registration_ends_on", label: "Clôture des inscriptions", type: "date", defaultValue: y.registration_ends_on ?? undefined },
                      ]}
                      trigger={
                        <Button variant="ghost" size="sm">
                          <Pencil aria-hidden /> Modifier
                        </Button>
                      }
                    />
                    {!y.is_current ? (
                      <ConfirmAction
                        trigger={<Button variant="secondary" size="sm">Définir comme année en cours</Button>}
                        title={`Passer à l'année ${y.name} ?`}
                        description="L'année précédente et tout son historique restent consultables."
                        confirmLabel="Confirmer"
                        action={setCurrentAcademicYear}
                        fields={{ id: y.id }}
                      />
                    ) : null}
                    <QuickFormDialog
                      title={`Nouveau ${semesterLabel} — ${y.name}`}
                      triggerLabel={`Ajouter un ${semesterLabel}`}
                      action={saveSemester}
                      hidden={{ academic_year_id: y.id }}
                      fields={[
                        { name: "name", label: "Nom", required: true, placeholder: `Semestre ${yPeriods.length + 1}`, defaultValue: `Semestre ${yPeriods.length + 1}`, wide: true },
                        { name: "sequence", label: "Rang dans l'année", type: "number", required: true, min: 1, max: 4, defaultValue: String(yPeriods.length + 1) },
                        { name: "starts_on", label: "Début", type: "date", required: true },
                        { name: "ends_on", label: "Fin", type: "date", required: true },
                      ]}
                    />
                    <QuickFormDialog
                      title={`Nouvelle session d'examen — ${y.name}`}
                      triggerLabel="Session d'examen"
                      action={saveExamSession}
                      hidden={{ academic_year_id: y.id }}
                      fields={[
                        { name: "name", label: "Nom", required: true, placeholder: "Session 1 — Semestre 1", wide: true },
                        { name: "kind", label: "Type", type: "select", required: true, options: [{ value: "normal", label: "Session normale" }, { value: "retake", label: "Rattrapage" }], defaultValue: "normal" },
                        { name: "academic_period_id", label: "Semestre", type: "select", options: yPeriods.map((p) => ({ value: p.id, label: p.name })) },
                        { name: "starts_on", label: "Début", type: "date", required: true },
                        { name: "ends_on", label: "Fin", type: "date", required: true },
                        { name: "status", label: "Statut", type: "select", required: true, options: Object.entries(SESSION_STATUS).map(([value, label]) => ({ value, label })), defaultValue: "planned" },
                      ]}
                    />
                  </div>
                ) : null}
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
                <div className="grid content-start gap-2">
                  <p className="text-sm font-semibold">{context.university.features.semesters ? "Semestres" : "Périodes"}</p>
                  {yPeriods.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun semestre.</p>
                  ) : (
                    yPeriods.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-muted-foreground">
                          {d(p.starts_on)} → {d(p.ends_on)} {p.is_locked ? <Badge tone="warning">Verrouillé</Badge> : null}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <div className="grid content-start gap-2">
                  <p className="text-sm font-semibold">Sessions d&apos;examen</p>
                  {ySessions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune session planifiée.</p>
                  ) : (
                    ySessions.map((s) => (
                      <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                        <span className="font-medium">
                          {s.name} {s.kind === "retake" ? <Badge tone="warning">Rattrapage</Badge> : <Badge tone="info">Normale</Badge>}
                        </span>
                        <span className="text-muted-foreground">
                          {d(s.starts_on)} → {d(s.ends_on)} · {SESSION_STATUS[s.status]}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
