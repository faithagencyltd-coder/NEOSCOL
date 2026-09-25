import { CalendarClock } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { LinkSelect } from "@/components/shared/link-select";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { TabNav } from "@/components/shared/tab-nav";
import { Card, CardContent } from "@/components/ui/card";
import { getClasses, getCurrentYear, getRooms, getTeachers } from "@/features/academic/queries";
import { createSlot } from "@/features/timetable/actions";
import { TimetableGrid } from "@/features/timetable/components/timetable-grid";
import { getClassSubjectsForClass, getMyStaffMember, getSlots, getTrainingGroups } from "@/features/timetable/queries";
import { isTrainingOrg } from "@/features/training/config";
import { isoWeekday, todayIn, WEEKDAYS } from "@/lib/dates";
import { requireOrganization } from "@/lib/auth/guards";
import { can, canAny } from "@/lib/auth/session";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Emploi du temps" };

export default async function TimetablePage({ searchParams }: PageProps<"/emploi-du-temps">) {
  const context = await requireOrganization();
  if (!canAny(context, ["timetable.read", "timetable.manage"])) notFound();
  const organizationId = context.organization.id;
  const params = await searchParams;
  const year = await getCurrentYear(organizationId);
  if (!year) {
    return (
      <Card>
        <CardContent className="pt-5">
          <EmptyState icon={CalendarClock} title="Aucune année scolaire" />
        </CardContent>
      </Card>
    );
  }

  const me = await getMyStaffMember(organizationId, context.user.id);
  const [classes, teachers] = await Promise.all([
    getClasses(organizationId, year.id),
    can(context, "staff.read") ? getTeachers(organizationId) : Promise.resolve([]),
  ]);

  const requestedClass = param(params, "classe");
  const requestedTeacher = param(params, "enseignant");
  const requestedRoom = param(params, "salle");
  const requestedGroup = param(params, "groupe");
  const training = isTrainingOrg(context.organization.type);
  const mode: "class" | "teacher" | "room" = isUuid(requestedRoom)
    ? "room"
    : isUuid(requestedTeacher) || (!isUuid(requestedClass) && me?.is_teacher)
      ? "teacher"
      : "class";
  const teacherId = mode === "teacher" ? (isUuid(requestedTeacher) ? requestedTeacher : me?.id) : undefined;
  const classId = mode === "class" ? (isUuid(requestedClass) ? requestedClass : classes[0]?.id) : undefined;
  const roomId = mode === "room" ? requestedRoom : undefined;
  // Formation professionnelle : groupes (facultatifs) de la session affichée.
  const groups = training && classId ? await getTrainingGroups(classId) : [];
  const groupId = groups.some((g) => g.id === requestedGroup) ? requestedGroup : undefined;

  const teacherOptions = [
    ...(me?.is_teacher && !teachers.some((t) => t.id === me.id) ? [{ id: me.id, first_name: me.first_name, last_name: me.last_name }] : []),
    ...teachers,
  ];
  const slots = classId || teacherId || roomId ? await getSlots(organizationId, year.id, { classId, teacherId, roomId, groupId }) : [];
  const canManage = can(context, "timetable.manage");
  const [classSubjects, rooms] = await Promise.all([
    canManage && classId ? getClassSubjectsForClass(classId) : Promise.resolve([]),
    (canManage && classId) || training ? getRooms(organizationId) : Promise.resolve([]),
  ]);
  const today = isoWeekday(todayIn(context.organization.timezone));
  const selectedClass = classes.find((c) => c.id === classId);

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">Pédagogie</p>
          <h1 className="text-2xl font-semibold sm:text-[26px]">Emploi du temps</h1>
          <p className="text-sm text-muted-foreground">Semaine type · année {year.name}</p>
        </div>
        {canManage && classId && selectedClass ? (
          <QuickFormDialog
            title={`Nouveau créneau — ${selectedClass.name}`}
            description="Les conflits (classe, enseignant, salle) sont refusés automatiquement."
            triggerLabel="Ajouter un créneau"
            action={createSlot}
            hidden={{ class_id: classId }}
            fields={[
              { name: "class_subject_id", label: "Matière", type: "select", required: true, options: classSubjects.map((cs) => ({ value: cs.id, label: cs.label })), wide: true },
              { name: "weekday", label: "Jour", type: "select", required: true, options: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: String(d), label: WEEKDAYS[d]! })), defaultValue: "1" },
              { name: "room_id", label: "Salle", type: "select", options: rooms.map((r) => ({ value: r.id, label: r.name })) },
              ...(groups.length > 0
                ? [{ name: "group_id", label: "Groupe", type: "select" as const, options: groups.map((g) => ({ value: g.id, label: g.name })), defaultValue: groupId, hint: "Vide : toute la session." }]
                : []),
              { name: "starts_at", label: "Début", type: "time", required: true, defaultValue: "08:00" },
              { name: "ends_at", label: "Fin", type: "time", required: true, defaultValue: "10:00" },
            ]}
          />
        ) : null}
      </div>

      <TabNav
        label="Vue"
        active={mode}
        tabs={[
          { key: "class", label: training ? "Par session" : "Par classe", href: `/emploi-du-temps?classe=${classId ?? classes[0]?.id ?? ""}` },
          ...(teacherOptions.length > 0
            ? [{ key: "teacher", label: me?.is_teacher && teachers.length === 0 ? "Mon emploi du temps" : training ? "Par formateur" : "Par enseignant", href: `/emploi-du-temps?enseignant=${teacherId ?? me?.id ?? teacherOptions[0]!.id}` }]
            : []),
          ...(training && rooms.length > 0 ? [{ key: "room", label: "Par salle", href: `/emploi-du-temps?salle=${roomId ?? rooms[0]!.id}` }] : []),
        ]}
      />

      <div className="flex flex-wrap gap-3">
        {mode === "room" ? (
          <LinkSelect
            label="Salle"
            className="w-full sm:w-64"
            value={roomId ?? ""}
            options={rooms.map((r) => ({ value: r.id, label: r.name, href: `/emploi-du-temps?salle=${r.id}` }))}
          />
        ) : mode === "class" ? (
          <>
            <LinkSelect
              label={training ? "Session" : "Classe"}
              className="w-full sm:w-64"
              value={classId ?? ""}
              options={classes.map((c) => ({ value: c.id, label: c.name, href: `/emploi-du-temps?classe=${c.id}` }))}
            />
            {groups.length > 0 ? (
              <LinkSelect
                label="Groupe"
                className="w-full sm:w-56"
                value={groupId ?? ""}
                options={[
                  { value: "", label: "Toute la session", href: `/emploi-du-temps?classe=${classId}` },
                  ...groups.map((g) => ({ value: g.id, label: g.name, href: `/emploi-du-temps?classe=${classId}&groupe=${g.id}` })),
                ]}
              />
            ) : null}
          </>
        ) : (
          <LinkSelect
            label="Enseignant"
            className="w-full sm:w-72"
            value={teacherId ?? ""}
            options={teacherOptions.map((t) => ({
              value: t.id,
              label: `${t.last_name} ${t.first_name}${t.id === me?.id ? " (moi)" : ""}`,
              href: `/emploi-du-temps?enseignant=${t.id}`,
            }))}
          />
        )}
      </div>

      {slots.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={CalendarClock}
              title="Aucun cours planifié"
              description={canManage && mode === "class" ? "Ajoutez les créneaux de la semaine type." : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <TimetableGrid slots={slots} mode={mode} today={today} canManage={canManage && mode === "class"} />
      )}
    </div>
  );
}
