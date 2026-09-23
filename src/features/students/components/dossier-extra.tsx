import { Award, FileCheck2, Gavel, School, Trash2 } from "lucide-react";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { addConductRecord, addPreviousSchool, deleteConductRecord, deletePreviousSchool } from "@/features/students/actions";
import type { getStudentConduct, getStudentPreviousSchools, getStudentReportCards } from "@/features/students/queries";
import { formatDate } from "@/lib/utils/format";

/** Onglet « Discipline » : sanctions et récompenses. */
export function ConductTab({ studentId, records, canManage, today }: { studentId: string; records: Awaited<ReturnType<typeof getStudentConduct>>; canManage: boolean; today: string }) {
  const rewards = records.filter((r) => r.kind === "reward").length;
  const fields = (kind: "sanction" | "reward") => [
    { name: "title", label: kind === "reward" ? "Récompense" : "Sanction", required: true, placeholder: kind === "reward" ? "Félicitations du conseil de classe" : "Avertissement écrit", wide: true },
    { name: "occurred_on", label: "Date", type: "date" as const, required: true, defaultValue: today },
    { name: "description", label: "Motif / détails", type: "textarea" as const, wide: true },
  ];
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <CardTitle>Discipline et mérite</CardTitle>
          <CardDescription>
            {records.length - rewards} sanction(s) · {rewards} récompense(s)
          </CardDescription>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <QuickFormDialog
              title="Nouvelle récompense"
              trigger={
                <Button size="sm" variant="secondary">
                  <Award aria-hidden /> Récompense
                </Button>
              }
              action={addConductRecord}
              hidden={{ student_id: studentId, kind: "reward" }}
              fields={fields("reward")}
            />
            <QuickFormDialog
              title="Nouvelle sanction"
              trigger={
                <Button size="sm" variant="secondary">
                  <Gavel aria-hidden /> Sanction
                </Button>
              }
              action={addConductRecord}
              hidden={{ student_id: studentId, kind: "sanction" }}
              fields={fields("sanction")}
            />
          </div>
        ) : null}
      </CardHeader>
      {records.length === 0 ? (
        <CardContent>
          <EmptyState icon={Award} title="Aucun enregistrement" description="Aucune sanction ni récompense." />
        </CardContent>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {records.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-5 py-3">
              <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${r.kind === "reward" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
                {r.kind === "reward" ? <Award className="size-4" aria-hidden /> : <Gavel className="size-4" aria-hidden />}
              </span>
              <div className="grid min-w-0 flex-1 gap-0.5 text-sm">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {r.title}
                  <Badge tone={r.kind === "reward" ? "success" : "danger"}>{r.kind === "reward" ? "Récompense" : "Sanction"}</Badge>
                </span>
                {r.description ? <p className="whitespace-pre-line text-muted-foreground">{r.description}</p> : null}
                <span className="text-xs text-muted-foreground">
                  {formatDate(r.occurred_on)}
                  {r.author ? ` · ${[r.author.first_name, r.author.last_name].filter(Boolean).join(" ")}` : ""}
                </span>
              </div>
              {canManage ? (
                <ConfirmAction
                  trigger={
                    <Button variant="ghost" size="sm" aria-label={`Supprimer « ${r.title} »`}>
                      <Trash2 aria-hidden />
                    </Button>
                  }
                  title={`Supprimer « ${r.title} » ?`}
                  description="La suppression est tracée dans le journal d'audit."
                  confirmLabel="Supprimer"
                  tone="danger"
                  action={deleteConductRecord}
                  fields={{ record_id: r.id }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Établissements fréquentés avant l'inscription. */
export function PreviousSchoolsCard({ studentId, schools, canManage }: { studentId: string; schools: Awaited<ReturnType<typeof getStudentPreviousSchools>>; canManage: boolean }) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <CardTitle>Établissements précédents</CardTitle>
          <CardDescription>Scolarité antérieure de l&apos;élève</CardDescription>
        </div>
        {canManage ? (
          <QuickFormDialog
            title="Ajouter un établissement précédent"
            triggerLabel="Ajouter"
            action={addPreviousSchool}
            hidden={{ student_id: studentId }}
            fields={[
              { name: "school_name", label: "Établissement", required: true, wide: true },
              { name: "city", label: "Ville" },
              { name: "country", label: "Pays" },
              { name: "from_year", label: "De (année)", type: "number", min: 1950, max: 2100 },
              { name: "to_year", label: "À (année)", type: "number", min: 1950, max: 2100 },
              { name: "last_level", label: "Dernière classe suivie", placeholder: "CM2" },
              { name: "notes", label: "Remarques", type: "textarea", wide: true },
            ]}
          />
        ) : null}
      </CardHeader>
      {schools.length === 0 ? (
        <CardContent>
          <EmptyState icon={School} title="Aucun établissement renseigné" />
        </CardContent>
      ) : (
        <Table>
          <THead>
            <tr className="border-t border-border">
              <TH>Établissement</TH>
              <TH>Période</TH>
              <TH>Dernière classe</TH>
              {canManage ? <TH className="text-right">Actions</TH> : null}
            </tr>
          </THead>
          <tbody>
            {schools.map((s) => (
              <TR key={s.id}>
                <TD>
                  <span className="grid">
                    <span className="font-medium">{s.school_name}</span>
                    <span className="text-xs text-muted-foreground">{[s.city, s.country].filter(Boolean).join(", ") || "—"}</span>
                  </span>
                </TD>
                <TD>{s.from_year || s.to_year ? `${s.from_year ?? "?"} – ${s.to_year ?? "?"}` : "—"}</TD>
                <TD>{s.last_level ?? "—"}</TD>
                {canManage ? (
                  <TD className="text-right">
                    <ConfirmAction
                      trigger={
                        <Button variant="ghost" size="sm" aria-label={`Retirer ${s.school_name}`}>
                          <Trash2 aria-hidden />
                        </Button>
                      }
                      title={`Retirer « ${s.school_name} » ?`}
                      confirmLabel="Retirer"
                      tone="danger"
                      action={deletePreviousSchool}
                      fields={{ school_id: s.id }}
                    />
                  </TD>
                ) : null}
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

/** Onglet « Bulletins » : tous les bulletins de l'élève, PDF officiel pour l'administration. */
export function ReportCardsTab({ cards, canPdf }: { cards: Awaited<ReturnType<typeof getStudentReportCards>>; canPdf: boolean }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Bulletins</CardTitle>
        <CardDescription>Moyennes et rangs par période ; les bulletins non publiés sont provisoires.</CardDescription>
      </CardHeader>
      {cards.length === 0 ? (
        <CardContent>
          <EmptyState icon={FileCheck2} title="Aucun bulletin" description="Les bulletins apparaissent après leur calcul par la direction." />
        </CardContent>
      ) : (
        <Table>
          <THead>
            <tr className="border-t border-border">
              <TH>Année</TH>
              <TH>Période</TH>
              <TH>Classe</TH>
              <TH className="text-right">Moyenne</TH>
              <TH className="text-right">Rang</TH>
              <TH>Statut</TH>
              {canPdf ? <TH className="text-right">PDF</TH> : null}
            </tr>
          </THead>
          <tbody>
            {cards.map((c) => (
              <TR key={c.id}>
                <TD>{c.period?.academic_year?.name ?? "—"}</TD>
                <TD>{c.period?.name ?? "—"}</TD>
                <TD>{c.class?.name ?? "—"}</TD>
                <TD className="text-right font-semibold tabular-nums">{c.average === null ? "—" : Number(c.average).toFixed(2).replace(".", ",")}</TD>
                <TD className="text-right tabular-nums">{c.rank ? `${c.rank}${c.class_size ? ` / ${c.class_size}` : ""}` : "—"}</TD>
                <TD>{c.status === "published" ? <Badge tone="success">Publié</Badge> : <Badge>Provisoire</Badge>}</TD>
                {canPdf ? (
                  <TD className="text-right">
                    <Button asChild size="sm" variant="secondary">
                      <a href={`/api/documents/bulletins/${c.id}`} target="_blank" rel="noopener">
                        Ouvrir
                      </a>
                    </Button>
                  </TD>
                ) : null}
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
