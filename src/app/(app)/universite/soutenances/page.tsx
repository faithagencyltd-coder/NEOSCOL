import { Mic, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog, type QuickField } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { saveDefense } from "@/features/university/actions";
import { UniversityHeader } from "@/features/university/components/university-header";
import { DEFENSE_STATUS, fmtNote } from "@/features/university/config";
import { requireUniversity } from "@/features/university/guard";
import { defensesList, studentOptions, thesesList, universityRooms } from "@/features/university/queries";
import { can } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Soutenances" };

type Opt = { value: string; label: string };
type JuryMember = { name?: string; role?: string };
const val = (v: unknown) => (v === null || v === undefined ? undefined : String(v));

/** Date et heure locales (fuseau de l'établissement) d'un instant. */
function localParts(iso: string | null | undefined, timeZone: string) {
  if (!iso) return { date: undefined, time: undefined };
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour").replace("24", "00")}:${g("minute")}` };
}

function fields(o: { students: Opt[]; theses: Opt[]; rooms: Opt[] }, tz: string, v: Record<string, unknown> & { jury?: unknown } = {}): QuickField[] {
  const when = localParts(v.scheduled_at as string | undefined, tz);
  const jury = Array.isArray(v.jury) ? (v.jury as JuryMember[]).map((m) => `${m.name ?? ""} — ${m.role ?? "Membre"}`).join("\n") : undefined;
  return [
    ...(v.id ? [] : [{ name: "student_id", label: "Étudiant", type: "select" as const, required: true, options: o.students, wide: true }]),
    { name: "title", label: "Intitulé", required: true, defaultValue: val(v.title), placeholder: "Soutenance de mémoire de Master", wide: true },
    { name: "thesis_id", label: "Mémoire / thèse", type: "select", options: o.theses, defaultValue: val(v.thesis_id), wide: true },
    { name: "date", label: "Date", type: "date", required: true, defaultValue: when.date },
    { name: "time", label: "Heure", type: "time", required: true, defaultValue: when.time ?? "09:00" },
    { name: "room_id", label: "Salle", type: "select", options: o.rooms, defaultValue: val(v.room_id) },
    { name: "status", label: "Statut", type: "select", required: true, options: Object.entries(DEFENSE_STATUS).map(([value, s]) => ({ value, label: s.label })), defaultValue: val(v.status) ?? "scheduled" },
    { name: "jury", label: "Jury (une ligne par membre : Nom — Rôle)", type: "textarea", defaultValue: jury, placeholder: "Pr Aya KOFFI — Présidente\nDr Paul N'GUESSAN — Rapporteur" },
    { name: "grade", label: "Note (/20)", type: "number", min: 0, max: 20, step: "0.25", defaultValue: val(v.grade) },
    { name: "mention", label: "Mention", defaultValue: val(v.mention) },
    { name: "decision", label: "Décision du jury", defaultValue: val(v.decision), wide: true },
    { name: "minutes", label: "Procès-verbal / observations", type: "textarea", defaultValue: val(v.minutes) },
  ];
}

export default async function DefensesPage() {
  const context = await requireUniversity(["students.read", "theses.manage"], "defenses");
  const orgId = context.organization.id;
  const tz = context.organization.timezone;
  const manage = can(context, "theses.manage");
  const [rows, students, theses, rooms] = await Promise.all([
    defensesList(orgId),
    manage ? studentOptions(orgId) : Promise.resolve([]),
    manage ? thesesList(orgId) : Promise.resolve([]),
    manage ? universityRooms(orgId) : Promise.resolve([]),
  ]);
  const opts = {
    students,
    theses: theses.filter((t) => t.status !== "abandoned").map((t) => ({ value: t.id, label: `${t.student?.last_name ?? ""} ${t.student?.first_name ?? ""} — ${t.title.slice(0, 80)}` })),
    rooms: rooms.filter((r) => r.is_available).map((r) => ({ value: r.id, label: r.name })),
  };

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <UniversityHeader
        title="Soutenances"
        description="Planification (date, heure, salle), jury, note, mention, décision et procès-verbal. L'étudiant est notifié de la programmation."
        actions={manage ? <QuickFormDialog title="Programmer une soutenance" triggerLabel="Programmer" action={saveDefense} fields={fields(opts, tz)} /> : null}
      />
      <Card>
        {rows.length === 0 ? (
          <CardContent>
            <EmptyState icon={Mic} title="Aucune soutenance" />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Étudiant</TH>
                <TH>Intitulé</TH>
                <TH>Jury</TH>
                <TH>Résultat</TH>
                <TH>Statut</TH>
                {manage ? <TH className="text-right">Actions</TH> : null}
              </TR>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap text-sm">
                    {r.scheduled_at ? formatDateTime(r.scheduled_at, "fr-FR", tz) : "—"}
                    <span className="block text-xs text-muted-foreground">{r.room?.name ?? ""}</span>
                  </TD>
                  <TD>
                    <Link href={`/eleves/${r.student_id}?onglet=universite`} className="grid hover:text-primary">
                      <span className="font-medium">
                        {r.student?.last_name} {r.student?.first_name}
                      </span>
                      <span className="text-xs text-muted-foreground">{r.student?.matricule}</span>
                    </Link>
                  </TD>
                  <TD className="max-w-sm text-sm">{r.title}</TD>
                  <TD className="text-xs">
                    {Array.isArray(r.jury)
                      ? (r.jury as JuryMember[]).map((m, i) => (
                          <span key={i} className="block">
                            {m.name} <span className="text-muted-foreground">({m.role})</span>
                          </span>
                        ))
                      : "—"}
                  </TD>
                  <TD className="text-sm">
                    {r.grade !== null ? `${fmtNote(r.grade)}/20` : "—"}
                    {r.mention ? <span className="block text-xs text-muted-foreground">{r.mention}</span> : null}
                    {r.decision ? <span className="block text-xs">{r.decision}</span> : null}
                  </TD>
                  <TD>
                    <StatusBadge value={r.status} map={DEFENSE_STATUS} />
                  </TD>
                  {manage ? (
                    <TD className="text-right">
                      <QuickFormDialog
                        title={`Soutenance — ${r.student?.first_name} ${r.student?.last_name}`}
                        action={saveDefense}
                        hidden={{ id: r.id, student_id: r.student_id }}
                        fields={fields(opts, tz, r)}
                        trigger={
                          <Button variant="ghost" size="sm" aria-label={`Modifier la soutenance de ${r.student?.first_name} ${r.student?.last_name}`}>
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
