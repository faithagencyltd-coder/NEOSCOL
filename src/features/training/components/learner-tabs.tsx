import { Award, Briefcase, CalendarCheck, Download, FileText, IdCard, Pencil, Plus, Printer, RefreshCcw, ShieldOff, Trash2, Upload } from "lucide-react";
import Link from "next/link";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { DetailList } from "@/components/shared/detail-list";
import { EmptyState } from "@/components/shared/empty-state";
import { FileUploadDialog } from "@/components/shared/file-upload-dialog";
import { QuickFormDialog, type QuickField } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { StatCard } from "@/features/dashboard/components/stat-card";
import {
  deleteLearnerDocument,
  evaluateCompetency,
  issueLearnerBadge,
  revokeLearnerBadge,
  saveInternship,
  uploadLearnerDocument,
} from "@/features/training/actions";
import { BADGE_STATUS, COMPETENCY_LEVELS, formatMinutes, INTERNSHIP_STATUS, LEARNER_DOCUMENT_CATEGORIES, sessionState } from "@/features/training/config";
import type { LearnerAttendance, learnerTraining } from "@/features/training/queries";
import { formatDate, formatDateTime } from "@/lib/utils/format";

type Training = Awaited<ReturnType<typeof learnerTraining>>;
type Finance = { total: number; paid: number; balance: number; overdue: boolean; nextDue: string | null };

/** Onglet « Formation » : inscription(s), situation financière, documents de formation, stages, pièces du dossier. */
export function TrainingTab({
  studentId,
  training,
  finance,
  currency,
  today,
  can,
}: {
  studentId: string;
  training: Training;
  finance: Finance | null;
  currency: string;
  today: string;
  can: { documents: boolean; update: boolean; enroll: boolean; finance: boolean };
}) {
  const current = training.enrollments.find((e) => e.status === "validated") ?? training.enrollments[0];
  const docs = [
    { type: "training_attestation", label: "Attestation de formation", icon: FileText },
    { type: "training_certificate", label: "Certificat de formation", icon: Award },
  ];
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-1">
            <CardTitle>Formation suivie</CardTitle>
            <CardDescription>Inscription, session, groupe et situation financière.</CardDescription>
          </div>
          {can.enroll ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={`/formation/inscription?apprenant=${studentId}`}>
                <Plus aria-hidden /> Nouvelle inscription
              </Link>
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-4">
          {training.enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune inscription en formation.</p>
          ) : (
            training.enrollments.map((e) => {
              const state = e.class ? sessionState(e.class, today) : null;
              return (
                <div key={e.id} className="grid gap-3 rounded-2xl border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      {e.class?.program?.name ?? "Formation"} <span className="text-muted-foreground">· {e.class?.name}</span>
                    </p>
                    <span className="flex gap-2">
                      {state ? <StatusBadge value={state.key} map={{ [state.key]: state }} /> : null}
                      {e.status !== "validated" ? <Badge tone="warning">{e.status}</Badge> : null}
                    </span>
                  </div>
                  <DetailList
                    items={[
                      { label: "Référence d'inscription", value: e.reference },
                      { label: "Date d'inscription", value: formatDate(e.decided_at ?? e.created_at, "fr-FR", { dateStyle: "long" }) },
                      { label: "Classe / groupe", value: e.group?.name ?? "Toute la session" },
                      {
                        label: "Période",
                        value: `${e.class?.starts_on ? formatDate(e.class.starts_on, "fr-FR", { dateStyle: "medium" }) : "—"} → ${e.class?.ends_on ? formatDate(e.class.ends_on, "fr-FR", { dateStyle: "medium" }) : "—"}`,
                      },
                    ]}
                  />
                </div>
              );
            })
          )}
          {can.finance && finance ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Total dû" value={{ amount: finance.total, currency }} icon={FileText} />
              <StatCard label="Payé" value={{ amount: finance.paid, currency }} icon={CalendarCheck} tone="success" />
              <StatCard
                label="Reste à payer"
                value={{ amount: finance.balance, currency }}
                icon={Briefcase}
                tone={finance.balance > 0 ? (finance.overdue ? "danger" : "warning") : "success"}
                hint={finance.balance <= 0 ? "Soldé" : finance.overdue ? "Échéance dépassée" : finance.nextDue ? `Prochaine échéance : ${formatDate(finance.nextDue, "fr-FR", { dateStyle: "medium" })}` : undefined}
                hintTone={finance.overdue ? "danger" : undefined}
              />
            </div>
          ) : null}
          {can.finance ? (
            <Link href={`/eleves/${studentId}?onglet=finance`} className="text-sm font-medium text-primary hover:underline">
              Voir les factures, échéances, paiements et reçus →
            </Link>
          ) : null}
        </CardContent>
      </Card>

      {can.documents && current ? (
        <Card>
          <CardHeader>
            <CardTitle>Documents de formation</CardTitle>
            <CardDescription>Remplis automatiquement avec les informations du centre et de l&apos;apprenant ; numérotés avec QR de vérification.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {docs.map((d) => (
              <Button key={d.type} asChild variant="secondary" size="sm">
                <a href={`/api/documents/certificats/${studentId}?type=${d.type}`} target="_blank" rel="noreferrer">
                  <d.icon aria-hidden /> {d.label}
                </a>
              </Button>
            ))}
            <Button asChild variant="secondary" size="sm">
              <a href={`/api/documents/formation/${studentId}?document=releve`} target="_blank" rel="noreferrer">
                <FileText aria-hidden /> Relevé de notes
              </a>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <a href={`/api/documents/formation/${studentId}?document=competences`} target="_blank" rel="noreferrer">
                <Award aria-hidden /> Fiche de compétences
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <InternshipsCard studentId={studentId} training={training} canManage={can.update} />
      <LearnerFilesCard studentId={studentId} files={training.files} canManage={can.update} />
    </div>
  );
}

function internshipFields(training: Training, values: Record<string, string | number | null | undefined> = {}): QuickField[] {
  const v = (k: string) => (values[k] == null ? undefined : String(values[k]));
  return [
    { name: "company_name", label: "Entreprise", required: true, defaultValue: v("company_name"), wide: true },
    { name: "company_address", label: "Adresse", defaultValue: v("company_address"), wide: true },
    { name: "company_phone", label: "Téléphone de l'entreprise", defaultValue: v("company_phone") },
    { name: "company_email", label: "E-mail de l'entreprise", defaultValue: v("company_email") },
    { name: "tutor_name", label: "Tuteur", defaultValue: v("tutor_name") },
    { name: "tutor_title", label: "Fonction du tuteur", defaultValue: v("tutor_title") },
    { name: "tutor_phone", label: "Téléphone du tuteur", defaultValue: v("tutor_phone") },
    { name: "tutor_email", label: "E-mail du tuteur", defaultValue: v("tutor_email") },
    { name: "starts_on", label: "Début", type: "date", required: true, defaultValue: v("starts_on") },
    { name: "ends_on", label: "Fin", type: "date", required: true, defaultValue: v("ends_on") },
    {
      name: "status",
      label: "Statut",
      type: "select",
      required: true,
      options: Object.entries(INTERNSHIP_STATUS).map(([value, s]) => ({ value, label: s.label })),
      defaultValue: v("status") ?? "planned",
    },
    {
      name: "enrollment_id",
      label: "Formation concernée",
      type: "select",
      options: training.enrollments.map((e) => ({ value: e.id, label: `${e.class?.program?.name ?? ""} — ${e.class?.name ?? ""}` })),
      defaultValue: v("enrollment_id") ?? training.enrollments[0]?.id,
    },
    { name: "missions", label: "Missions", type: "textarea", defaultValue: v("missions"), wide: true },
    { name: "evaluation_score", label: "Évaluation (/20)", type: "number", min: 0, max: 20, step: "0.25", defaultValue: v("evaluation_score") },
    { name: "evaluation_comment", label: "Appréciation du tuteur", type: "textarea", defaultValue: v("evaluation_comment"), wide: true },
  ];
}

function InternshipsCard({ studentId, training, canManage }: { studentId: string; training: Training; canManage: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="grid gap-1">
          <CardTitle>Stages</CardTitle>
          <CardDescription>Entreprise, période, tuteur, statut et évaluation.</CardDescription>
        </div>
        {canManage ? (
          <QuickFormDialog title="Nouveau stage" triggerLabel="Ajouter un stage" action={saveInternship} hidden={{ student_id: studentId }} fields={internshipFields(training)} />
        ) : null}
      </CardHeader>
      {training.internships.length === 0 ? (
        <EmptyState icon={Briefcase} title="Aucun stage" />
      ) : (
        <CardContent className="grid gap-3">
          {training.internships.map((i) => (
            <div key={i.id} className="grid gap-2 rounded-2xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{i.company_name}</p>
                <span className="flex items-center gap-2">
                  <StatusBadge value={i.status} map={INTERNSHIP_STATUS} />
                  {canManage ? (
                    <QuickFormDialog
                      title="Modifier le stage"
                      action={saveInternship}
                      hidden={{ student_id: studentId, internship_id: i.id }}
                      fields={internshipFields(training, i)}
                      trigger={
                        <Button variant="ghost" size="sm" aria-label="Modifier le stage">
                          <Pencil aria-hidden />
                        </Button>
                      }
                    />
                  ) : null}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Du {formatDate(i.starts_on, "fr-FR", { dateStyle: "medium" })} au {formatDate(i.ends_on, "fr-FR", { dateStyle: "medium" })}
                {i.tutor_name ? ` · Tuteur : ${i.tutor_name}${i.tutor_title ? ` (${i.tutor_title})` : ""}` : ""}
                {i.tutor_phone ? ` · ${i.tutor_phone}` : ""}
              </p>
              {i.missions ? <p className="text-sm">{i.missions}</p> : null}
              {i.evaluation_score != null || i.evaluation_comment ? (
                <p className="rounded-xl bg-surface-muted/60 px-3 py-2 text-sm">
                  <strong>Évaluation : {i.evaluation_score != null ? `${Number(i.evaluation_score)}/20` : "—"}</strong>
                  {i.evaluation_comment ? ` — ${i.evaluation_comment}` : ""}
                </p>
              ) : null}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function LearnerFilesCard({ studentId, files, canManage }: { studentId: string; files: Training["files"]; canManage: boolean }) {
  const pieces = files.filter((f) => f.category !== "photo");
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="grid gap-1">
          <CardTitle>Pièces du dossier</CardTitle>
          <CardDescription>Pièce d&apos;identité, photo, dossier d&apos;inscription, engagement… (PDF, JPEG ou PNG, 5 Mo max.)</CardDescription>
        </div>
        {canManage ? (
          <FileUploadDialog
            title="Ajouter une pièce au dossier"
            action={uploadLearnerDocument}
            fields={{ student_id: studentId }}
            accept="application/pdf,image/png,image/jpeg"
            trigger={
              <Button variant="secondary" size="sm">
                <Upload aria-hidden /> Ajouter
              </Button>
            }
          >
            <label className="grid gap-1.5 text-sm font-medium">
              Type de document
              <select name="category" required defaultValue="" className="h-12 rounded-xl border border-input bg-surface px-3 text-sm">
                <option value="" disabled>
                  Choisir…
                </option>
                {Object.entries(LEARNER_DOCUMENT_CATEGORIES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </FileUploadDialog>
        ) : null}
      </CardHeader>
      {pieces.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">Aucune pièce enregistrée.</p>
      ) : (
        <ul className="grid gap-1 px-5 pb-5">
          {pieces.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-surface-muted/60">
              <span className="grid">
                <span className="text-sm font-medium">{LEARNER_DOCUMENT_CATEGORIES[f.category ?? ""] ?? f.category ?? "Document"}</span>
                <span className="text-xs text-muted-foreground">
                  {f.file_name} · {Math.max(1, Math.round(Number(f.size_bytes) / 1024))} Ko · {formatDate(f.created_at, "fr-FR", { dateStyle: "short" })}
                </span>
              </span>
              <span className="flex gap-1">
                <Button asChild variant="ghost" size="sm" aria-label="Ouvrir">
                  <a href={`/api/fichiers/${f.id}`} target="_blank" rel="noreferrer">
                    <Download aria-hidden />
                  </a>
                </Button>
                {canManage ? (
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" size="sm" className="text-danger" aria-label="Retirer">
                        <Trash2 aria-hidden />
                      </Button>
                    }
                    title="Retirer cette pièce du dossier ?"
                    confirmLabel="Retirer"
                    tone="danger"
                    action={deleteLearnerDocument}
                    fields={{ file_id: f.id, student_id: studentId }}
                  />
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Onglet « ASSIDUITÉ » : taux, présences, absences, retards, temps total, historique, cours suivis. */
export function AssiduityTab({ data }: { data: LearnerAttendance | null }) {
  if (!data) return <EmptyState icon={CalendarCheck} title="Assiduité indisponible" />;
  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
      <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Taux d'assiduité" value={data.rate == null ? "—" : `${data.rate} %`} icon={CalendarCheck} tone="success" hint={`${data.attended} cours suivis / ${data.expected}`} />
        <StatCard label="Jours de présence" value={{ count: data.days_present }} icon={CalendarCheck} />
        <StatCard label="Absences" value={{ count: data.absences }} icon={CalendarCheck} tone="danger" hint="Cours prévus sans présence" />
        <StatCard label="Retards" value={{ count: data.lates }} icon={CalendarCheck} tone="warning" hint={data.late_minutes ? `${data.late_minutes} min au total` : undefined} />
        <StatCard label="Temps de présence" value={formatMinutes(data.total_minutes)} icon={CalendarCheck} tone="info" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Cours suivis</CardTitle>
            <CardDescription>
              Du {formatDate(data.from, "fr-FR", { dateStyle: "medium" })} au {formatDate(data.to, "fr-FR", { dateStyle: "medium" })}
            </CardDescription>
          </CardHeader>
          <Table>
            <THead>
              <tr>
                <TH>Module</TH>
                <TH className="text-right">Suivis</TH>
                <TH className="text-right">Prévus</TH>
                <TH className="text-right">Retards</TH>
              </tr>
            </THead>
            <tbody>
              {data.courses.length === 0 ? (
                <TR>
                  <TD colSpan={4} className="text-muted-foreground">
                    Aucun cours prévu sur la période.
                  </TD>
                </TR>
              ) : (
                data.courses.map((c) => (
                  <TR key={c.subject}>
                    <TD className="font-medium">{c.subject}</TD>
                    <TD className="text-right tabular-nums">{c.attended}</TD>
                    <TD className="text-right tabular-nums">{c.expected}</TD>
                    <TD className="text-right tabular-nums">{c.lates}</TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Absences</CardTitle>
            <CardDescription>Cours prévus sans aucune présence enregistrée.</CardDescription>
          </CardHeader>
          {data.absences_list.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">Aucune absence.</p>
          ) : (
            <ul className="grid gap-1 px-5 pb-5 text-sm">
              {data.absences_list.slice(0, 30).map((a, i) => (
                <li key={`${a.date}-${a.starts_at}-${i}`} className="flex justify-between rounded-lg px-2 py-1 odd:bg-surface-muted/50">
                  <span>{formatDate(a.date, "fr-FR", { weekday: "short", day: "numeric", month: "short" })}</span>
                  <span className="text-muted-foreground">
                    {a.subject} · {a.starts_at}–{a.ends_at}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Historique des entrées et sorties</CardTitle>
        </CardHeader>
        {data.history.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">Aucun passage enregistré.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Entrée</TH>
                <TH>Sortie</TH>
                <TH>Cours</TH>
                <TH className="text-right">Durée</TH>
              </tr>
            </THead>
            <tbody>
              {data.history.map((h, i) => (
                <TR key={`${h.date}-${h.entered_at}-${i}`}>
                  <TD>{formatDate(h.date, "fr-FR", { weekday: "short", day: "numeric", month: "short" })}</TD>
                  <TD className="tabular-nums">
                    <span className="flex items-center gap-1.5">
                      {h.entered_at}
                      {h.minutes_late > 0 ? <Badge tone="warning">+{h.minutes_late} min</Badge> : null}
                    </span>
                  </TD>
                  <TD className="tabular-nums">
                    {h.exited_at ?? <Badge tone="info">Sur place</Badge>}
                    {h.auto_closed ? <Badge tone="neutral"> auto.</Badge> : null}
                  </TD>
                  <TD className="text-sm">
                    {h.course ?? "Hors cours"}
                    {h.room ? <span className="text-muted-foreground"> · {h.room}</span> : null}
                  </TD>
                  <TD className="text-right tabular-nums">{formatMinutes(h.minutes)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

/** Onglet « Compétences » : grille par formation, évaluation par le formateur. */
export function CompetenciesTab({ studentId, training, canEvaluate }: { studentId: string; training: Training; canEvaluate: boolean }) {
  const evaluations = new Map(training.competencies.map((c) => [`${c.enrollment_id}:${c.competency_id}`, c]));
  const enrollments = training.enrollments.filter((e) => e.status === "validated");
  if (enrollments.length === 0) return <EmptyState icon={Award} title="Aucune formation en cours" />;
  return (
    <div className="grid gap-4">
      {enrollments.map((e) => {
        const catalog = training.catalog.filter((c) => c.program_id === e.class?.program?.id && c.is_active);
        const acquired = catalog.filter((c) => ["acquired", "mastered"].includes(evaluations.get(`${e.id}:${c.id}`)?.level ?? "")).length;
        return (
          <Card key={e.id}>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="grid gap-1">
                <CardTitle>{e.class?.program?.name}</CardTitle>
                <CardDescription>
                  Progression : {acquired} / {catalog.length} compétence(s) acquise(s)
                </CardDescription>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted sm:w-48" role="progressbar" aria-valuenow={acquired} aria-valuemin={0} aria-valuemax={catalog.length} aria-label="Progression">
                <span className="block h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${catalog.length ? (acquired / catalog.length) * 100 : 0}%` }} />
              </div>
            </CardHeader>
            {catalog.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">Aucune compétence définie pour cette formation.</p>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Compétence</TH>
                    <TH>Niveau</TH>
                    <TH>Évaluée le</TH>
                    {canEvaluate ? <TH className="text-right">Évaluer</TH> : null}
                  </tr>
                </THead>
                <tbody>
                  {catalog.map((c) => {
                    const ev = evaluations.get(`${e.id}:${c.id}`);
                    return (
                      <TR key={c.id}>
                        <TD className="font-medium">
                          {c.name}
                          {ev?.comment ? <span className="block text-xs text-muted-foreground">{ev.comment}</span> : null}
                        </TD>
                        <TD>{ev ? <StatusBadge value={ev.level} map={COMPETENCY_LEVELS} /> : <Badge tone="neutral">Non évaluée</Badge>}</TD>
                        <TD className="text-sm">{ev ? formatDate(ev.evaluated_on, "fr-FR", { dateStyle: "short" }) : "—"}</TD>
                        {canEvaluate ? (
                          <TD className="text-right">
                            <QuickFormDialog
                              title={c.name}
                              action={evaluateCompetency}
                              hidden={{ enrollment_id: e.id, competency_id: c.id, student_id: studentId }}
                              fields={[
                                {
                                  name: "level",
                                  label: "Niveau atteint",
                                  type: "select",
                                  required: true,
                                  options: Object.entries(COMPETENCY_LEVELS).map(([value, l]) => ({ value, label: l.label })),
                                  defaultValue: ev?.level ?? "in_progress",
                                  wide: true,
                                },
                                { name: "comment", label: "Observation", type: "textarea", defaultValue: ev?.comment ?? undefined, wide: true },
                              ]}
                              trigger={
                                <Button variant="ghost" size="sm">
                                  <Pencil aria-hidden /> Évaluer
                                </Button>
                              }
                            />
                          </TD>
                        ) : null}
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/** Onglet « Badge » : QR personnel, impression, remplacement (badge perdu), désactivation, historique. */
export function BadgeTab({
  studentId,
  training,
  qr,
  canManage,
  active: studentActive,
  timezone,
}: {
  studentId: string;
  training: Training;
  qr: string | null;
  canManage: boolean;
  active: boolean;
  timezone: string;
}) {
  const current = training.badges.find((b) => b.status === "active");
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <Card className="grid justify-items-center gap-4 p-6 text-center">
        {current && qr ? (
          <>
            {/* QR code du badge actif : jeton unique, reconnu par la tablette de scan. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={`QR code du badge ${current.number}`} className="size-48 rounded-xl border border-border bg-white p-2" />
            <div className="grid gap-1">
              <Badge tone="success">{current.number}</Badge>
              <span className="text-xs text-muted-foreground">
                Émis le {formatDateTime(current.issued_at, "fr-FR", timezone)} · imprimé {current.printed_count} fois
              </span>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild size="sm">
                <a href={`/api/documents/badges-apprenants/${studentId}`} target="_blank" rel="noreferrer">
                  <Printer aria-hidden /> {current.printed_count > 0 ? "Réimprimer" : "Imprimer"}
                </a>
              </Button>
              {canManage ? (
                <>
                  <ConfirmAction
                    trigger={
                      <Button variant="secondary" size="sm">
                        <RefreshCcw aria-hidden /> Badge perdu : remplacer
                      </Button>
                    }
                    title="Remplacer le badge ?"
                    description="L'ancien badge est désactivé immédiatement et ne scanne plus. Un nouveau QR est créé ; l'historique est conservé."
                    confirmLabel="Désactiver et remplacer"
                    action={issueLearnerBadge}
                    fields={{ student_id: studentId }}
                    reason={{ label: "Motif", required: true }}
                  />
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" size="sm" className="text-danger">
                        <ShieldOff aria-hidden /> Désactiver
                      </Button>
                    }
                    title="Désactiver le badge ?"
                    confirmLabel="Désactiver"
                    tone="danger"
                    action={revokeLearnerBadge}
                    fields={{ student_id: studentId }}
                    reason={{ label: "Motif", required: true }}
                  />
                </>
              ) : null}
            </div>
          </>
        ) : (
          <EmptyState
            icon={IdCard}
            title="Aucun badge actif"
            description={studentActive ? "Générez le badge pour que l'apprenant puisse pointer." : "L'apprenant n'est pas actif : aucun badge ne peut être émis."}
            action={
              canManage && studentActive ? (
                <ConfirmAction
                  trigger={
                    <Button size="sm">
                      <IdCard aria-hidden /> Générer le badge
                    </Button>
                  }
                  title="Générer le badge ?"
                  confirmLabel="Générer"
                  action={issueLearnerBadge}
                  fields={{ student_id: studentId }}
                />
              ) : null
            }
          />
        )}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Historique des badges</CardTitle>
          <CardDescription>Un badge désactivé ne peut jamais être réactivé.</CardDescription>
        </CardHeader>
        <Table>
          <THead>
            <tr>
              <TH>Numéro</TH>
              <TH>Statut</TH>
              <TH>Émis le</TH>
              <TH>Désactivation</TH>
            </tr>
          </THead>
          <tbody>
            {training.badges.length === 0 ? (
              <TR>
                <TD colSpan={4} className="text-muted-foreground">
                  Aucun badge émis.
                </TD>
              </TR>
            ) : (
              training.badges.map((b) => (
                <TR key={b.id}>
                  <TD className="font-mono text-sm">{b.number}</TD>
                  <TD>
                    <StatusBadge value={b.status} map={BADGE_STATUS} />
                  </TD>
                  <TD className="text-sm">{formatDateTime(b.issued_at, "fr-FR", timezone)}</TD>
                  <TD className="text-sm">{b.revoked_at ? `${formatDateTime(b.revoked_at, "fr-FR", timezone)} — ${b.revoked_reason ?? ""}` : "—"}</TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

