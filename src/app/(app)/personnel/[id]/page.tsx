import { Archive, ArchiveRestore, Ban, Camera, IdCard, Pencil, Printer, RefreshCw, Trash2, UserCog } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { FileUploadDialog } from "@/components/shared/file-upload-dialog";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import {
  changeStaffStatus,
  deleteStaffMember,
  issueBadge,
  revokeBadge,
  setStaffArchived,
  updateStaffMember,
  uploadStaffPhoto,
} from "@/features/staff/actions";
import { CreateAccountDialog } from "@/features/staff/components/account-dialog";
import { staffFormFields } from "@/features/staff/form";
import { getAccountRoles, getStaffAssignments, getStaffMember, getStaffRoles, listLessonUnlocks, listStaffAttendance } from "@/features/staff/queries";
import { STAFF_STATUS } from "@/features/staff/schemas";
import { WEEKDAYS, todayIn } from "@/lib/dates";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { qrDataUrl } from "@/lib/pdf/qr";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Fiche du personnel" };

const time = (value: string | null) => (value ? value.slice(0, 5) : "—");

export default async function StaffMemberPage({ params, searchParams }: PageProps<"/personnel/[id]">) {
  const context = await requirePermission("staff.read");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  const organization = context.organization;
  const staff = await getStaffMember(organization.id, id);
  if (!staff) notFound();

  const today = todayIn(organization.timezone);
  const monthAgo = new Date(Date.parse(`${today}T12:00:00Z`) - 30 * 86400000).toISOString().slice(0, 10);
  const canAttendance = can(context, "staff_attendance.read");
  const [assignments, attendance, unlocks, roles, account] = await Promise.all([
    getStaffAssignments(staff.id),
    canAttendance ? listStaffAttendance(organization.id, { from: monthAgo, to: today, staffId: staff.id }) : Promise.resolve([]),
    canAttendance ? listLessonUnlocks(organization.id, { from: monthAgo, to: today, staffId: staff.id }) : Promise.resolve([]),
    can(context, "users.manage") ? getStaffRoles(organization.id) : Promise.resolve([]),
    staff.user_id && can(context, "users.read") ? getAccountRoles(organization.id, staff.user_id) : Promise.resolve(null),
  ]);
  const badges = [...staff.staff_badges].sort((a, b) => b.issued_at.localeCompare(a.issued_at));
  const activeBadge = badges.find((b) => b.status === "active");
  const canBadges = can(context, "staff.badges.manage");
  const qr = activeBadge && canBadges ? await qrDataUrl(`NEOSCOL-BADGE:${activeBadge.token}`, "#000000") : null;
  const archived = staff.archived_at !== null;
  const fullName = `${staff.first_name} ${staff.last_name}`;
  const canManage = can(context, "staff.manage");

  return (
    <div className="grid gap-5">
      <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
        <Link href="/personnel" className="hover:text-primary">
          Personnel
        </Link>{" "}
        / <span className="text-foreground">{fullName}</span>
      </nav>
      {query.cree ? <Alert tone="success">Fiche créée. Matricule attribué : {staff.employee_number}.</Alert> : null}
      {archived ? <Alert tone="warning" title="Fiche archivée">Le badge est désactivé ; la fiche reste consultable et peut être restaurée.</Alert> : null}
      {staff.status !== "active" && staff.status_reason ? (
        <Alert tone="info">
          {STAFF_STATUS[staff.status as keyof typeof STAFF_STATUS]?.label ?? staff.status} — {staff.status_reason}
        </Alert>
      ) : null}

      <Card className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center">
        <Avatar name={fullName} photoId={staff.photo_path} className="size-20 text-2xl ring-4 ring-primary-soft" />
        <div className="grid flex-1 gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold sm:text-[26px]">{fullName}</h1>
            {archived ? <Badge>Archivé</Badge> : <StatusBadge value={staff.status} map={STAFF_STATUS} />}
            {staff.is_teacher ? <Badge tone="primary">Enseignant</Badge> : null}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <span>
              Matricule <strong className="text-foreground">{staff.employee_number}</strong>
            </span>
            <span>
              Fonction <strong className="text-foreground">{staff.job_title ?? "—"}</strong>
            </span>
            {staff.phone ? <span>{staff.phone}</span> : null}
            {staff.email ? <span>{staff.email}</span> : null}
            {staff.hired_on ? <span>Depuis le {formatDate(staff.hired_on, "fr-FR", { dateStyle: "long" })}</span> : null}
          </div>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <FileUploadDialog
              title="Photo du badge"
              description="JPEG ou PNG, 5 Mo maximum."
              action={uploadStaffPhoto}
              fields={{ staff_id: staff.id }}
              trigger={
                <Button variant="secondary">
                  <Camera aria-hidden /> Photo
                </Button>
              }
            />
            <QuickFormDialog
              title="Modifier la fiche"
              trigger={
                <Button variant="secondary">
                  <Pencil aria-hidden /> Modifier
                </Button>
              }
              action={updateStaffMember}
              hidden={{ staff_id: staff.id }}
              fields={staffFormFields({ ...staff, is_teacher: staff.is_teacher ? "true" : "false" })}
            />
            {!archived ? (
              <ConfirmAction
                trigger={
                  <Button variant="secondary">
                    <UserCog aria-hidden /> Statut
                  </Button>
                }
                title="Changer le statut"
                description="Désactiver ou retirer un membre du personnel désactive automatiquement son badge."
                confirmLabel="Enregistrer"
                action={changeStaffStatus}
                fields={{ staff_id: staff.id }}
                reason={{ label: "Motif", required: true }}
              >
                <div className="grid gap-1.5">
                  <Label htmlFor="staff-status">Nouveau statut</Label>
                  <Select id="staff-status" name="status" defaultValue={staff.status === "active" ? "inactive" : "active"}>
                    {Object.entries(STAFF_STATUS)
                      .filter(([key]) => key !== staff.status)
                      .map(([key, value]) => (
                        <option key={key} value={key}>
                          {value.label}
                        </option>
                      ))}
                  </Select>
                </div>
              </ConfirmAction>
            ) : null}
            <ConfirmAction
              trigger={
                <Button variant={archived ? "secondary" : "ghost"} className={archived ? undefined : "text-danger"}>
                  {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                  {archived ? "Restaurer" : "Archiver"}
                </Button>
              }
              title={archived ? "Restaurer cette fiche ?" : "Archiver cette fiche ?"}
              description={archived ? "Un nouveau badge devra être généré." : "L'historique est conservé ; le badge actif est désactivé."}
              confirmLabel={archived ? "Restaurer" : "Archiver"}
              tone={archived ? "primary" : "danger"}
              action={setStaffArchived}
              fields={{ staff_id: staff.id, archive: archived ? "false" : "true" }}
            />
            {archived && can(context, "staff.delete") ? (
              <ConfirmAction
                trigger={
                  <Button variant="ghost" className="text-danger">
                    <Trash2 aria-hidden /> Supprimer définitivement
                  </Button>
                }
                title="Suppression définitive"
                description="Action irréversible : la fiche, ses badges et son pointage sont supprimés. Le journal d'audit conserve la trace de l'opération."
                confirmLabel="Supprimer définitivement"
                tone="danger"
                action={deleteStaffMember}
                fields={{ staff_id: staff.id }}
              >
                <div className="grid gap-1.5">
                  <Label htmlFor="staff-confirm">
                    Saisissez le matricule <strong>{staff.employee_number}</strong>
                  </Label>
                  <Input id="staff-confirm" name="confirmation" required autoComplete="off" className="font-mono" />
                </div>
              </ConfirmAction>
            ) : null}
          </div>
        ) : null}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Badge professionnel</CardTitle>
            <CardDescription>Le QR Code sert uniquement au pointage sur la tablette de l&apos;administration.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {activeBadge ? (
              <div className="flex flex-wrap items-center gap-5">
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element -- QR généré côté serveur (data URL)
                  <img src={qr} alt={`QR Code du badge ${activeBadge.number}`} className="size-36 rounded-lg border border-border bg-white p-2" />
                ) : null}
                <dl className="grid gap-1 text-sm">
                  <div>
                    <dt className="inline text-muted-foreground">Numéro : </dt>
                    <dd className="inline font-mono font-medium">{activeBadge.number}</dd>
                  </div>
                  <div>
                    <dt className="inline text-muted-foreground">Année : </dt>
                    <dd className="inline font-medium">{activeBadge.academic_year?.name ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline text-muted-foreground">Émis le : </dt>
                    <dd className="inline font-medium">{formatDateTime(activeBadge.issued_at, "fr-FR", organization.timezone)}</dd>
                  </div>
                  <div>
                    <dt className="inline text-muted-foreground">Impressions : </dt>
                    <dd className="inline font-medium">{activeBadge.printed_count}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <EmptyState icon={IdCard} title="Aucun badge actif" description={archived || staff.status !== "active" ? "Réactivez la fiche pour générer un badge." : undefined} />
            )}
            {canBadges && !archived && staff.status === "active" ? (
              <div className="flex flex-wrap gap-2">
                {activeBadge ? (
                  <>
                    <Button asChild>
                      <a href={`/api/documents/badges/${staff.id}`} target="_blank" rel="noopener">
                        <Printer aria-hidden /> Imprimer le badge
                      </a>
                    </Button>
                    <ConfirmAction
                      trigger={
                        <Button variant="secondary">
                          <RefreshCw aria-hidden /> Régénérer le QR
                        </Button>
                      }
                      title="Régénérer le badge ?"
                      description="Un nouveau QR Code est créé ; l'ancien badge est immédiatement désactivé et refusé par la tablette."
                      confirmLabel="Régénérer"
                      action={issueBadge}
                      fields={{ staff_id: staff.id }}
                      reason={{ label: "Motif (perte, vol, détérioration…)", required: true }}
                    />
                    <ConfirmAction
                      trigger={
                        <Button variant="ghost" className="text-danger">
                          <Ban aria-hidden /> Désactiver
                        </Button>
                      }
                      title="Désactiver le badge ?"
                      confirmLabel="Désactiver"
                      tone="danger"
                      action={revokeBadge}
                      fields={{ badge_id: activeBadge.id }}
                      reason={{ label: "Motif", required: true }}
                    />
                  </>
                ) : (
                  <ConfirmAction
                    trigger={
                      <Button>
                        <IdCard aria-hidden /> Générer le badge
                      </Button>
                    }
                    title="Générer le badge ?"
                    description="Un QR Code unique est attribué à ce membre du personnel pour l'année scolaire en cours."
                    confirmLabel="Générer"
                    action={issueBadge}
                    fields={{ staff_id: staff.id }}
                  />
                )}
              </div>
            ) : null}
            {badges.length > 0 ? (
              <div className="grid gap-2">
                <p className="text-sm font-medium">Historique des badges</p>
                <ul className="grid gap-1.5 text-sm">
                  {badges.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                      <span className="font-mono text-xs">{b.number}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(b.issued_at, "fr-FR", { dateStyle: "short" })}
                        {b.revoked_at ? ` → ${formatDate(b.revoked_at, "fr-FR", { dateStyle: "short" })} · ${b.revoked_reason ?? ""}` : ""}
                      </span>
                      {b.status === "active" ? <Badge tone="success">Actif</Badge> : <Badge tone="danger">Désactivé</Badge>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid content-start gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Compte de connexion</CardTitle>
              <CardDescription>Connexion par e-mail ou matricule + mot de passe (le badge ne permet pas de se connecter).</CardDescription>
            </CardHeader>
            <CardContent>
              {staff.user_id ? (
                <dl className="grid gap-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Identifiants</dt>
                    <dd className="font-medium">
                      {staff.account?.email ?? staff.email} · {staff.employee_number}
                    </dd>
                  </div>
                  {account ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Rôle(s)</dt>
                      <dd className="font-medium">{account.membership_roles.map((mr) => mr.role?.name).filter(Boolean).join(", ") || "—"}</dd>
                    </div>
                  ) : null}
                  {staff.account?.last_seen_at ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Dernière activité</dt>
                      <dd>{formatDateTime(staff.account.last_seen_at, "fr-FR", organization.timezone)}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : roles.length > 0 && !archived && staff.status === "active" ? (
                <CreateAccountDialog
                  staffId={staff.id}
                  roles={roles}
                  defaultRoleId={roles.find((r) => r.key === (staff.is_teacher ? "teacher" : "secretary"))?.id}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Aucun compte de connexion.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Affectations</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {assignments.subjects.length === 0 && assignments.slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune matière ni aucun créneau affecté.</p>
              ) : null}
              {assignments.subjects.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {assignments.subjects.map((s) => (
                    <Badge key={s.id} tone="primary">
                      {s.subject?.name} · {s.class?.name}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {assignments.slots.length ? (
                <ul className="grid gap-1 text-sm">
                  {assignments.slots.map((slot) => (
                    <li key={slot.id} className="flex justify-between gap-3 rounded-lg bg-muted/40 px-3 py-1.5">
                      <span>
                        {WEEKDAYS[slot.weekday - 1]} {time(slot.starts_at)}–{time(slot.ends_at)}
                      </span>
                      <span className="text-muted-foreground">
                        {slot.class_subject?.subject?.name ?? "Cours"} · {slot.class?.name}
                        {slot.room ? ` · ${slot.room.name}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      {canAttendance ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Pointage — 30 derniers jours</CardTitle>
            <CardDescription>
              {attendance.length} jour(s) pointé(s) · {attendance.filter((a) => a.minutes_late > 0).length} retard(s) · {unlocks.length} cours déverrouillé(s)
            </CardDescription>
          </CardHeader>
          {attendance.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted-foreground">Aucun pointage sur la période.</p>
            </CardContent>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Arrivée</TH>
                  <TH>Départ</TH>
                  <TH>Retard</TH>
                  <TH>Cours déverrouillés</TH>
                </tr>
              </THead>
              <tbody>
                {attendance.map((a) => {
                  const day = unlocks.filter((u) => u.lesson_date === a.work_date);
                  return (
                    <TR key={a.id}>
                      <TD>{formatDate(a.work_date, "fr-FR", { weekday: "short", day: "2-digit", month: "short" })}</TD>
                      <TD>{formatDateTime(a.arrived_at, "fr-FR", organization.timezone).split(" ").pop()}</TD>
                      <TD>{a.departed_at ? formatDateTime(a.departed_at, "fr-FR", organization.timezone).split(" ").pop() : "—"}</TD>
                      <TD>{a.minutes_late > 0 ? <Badge tone="warning">{a.minutes_late} min</Badge> : <Badge tone="success">À l&apos;heure</Badge>}</TD>
                      <TD className="text-sm">
                        {day.length
                          ? day.map((u) => `${time(u.starts_at)} ${u.class_subject?.subject?.name ?? ""} ${u.class?.name ?? ""}${u.method === "manual" ? " (manuel)" : ""}`).join(" · ")
                          : "—"}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      ) : null}
    </div>
  );
}
