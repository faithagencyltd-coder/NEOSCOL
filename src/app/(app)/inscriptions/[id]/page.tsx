import { Ban, CheckCircle2, FileCheck2, FileWarning, Send, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { DetailList } from "@/components/shared/detail-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getClasses } from "@/features/academic/queries";
import { cancelEnrollment, rejectEnrollment, submitEnrollment, validateEnrollment } from "@/features/enrollments/actions";
import { EnrollmentDetailsDialog } from "@/features/enrollments/components/enrollment-details-dialog";
import { getEnrollment, getEnrollmentInvoice, getFeePreview } from "@/features/enrollments/queries";
import { displayValue, parseFields, type CustomValues } from "@/features/forms/fields";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { ENROLLMENT_STATUS, ENROLLMENT_TYPE, RELATIONSHIP } from "@/lib/labels";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils/format";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Inscription" };

export default async function EnrollmentPage({ params, searchParams }: PageProps<"/inscriptions/[id]">) {
  const context = await requirePermission("enrollments.read");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  const organization = context.organization;
  const enrollment = await getEnrollment(organization.id, id);
  if (!enrollment || !enrollment.student) notFound();

  const fields = parseFields(enrollment.form_definition?.fields);
  const values = (enrollment.form_data ?? {}) as CustomValues;
  const documents = fields.filter((f) => f.type === "file");
  const infoFields = fields.filter((f) => f.type !== "file");
  const missingRequired = documents.filter((d) => d.required && values[d.key] !== true);

  const canManage = can(context, "enrollments.manage");
  const canValidate = can(context, "enrollments.validate");
  const canInvoice = can(context, "finance.invoices.manage");
  const editable = enrollment.status === "draft" || enrollment.status === "pending";
  const [fees, invoice, classes] = await Promise.all([
    can(context, "finance.read") || canManage ? getFeePreview(enrollment.id) : Promise.resolve(null),
    can(context, "finance.read") ? getEnrollmentInvoice(enrollment.id) : Promise.resolve(null),
    canManage && editable ? getClasses(organization.id, enrollment.academic_year_id) : Promise.resolve([]),
  ]);
  const feeTotal = (fees ?? []).reduce((sum, f) => sum + f.amount, 0);
  const student = enrollment.student;

  return (
    <div className="grid gap-5">
      <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
        <Link href="/inscriptions" className="hover:text-primary">
          Inscriptions
        </Link>{" "}
        / <span className="text-foreground">{enrollment.reference}</span>
      </nav>
      {query.cree ? (
        <Alert tone="success">
          {enrollment.status === "pending" ? "Inscription soumise pour validation." : "Inscription enregistrée en brouillon."}
        </Alert>
      ) : null}

      <Card className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center">
        <div className="grid flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{enrollment.reference}</h1>
            <StatusBadge value={enrollment.status} map={ENROLLMENT_STATUS} />
          </div>
          <p className="text-sm text-muted-foreground">
            {ENROLLMENT_TYPE[enrollment.type]} · {enrollment.class?.name ?? "classe à définir"} · année {enrollment.academic_year?.name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && editable ? (
            <EnrollmentDetailsDialog
              enrollmentId={enrollment.id}
              classId={enrollment.class_id}
              classes={classes.map((c) => ({ id: c.id, name: c.name }))}
              fields={fields}
              values={values}
              notes={enrollment.notes}
            />
          ) : null}
          {canManage && (enrollment.status === "draft" || enrollment.status === "rejected") ? (
            <ConfirmAction
              trigger={
                <Button>
                  <Send aria-hidden /> Soumettre
                </Button>
              }
              title="Soumettre pour validation ?"
              description="La direction sera invitée à valider ou rejeter l'inscription."
              confirmLabel="Soumettre"
              action={submitEnrollment}
              fields={{ enrollment_id: enrollment.id }}
            />
          ) : null}
          {canValidate && enrollment.status === "pending" ? (
            <>
              <ConfirmAction
                trigger={
                  <Button>
                    <CheckCircle2 aria-hidden /> Valider
                  </Button>
                }
                title="Valider l'inscription ?"
                description={`L'élève sera affecté en ${enrollment.class?.name ?? "classe"} et son dossier passera au statut « Actif ».`}
                confirmLabel="Valider"
                action={validateEnrollment}
                fields={{ enrollment_id: enrollment.id }}
              >
                {missingRequired.length > 0 ? (
                  <Alert tone="warning" title="Pièces obligatoires manquantes">
                    {missingRequired.map((d) => d.label).join(", ")}
                  </Alert>
                ) : null}
                {canInvoice ? (
                  <label className="flex min-h-11 items-start gap-3 rounded-xl border border-border p-3 text-sm">
                    <input type="checkbox" name="generate_invoice" defaultChecked className="mt-0.5 size-4.5 accent-[var(--primary)]" />
                    <span>
                      Générer et émettre la facture des frais
                      {fees && fees.length > 0 ? ` (${formatMoney(feeTotal, organization.currency)})` : " (aucun tarif applicable)"}
                    </span>
                  </label>
                ) : (
                  <p className="text-sm text-muted-foreground">La facture sera établie par la comptabilité.</p>
                )}
              </ConfirmAction>
              <ConfirmAction
                trigger={
                  <Button variant="secondary">
                    <XCircle aria-hidden /> Rejeter
                  </Button>
                }
                title="Rejeter l'inscription ?"
                confirmLabel="Rejeter"
                tone="danger"
                action={rejectEnrollment}
                fields={{ enrollment_id: enrollment.id }}
                reason={{ label: "Motif du rejet (communiqué à la famille)", required: true }}
              />
            </>
          ) : null}
          {(canValidate && ["draft", "pending", "validated"].includes(enrollment.status)) ||
          (canManage && ["draft", "pending"].includes(enrollment.status)) ? (
            <ConfirmAction
              trigger={
                <Button variant="ghost" className="text-danger">
                  <Ban aria-hidden /> Annuler
                </Button>
              }
              title="Annuler l'inscription ?"
              description="L'inscription est conservée dans l'historique avec le statut « Annulée »."
              confirmLabel="Annuler l'inscription"
              tone="danger"
              action={cancelEnrollment}
              fields={{ enrollment_id: enrollment.id }}
              reason={{ label: "Motif de l'annulation", required: true }}
            />
          ) : null}
        </div>
      </Card>

      {enrollment.decision_reason && ["rejected", "cancelled"].includes(enrollment.status) ? (
        <Alert tone="danger" title={enrollment.status === "rejected" ? "Motif du rejet" : "Motif de l'annulation"}>
          {enrollment.decision_reason}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Élève</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Link href={`/eleves/${student.id}`} className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-background">
              <Avatar name={`${student.first_name} ${student.last_name}`} />
              <span className="grid flex-1">
                <span className="font-semibold">
                  {student.first_name} {student.last_name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {student.matricule}
                  {student.birth_date ? ` · né(e) le ${formatDate(student.birth_date, "fr-FR", { dateStyle: "short" })}` : ""}
                </span>
              </span>
            </Link>
            {student.student_guardians.length > 0 ? (
              <ul className="grid gap-2 text-sm">
                {student.student_guardians.map((sg) =>
                  sg.guardian ? (
                    <li key={sg.guardian.id} className="flex justify-between gap-3">
                      <span>
                        {sg.guardian.first_name} {sg.guardian.last_name}{" "}
                        <span className="text-muted-foreground">· {RELATIONSHIP[sg.relationship] ?? sg.relationship}</span>
                      </span>
                      <span className="text-muted-foreground">{sg.guardian.phone ?? ""}</span>
                    </li>
                  ) : null,
                )}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun parent rattaché.</p>
            )}
            {infoFields.length > 0 ? (
              <DetailList items={infoFields.map((f) => ({ label: f.label, value: displayValue(f, values[f.key]) }))} />
            ) : null}
            {enrollment.notes ? <p className="whitespace-pre-line rounded-xl bg-background p-3 text-sm">{enrollment.notes}</p> : null}
          </CardContent>
        </Card>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Suivi</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-3 text-sm">
                <li className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Créée</span>
                  <span>{formatDateTime(enrollment.created_at, "fr-FR", organization.timezone)}</span>
                </li>
                {enrollment.submitted_at ? (
                  <li className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Soumise</span>
                    <span>{formatDateTime(enrollment.submitted_at, "fr-FR", organization.timezone)}</span>
                  </li>
                ) : null}
                {enrollment.decided_at ? (
                  <li className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Décision</span>
                    <span>{formatDateTime(enrollment.decided_at, "fr-FR", organization.timezone)}</span>
                  </li>
                ) : null}
              </ol>
            </CardContent>
          </Card>

          {documents.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Pièces à fournir</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 text-sm">
                  {documents.map((doc) => {
                    const received = values[doc.key] === true;
                    return (
                      <li key={doc.key} className="flex items-center gap-2.5">
                        {received ? (
                          <FileCheck2 className="size-4 text-success" aria-hidden />
                        ) : (
                          <FileWarning className="size-4 text-warning" aria-hidden />
                        )}
                        <span className="flex-1">{doc.label}</span>
                        <span className={received ? "text-success" : "text-warning"}>
                          {received ? "Reçue" : doc.required ? "Manquante" : "Non fournie"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {fees ? (
            <Card>
              <CardHeader>
                <CardTitle>Frais</CardTitle>
                <CardDescription>{invoice ? `Facture ${invoice.number}` : "Selon les tarifs de l'année"}</CardDescription>
              </CardHeader>
              <CardContent>
                {fees.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun tarif ne s&apos;applique à cette classe.</p>
                ) : (
                  <ul className="grid gap-2 text-sm">
                    {fees.map((fee) => (
                      <li key={fee.fee_rate_id} className="flex justify-between gap-3">
                        <span>{fee.fee_type_name}</span>
                        <span className="tabular-nums">{formatMoney(fee.amount, organization.currency)}</span>
                      </li>
                    ))}
                    <li className="flex justify-between gap-3 border-t border-border pt-2 font-semibold">
                      <span>Total</span>
                      <span className="tabular-nums">{formatMoney(invoice?.total ?? feeTotal, organization.currency)}</span>
                    </li>
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
