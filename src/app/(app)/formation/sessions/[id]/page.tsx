import { Award, CalendarClock, IdCard, NotebookPen, Pencil, UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { DetailList } from "@/components/shared/detail-list";
import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { getRooms, getTeachers } from "@/features/academic/queries";
import { assignGroup, assignSessionModule, issueSessionBadges, saveGroup, saveSession, setGroupArchived } from "@/features/training/actions";
import { sessionState } from "@/features/training/config";
import { sessionFields } from "@/features/training/fields";
import { requireTraining } from "@/features/training/guard";
import { getFormation, getSession } from "@/features/training/queries";
import { can } from "@/lib/auth/session";
import { todayIn } from "@/lib/dates";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Session de formation" };

export default async function SessionPage({ params, searchParams }: PageProps<"/formation/sessions/[id]">) {
  const context = await requireTraining("academic.read");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const organization = context.organization;
  const data = await getSession(organization.id, id);
  if (!data) notFound();
  const { session, groups, modules, learners } = data;
  const query = await searchParams;
  const today = todayIn(organization.timezone);
  const state = sessionState(session, today);
  const manage = can(context, "academic.manage");
  const groupsOn = context.training.groupsEnabled;
  const activeGroups = groups.filter((g) => !g.archived_at);
  const [rooms, teachers, formation] = await Promise.all([
    manage ? getRooms(organization.id) : Promise.resolve([]),
    manage && can(context, "staff.read") ? getTeachers(organization.id) : Promise.resolve([]),
    manage && session.program ? getFormation(organization.id, session.program.id) : Promise.resolve(null),
  ]);
  const money = (n: number) => formatMoney(n, organization.currency);
  const tuition = session.tuition_amount ?? session.program?.tuition_amount ?? null;
  const trainers = [...new Map(modules.filter((m) => m.teacher).map((m) => [m.teacher!.id, `${m.teacher!.first_name} ${m.teacher!.last_name}`])).values()];
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const withoutBadge = learners.filter((l) => !l.badge && l.status === "validated").length;

  return (
    <div className="grid min-w-0 gap-5 [&>*]:min-w-0">
      <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
        <Link href="/formation/sessions" className="hover:text-primary">
          Sessions
        </Link>{" "}
        / <span className="text-foreground">{session.name}</span>
      </nav>
      {param(query, "cree") ? <Alert tone="success">Session créée. Affectez les modules à leurs formateurs, puis planifiez l&apos;emploi du temps.</Alert> : null}

      <Card className="anim-fade-up">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {session.program ? (
                <Link href={`/formation/formations/${session.program.id}`} className="hover:text-primary">
                  {session.program.name}
                </Link>
              ) : null}
            </span>
            <CardTitle className="flex flex-wrap items-center gap-3 text-2xl">
              {session.name}
              <StatusBadge value={state.key} map={{ [state.key]: state }} />
            </CardTitle>
          </div>
          <div className="flex flex-wrap gap-2">
            {can(context, "enrollments.manage") && state.key !== "finished" ? (
              <Button asChild size="sm">
                <Link href={`/formation/inscription?session=${session.id}`}>
                  <UserPlus aria-hidden /> Inscrire un apprenant
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="secondary" size="sm">
              <Link href={`/emploi-du-temps?classe=${session.id}`}>
                <CalendarClock aria-hidden /> Emploi du temps
              </Link>
            </Button>
            {can(context, "grades.enter") || can(context, "grades.manage") ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/formation/sessions/${session.id}/competences`}>
                  <Award aria-hidden /> Compétences
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="secondary" size="sm">
              <Link href={`/classes/${session.id}`}>
                <NotebookPen aria-hidden /> Évaluations et appel
              </Link>
            </Button>
            {manage ? (
              <QuickFormDialog
                title="Modifier la session"
                action={saveSession}
                fields={sessionFields({ formations: [], rooms, teachers }, { ...session, program_id: session.program?.id ?? "" })}
                hidden={{ session_id: session.id, program_id: session.program?.id ?? "" }}
                trigger={
                  <Button variant="secondary" size="sm">
                    <Pencil aria-hidden /> Modifier
                  </Button>
                }
              />
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <DetailList
            items={[
              { label: "Dates", value: `${session.starts_on ? formatDate(session.starts_on, "fr-FR", { dateStyle: "long" }) : "—"} → ${session.ends_on ? formatDate(session.ends_on, "fr-FR", { dateStyle: "long" }) : "—"}` },
              { label: "Capacité", value: `${learners.length} inscrit(s)${session.capacity ? ` / ${session.capacity} places` : ""}` },
              { label: "Formateur référent", value: session.head_teacher ? `${session.head_teacher.first_name} ${session.head_teacher.last_name}` : null },
              { label: "Formateurs", value: trainers.join(", ") },
              { label: "Salle principale", value: session.room?.name },
              { label: "Tarif", value: tuition != null ? `${money(Number(tuition))}${session.tuition_amount != null ? " (propre à la session)" : ""}` : null },
              { label: "Programme", value: session.syllabus },
              { label: "Certificat délivré", value: session.program?.certificate_title },
            ]}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card className="anim-fade-up">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="grid gap-1">
              <CardTitle>Modules et formateurs</CardTitle>
              <CardDescription>Chaque module est assuré par un formateur ; il sert à l&apos;emploi du temps et au scan.</CardDescription>
            </div>
            {manage && formation ? (
              <QuickFormDialog
                title="Affecter un module"
                triggerLabel="Affecter"
                action={assignSessionModule}
                hidden={{ session_id: session.id }}
                fields={[
                  { name: "subject_id", label: "Module", type: "select", required: true, options: formation.modules.filter((m) => m.is_active).map((m) => ({ value: m.id, label: m.name })), wide: true },
                  { name: "teacher_id", label: "Formateur", type: "select", options: teachers.map((t) => ({ value: t.id, label: `${t.last_name} ${t.first_name}` })) },
                  { name: "weekly_hours", label: "Heures / semaine", type: "number", min: 0, max: 60 },
                ]}
              />
            ) : null}
          </CardHeader>
          <CardContent>
            {modules.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun module affecté. Ajoutez d&apos;abord les modules à la formation.</p>
            ) : (
              <ul className="grid gap-2">
                {modules.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                    <span className="font-medium">{m.subject?.name ?? "—"}</span>
                    <span className="text-muted-foreground">
                      {m.teacher ? `${m.teacher.first_name} ${m.teacher.last_name}` : "Formateur à désigner"}
                      {m.weekly_hours ? ` · ${m.weekly_hours} h/sem.` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="anim-fade-up">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="grid gap-1">
              <CardTitle>Classes / groupes</CardTitle>
              <CardDescription>
                {groupsOn
                  ? "Facultatif : créez des groupes seulement si la session est divisée."
                  : "Désactivés pour ce centre : la session fonctionne sans groupe."}
              </CardDescription>
            </div>
            {manage && groupsOn ? (
              <QuickFormDialog
                title="Nouveau groupe"
                triggerLabel="Nouveau groupe"
                action={saveGroup}
                hidden={{ session_id: session.id }}
                fields={[
                  { name: "name", label: "Nom", required: true, placeholder: "Groupe A", wide: true },
                  { name: "capacity", label: "Capacité", type: "number", min: 1 },
                  { name: "room_id", label: "Salle", type: "select", options: rooms.map((r) => ({ value: r.id, label: r.name })) },
                ]}
              />
            ) : null}
          </CardHeader>
          <CardContent>
            {!groupsOn && groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {can(context, "settings.manage") ? (
                  <>
                    Activez-les dans <Link href="/formation/parametres" className="font-medium text-primary hover:underline">Paramètres de formation</Link> si besoin.
                  </>
                ) : (
                  "Aucun groupe."
                )}
              </p>
            ) : groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun groupe : tous les apprenants suivent la session entière.</p>
            ) : (
              <ul className="grid gap-2">
                {groups.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                    <span className={g.archived_at ? "text-muted-foreground line-through" : "font-medium"}>
                      {g.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {learners.filter((l) => l.group_id === g.id).length} apprenant(s){g.capacity ? ` / ${g.capacity}` : ""}
                        {g.room ? ` · ${g.room.name}` : ""}
                      </span>
                    </span>
                    {manage ? (
                      <ConfirmAction
                        trigger={
                          <Button variant="ghost" size="sm">
                            {g.archived_at ? "Restaurer" : "Archiver"}
                          </Button>
                        }
                        title={g.archived_at ? "Restaurer ce groupe ?" : "Archiver ce groupe ?"}
                        description="Rien n'est supprimé : les apprenants et l'historique sont conservés."
                        confirmLabel={g.archived_at ? "Restaurer" : "Archiver"}
                        action={setGroupArchived}
                        fields={{ group_id: g.id, session_id: session.id, archive: g.archived_at ? "false" : "true" }}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="anim-fade-up">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-1">
            <CardTitle>Apprenants</CardTitle>
            <CardDescription>
              {learners.length} inscrit(s) · situation financière et badge de chaque apprenant.
            </CardDescription>
          </div>
          {can(context, "students.badges.manage") && withoutBadge > 0 ? (
            <ConfirmAction
              trigger={
                <Button variant="secondary" size="sm">
                  <IdCard aria-hidden /> Générer les badges manquants ({withoutBadge})
                </Button>
              }
              title="Générer les badges de la session ?"
              description="Un badge QR personnel est créé pour chaque apprenant actif qui n'en a pas encore."
              confirmLabel="Générer"
              action={issueSessionBadges}
              fields={{ session_id: session.id }}
            />
          ) : null}
        </CardHeader>
        {learners.length === 0 ? (
          <EmptyState icon={Users} title="Aucun apprenant inscrit" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Apprenant</TH>
                {groupsOn || groups.length > 0 ? <TH>Groupe</TH> : null}
                <TH>Badge</TH>
                {can(context, "finance.read") ? <TH className="text-right">Payé / reste</TH> : null}
              </tr>
            </THead>
            <tbody>
              {learners.map((l) => (
                <TR key={l.id}>
                  <TD>
                    <Link href={`/eleves/${l.student!.id}`} className="flex items-center gap-3 hover:text-primary">
                      <Avatar name={`${l.student!.first_name} ${l.student!.last_name}`} photoId={l.student!.photo_path} className="size-9" />
                      <span className="grid">
                        <span className="font-medium">
                          {l.student!.last_name} {l.student!.first_name}
                        </span>
                        <span className="text-xs text-muted-foreground">{l.student!.matricule}</span>
                      </span>
                    </Link>
                  </TD>
                  {groupsOn || groups.length > 0 ? (
                    <TD>
                      {can(context, "enrollments.manage") && activeGroups.length > 0 ? (
                        <QuickFormDialog
                          title={`Groupe de ${l.student!.first_name} ${l.student!.last_name}`}
                          action={assignGroup}
                          hidden={{ enrollment_id: l.id, session_id: session.id }}
                          fields={[
                            {
                              name: "group_id",
                              label: "Groupe",
                              type: "select",
                              options: activeGroups.map((g) => ({ value: g.id, label: g.name })),
                              defaultValue: l.group_id ?? undefined,
                              hint: "Vide : aucun groupe (toute la session).",
                              wide: true,
                            },
                          ]}
                          trigger={
                            <Button variant="ghost" size="sm">
                              {l.group_id ? groupName.get(l.group_id) : "Sans groupe"}
                            </Button>
                          }
                        />
                      ) : (
                        <span className="text-sm">{l.group_id ? groupName.get(l.group_id) : "—"}</span>
                      )}
                    </TD>
                  ) : null}
                  <TD>{l.badge ? <Badge tone="success">{l.badge}</Badge> : <Badge tone="neutral">Aucun</Badge>}</TD>
                  {can(context, "finance.read") ? (
                    <TD className="text-right text-sm tabular-nums">
                      {l.finance ? (
                        <span className="grid justify-items-end">
                          <span>{money(l.finance.paid)}</span>
                          <span className={l.finance.balance > 0 ? (l.finance.overdue ? "font-semibold text-danger" : "text-warning") : "text-success"}>
                            {l.finance.balance > 0 ? `Reste ${money(l.finance.balance)}` : "Soldé"}
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
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
