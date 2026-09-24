import { CalendarCheck, ClipboardList, History, NotebookPen, Users, Wallet } from "lucide-react";
import Link from "next/link";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { DetailList } from "@/components/shared/detail-list";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { activityLabel } from "@/features/dashboard/components/activity-label";
import { displayValue, type CustomValues, type FieldDefinition } from "@/features/forms/fields";
import { removeGuardianLink } from "@/features/students/actions";
import { GuardianDialog } from "@/features/students/components/guardian-dialog";
import { MedicalDialog } from "@/features/students/components/medical-dialog";
import type {
  getStudent,
  getStudentAttendance,
  getStudentFinance,
  getStudentGrades,
  getStudentHistory,
  getStudentMedical,
} from "@/features/students/queries";
import { ENROLLMENT_STATUS, ENROLLMENT_TYPE, INVOICE_PAYMENT_STATUS, PAYMENT_METHOD, RELATIONSHIP, SEX } from "@/lib/labels";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type Student = NonNullable<Awaited<ReturnType<typeof getStudent>>>;

export function InformationTab({
  student,
  customFields,
  medical,
  showMedical,
  canEditMedical,
}: {
  student: Student;
  customFields: FieldDefinition[];
  medical: Awaited<ReturnType<typeof getStudentMedical>> | null;
  showMedical: boolean;
  canEditMedical: boolean;
}) {
  const custom = (student.custom_fields ?? {}) as CustomValues;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Informations personnelles</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailList
            items={[
              { label: "Nom", value: student.last_name },
              { label: "Prénom(s)", value: student.first_name },
              { label: "Autres noms", value: student.other_names },
              { label: "Sexe", value: student.sex ? SEX[student.sex] : null },
              { label: "Date de naissance", value: student.birth_date ? formatDate(student.birth_date, "fr-FR", { dateStyle: "long" }) : null },
              { label: "Lieu de naissance", value: student.birth_place },
              { label: "Nationalité", value: student.nationality },
              { label: "N° d'identification", value: student.national_id },
              { label: "Adresse", value: [student.address, student.city].filter(Boolean).join(", ") },
              { label: "Téléphone", value: student.phone },
              { label: "E-mail", value: student.email },
              { label: "Compte portail élève", value: student.user_id ? "Activé" : "Non activé" },
            ]}
          />
          {student.notes ? (
            <div className="mt-4 rounded-xl bg-background p-3 text-sm">
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Observations internes</p>
              <p className="whitespace-pre-line">{student.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid content-start gap-4">
        {showMedical ? (
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-2">
              <div className="grid gap-1">
                <CardTitle>Informations médicales</CardTitle>
                <CardDescription>Accès restreint</CardDescription>
              </div>
              {canEditMedical ? <MedicalDialog studentId={student.id} medical={medical} /> : null}
            </CardHeader>
            <CardContent>
              {medical ? (
                <dl className="grid gap-2 text-sm">
                  {[
                    ["Groupe sanguin", medical.blood_group],
                    ["Allergies", medical.allergies],
                    ["Pathologies", medical.conditions],
                    ["Traitements", medical.medications],
                    ["Contact d'urgence", [medical.emergency_contact_name, medical.emergency_contact_phone].filter(Boolean).join(" · ")],
                    ["Médecin", [medical.doctor_name, medical.doctor_phone].filter(Boolean).join(" · ")],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="text-right font-medium">{value || "—"}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Aucune information médicale renseignée.</p>
              )}
            </CardContent>
          </Card>
        ) : null}

        {customFields.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Informations complémentaires</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-2 text-sm">
                {customFields.map((field) => (
                  <div key={field.key} className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{field.label}</dt>
                    <dd className="text-right font-medium">{displayValue(field, custom[field.key])}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

export function GuardiansTab({ student, canManage }: { student: Student; canManage: boolean }) {
  const links = [...student.student_guardians].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="grid gap-1">
          <CardTitle>Parents / tuteurs</CardTitle>
          <CardDescription>Personnes rattachées au dossier de l&apos;élève</CardDescription>
        </div>
        {canManage ? <GuardianDialog studentId={student.id} /> : null}
      </CardHeader>
      <CardContent>
        {links.length === 0 ? (
          <EmptyState icon={Users} title="Aucun parent rattaché" />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {links.map((link) =>
              link.guardian ? (
                <li key={link.id} className="grid gap-3 rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid gap-0.5">
                      <Link href={`/parents/${link.guardian.id}`} className="font-semibold hover:text-primary">
                        {link.guardian.first_name} {link.guardian.last_name}
                      </Link>
                      <span className="text-sm text-muted-foreground">{RELATIONSHIP[link.relationship] ?? link.relationship}</span>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {link.is_primary ? <Badge tone="primary">Principal</Badge> : null}
                      {link.is_financial_responsible ? <Badge tone="success">Financier</Badge> : null}
                      {link.portal_access ? (
                        <Badge tone={link.guardian.user_id ? "info" : "neutral"}>
                          {link.guardian.user_id ? "Portail actif" : "Portail autorisé"}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-sm">
                    {link.guardian.phone ?? "Téléphone non renseigné"}
                    {link.guardian.email ? ` · ${link.guardian.email}` : ""}
                  </p>
                  {canManage ? (
                    <ConfirmAction
                      trigger={
                        <Button variant="ghost" size="sm" className="justify-self-start text-danger">
                          Retirer du dossier
                        </Button>
                      }
                      title="Retirer ce parent du dossier ?"
                      description="La fiche du parent est conservée ; seul le lien avec cet élève est supprimé."
                      confirmLabel="Retirer"
                      tone="danger"
                      action={removeGuardianLink}
                      fields={{ link_id: link.id, student_id: student.id }}
                    />
                  ) : null}
                </li>
              ) : null,
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function SchoolingTab({ student, canEnroll }: { student: Student; canEnroll: boolean }) {
  const enrollments = [...student.enrollments].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="grid gap-1">
          <CardTitle>Historique des inscriptions</CardTitle>
          <CardDescription>Parcours de l&apos;élève dans l&apos;établissement</CardDescription>
        </div>
        {canEnroll ? (
          <Button asChild size="sm">
            <Link href={`/inscriptions/nouvelle?eleve=${student.id}`}>Nouvelle inscription</Link>
          </Button>
        ) : null}
      </CardHeader>
      {enrollments.length === 0 ? (
        <CardContent>
          <EmptyState icon={ClipboardList} title="Aucune inscription" description="Cet élève n'a encore aucune inscription." />
        </CardContent>
      ) : (
        <Table>
          <THead>
            <tr className="border-t border-border">
              <TH>Référence</TH>
              <TH>Année</TH>
              <TH>Classe</TH>
              <TH>Type</TH>
              <TH>Statut</TH>
            </tr>
          </THead>
          <tbody>
            {enrollments.map((enrollment) => (
              <TR key={enrollment.id}>
                <TD>
                  <Link href={`/inscriptions/${enrollment.id}`} className="font-semibold text-primary hover:underline">
                    {enrollment.reference}
                  </Link>
                </TD>
                <TD>{enrollment.academic_year?.name ?? "—"}</TD>
                <TD>{enrollment.class?.name ?? "—"}</TD>
                <TD className="text-muted-foreground">{ENROLLMENT_TYPE[enrollment.type]}</TD>
                <TD>
                  <StatusBadge value={enrollment.status} map={ENROLLMENT_STATUS} />
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

export function GradesTab({ grades }: { grades: Awaited<ReturnType<typeof getStudentGrades>> }) {
  if (grades.detail.length === 0) {
    return (
      <Card>
        <CardContent className="pt-5">
          <EmptyState icon={NotebookPen} title="Aucune note" description="Les notes apparaîtront ici après saisie par les enseignants." />
        </CardContent>
      </Card>
    );
  }
  const fmt = (n: number) => n.toFixed(2).replace(".", ",");
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Moyennes</CardTitle>
          <CardDescription>Pondérées par coefficient, ramenées sur 20</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {grades.averages.map((row) => (
            <div key={`${row.period}-${row.subject}`} className="grid gap-1.5">
              <div className="flex justify-between gap-2 text-sm">
                <span>
                  {row.subject} <span className="text-muted-foreground">· {row.period}</span>
                </span>
                <strong className="tabular-nums">{fmt(row.average)}</strong>
              </div>
              <span className="h-2 overflow-hidden rounded-full bg-surface-muted">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(row.average * 5, 100)}%` }} />
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Détail des évaluations</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <tr className="border-t border-border">
              <TH>Date</TH>
              <TH>Matière</TH>
              <TH>Évaluation</TH>
              <TH className="text-right">Note</TH>
            </tr>
          </THead>
          <tbody>
            {grades.detail.map((grade) => (
              <TR key={grade.id}>
                <TD className="text-muted-foreground">{formatDate(grade.date, "fr-FR", { dateStyle: "short" })}</TD>
                <TD>{grade.subject}</TD>
                <TD>
                  {grade.title} <span className="text-xs text-muted-foreground">(coef. {grade.coefficient})</span>
                  {!grade.published ? <Badge className="ml-2">Non publiée</Badge> : null}
                </TD>
                <TD className="text-right font-semibold tabular-nums">
                  {grade.status ?? `${fmt(grade.score ?? 0)} / ${grade.maxScore}`}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

const ATTENDANCE_LABELS = {
  present: { label: "Présent", tone: "success" },
  absent: { label: "Absent", tone: "danger" },
  late: { label: "Retard", tone: "warning" },
  excused: { label: "Excusé", tone: "info" },
} as const;

export function AttendanceTab({ attendance }: { attendance: Awaited<ReturnType<typeof getStudentAttendance>> }) {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.keys(ATTENDANCE_LABELS) as (keyof typeof ATTENDANCE_LABELS)[]).map((key) => (
          <Card key={key} className="grid gap-1 p-4">
            <span className="text-sm text-muted-foreground">{ATTENDANCE_LABELS[key].label}s</span>
            <strong className="font-display text-2xl">{attendance.totals[key]}</strong>
          </Card>
        ))}
      </div>
      <Card>
        {attendance.rows.length === 0 ? (
          <CardContent className="pt-5">
            <EmptyState icon={CalendarCheck} title="Aucune séance enregistrée" />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Horaire</TH>
                <TH>Statut</TH>
                <TH>Justification</TH>
              </tr>
            </THead>
            <tbody>
              {attendance.rows.map((row) => (
                <TR key={row.id}>
                  <TD>{formatDate(row.session!.session_date, "fr-FR", { dateStyle: "medium" })}</TD>
                  <TD className="text-muted-foreground">
                    {row.session!.starts_at.slice(0, 5)}–{row.session!.ends_at.slice(0, 5)}
                  </TD>
                  <TD>
                    <StatusBadge value={row.status} map={ATTENDANCE_LABELS} />
                    {row.minutes_late ? <span className="ml-2 text-xs text-muted-foreground">{row.minutes_late} min</span> : null}
                  </TD>
                  <TD className="text-muted-foreground">{row.is_justified ? (row.justification ?? "Justifiée") : "—"}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

export function FinanceTab({ finance, currency }: { finance: Awaited<ReturnType<typeof getStudentFinance>>; currency: string }) {
  const money = (n: number | null) => formatMoney(n ?? 0, currency);
  const open = finance.invoices.filter((i) => i.status === "issued");
  const totals = open.reduce(
    (acc, i) => ({ total: acc.total + (i.total ?? 0), paid: acc.paid + (i.paid ?? 0), balance: acc.balance + (i.balance ?? 0) }),
    { total: 0, paid: 0, balance: 0 },
  );
  if (finance.invoices.length === 0) {
    return (
      <Card>
        <CardContent className="pt-5">
          <EmptyState icon={Wallet} title="Aucune facture" description="La facture est générée à la validation de l'inscription." />
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="grid gap-1 p-4">
          <span className="text-sm text-muted-foreground">Total facturé</span>
          <strong className="font-display text-xl">{money(totals.total)}</strong>
        </Card>
        <Card className="grid gap-1 p-4">
          <span className="text-sm text-muted-foreground">Payé</span>
          <strong className="font-display text-xl text-success">{money(totals.paid)}</strong>
        </Card>
        <Card className="grid gap-1 p-4">
          <span className="text-sm text-muted-foreground">Reliquat</span>
          <strong className="font-display text-xl text-warning">{money(totals.balance)}</strong>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Factures</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <tr className="border-t border-border">
              <TH>Numéro</TH>
              <TH>Émise le</TH>
              <TH className="text-right">Total</TH>
              <TH className="text-right">Reliquat</TH>
              <TH>Prochaine échéance</TH>
              <TH>Situation</TH>
            </tr>
          </THead>
          <tbody>
            {finance.invoices.map((invoice) => (
              <TR key={invoice.invoice_id}>
                <TD className="font-semibold">
                  <Link href={`/finances/factures/${invoice.invoice_id}`} className="hover:text-primary">
                    {invoice.number}
                  </Link>
                </TD>
                <TD className="text-muted-foreground">{invoice.issued_on ? formatDate(invoice.issued_on, "fr-FR", { dateStyle: "short" }) : "—"}</TD>
                <TD className="text-right tabular-nums">{money(invoice.total)}</TD>
                <TD className="text-right font-semibold tabular-nums">{money(invoice.balance)}</TD>
                <TD>
                  {invoice.next_due_on ? formatDate(invoice.next_due_on, "fr-FR", { dateStyle: "short" }) : "—"}
                  {invoice.is_overdue ? <Badge tone="danger" className="ml-2">En retard</Badge> : null}
                </TD>
                <TD>{invoice.payment_status ? <StatusBadge value={invoice.payment_status} map={INVOICE_PAYMENT_STATUS} /> : null}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Paiements</CardTitle>
        </CardHeader>
        {finance.payments.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">Aucun paiement enregistré.</p>
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr className="border-t border-border">
                <TH>Reçu</TH>
                <TH>Date</TH>
                <TH>Mode</TH>
                <TH className="text-right">Montant</TH>
                <TH className="text-right">Reliquat après</TH>
              </tr>
            </THead>
            <tbody>
              {finance.payments.map((payment) => (
                <TR key={payment.id} className={payment.status === "cancelled" ? "text-muted-foreground line-through" : undefined}>
                  <TD className="font-semibold">{payment.number}</TD>
                  <TD>{formatDate(payment.paid_at, "fr-FR", { dateStyle: "short" })}</TD>
                  <TD>{PAYMENT_METHOD[payment.method] ?? payment.method}</TD>
                  <TD className="text-right tabular-nums">{money(payment.amount)}</TD>
                  <TD className="text-right tabular-nums">{money(payment.balance_after)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

export function HistoryTab({ history, timezone }: { history: Awaited<ReturnType<typeof getStudentHistory>>; timezone: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Historique des modifications</CardTitle>
        <CardDescription>Extrait du journal d&apos;audit (50 dernières opérations)</CardDescription>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <EmptyState icon={History} title="Aucune opération enregistrée" />
        ) : (
          <ol className="relative grid gap-1 pl-7">
            {/* Fil de la frise : se trace de haut en bas à l'ouverture de l'onglet. */}
            <span aria-hidden className="timeline-line absolute bottom-3 left-[11px] top-3 w-0.5 rounded-full bg-border" />
            {history.map((entry, index) => {
              const changed =
                entry.changes && typeof entry.changes === "object" && !Array.isArray(entry.changes) && entry.action.endsWith(".update")
                  ? Object.keys(entry.changes)
                  : [];
              const tone = /\.(insert|create)$/.test(entry.action)
                ? "bg-success ring-success-soft"
                : /\.(delete|archive|cancel|reject)/.test(entry.action)
                  ? "bg-danger ring-danger-soft"
                  : "bg-primary ring-primary-soft";
              return (
                <li
                  key={entry.id}
                  className="anim-fade-up relative flex flex-col gap-1 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-surface-muted/60 sm:flex-row sm:items-start sm:justify-between"
                  style={{ "--delay": `${Math.min(index, 12) * 45}ms` } as React.CSSProperties}
                >
                  <span aria-hidden className={cn("absolute -left-[22px] top-4 size-3 rounded-full ring-4", tone)} />
                  <div className="grid gap-0.5">
                    <span className="font-semibold">{activityLabel(entry.action, entry.entity_type)}</span>
                    {changed.length > 0 ? (
                      <span className="text-xs text-muted-foreground">Champs : {changed.join(", ")}</span>
                    ) : null}
                    <span className="text-xs text-muted-foreground">{entry.actor_email ?? "Système"}</span>
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={entry.created_at}>
                    {formatDateTime(entry.created_at, "fr-FR", timezone)}
                  </time>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
