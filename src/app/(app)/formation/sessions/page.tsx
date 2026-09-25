import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { getRooms, getTeachers } from "@/features/academic/queries";
import { saveSession } from "@/features/training/actions";
import { sessionState } from "@/features/training/config";
import { sessionFields } from "@/features/training/fields";
import { requireTraining } from "@/features/training/guard";
import { listFormations, listSessions } from "@/features/training/queries";
import { can } from "@/lib/auth/session";
import { todayIn } from "@/lib/dates";
import { formatDate } from "@/lib/utils/format";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Sessions de formation" };

const FILTERS = [
  { key: "", label: "Toutes" },
  { key: "ongoing", label: "En cours" },
  { key: "planned", label: "À venir" },
  { key: "finished", label: "Terminées" },
] as const;

export default async function SessionsPage({ searchParams }: PageProps<"/formation/sessions">) {
  const context = await requireTraining("academic.read");
  const organization = context.organization;
  const today = todayIn(organization.timezone);
  const filter = param(await searchParams, "etat") ?? "";
  const manage = can(context, "academic.manage");
  const [sessions, formations, rooms, teachers] = await Promise.all([
    listSessions(organization.id),
    manage ? listFormations(organization.id) : Promise.resolve([]),
    manage ? getRooms(organization.id) : Promise.resolve([]),
    manage && can(context, "staff.read") ? getTeachers(organization.id) : Promise.resolve([]),
  ]);
  const visible = sessions.filter((s) => !s.archived_at && (!filter || sessionState(s, today).key === filter));

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Sessions et groupes"
        description={
          context.training.groupsEnabled
            ? "Chaque session appartient à une formation ; ses groupes (classes) sont facultatifs."
            : "Chaque session appartient à une formation. Les classes / groupes sont désactivés : les apprenants suivent la session entière."
        }
        actions={
          manage ? (
            <QuickFormDialog
              title="Nouvelle session"
              triggerLabel="Nouvelle session"
              action={saveSession}
              fields={sessionFields({ formations: formations.filter((f) => f.is_active), rooms, teachers })}
              submitLabel="Créer la session"
            />
          ) : null
        }
      />
      <nav aria-label="État des sessions" className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1 sm:w-fit">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `/formation/sessions?etat=${f.key}` : "/formation/sessions"}
            aria-current={filter === f.key ? "page" : undefined}
            className={
              filter === f.key
                ? "rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                : "rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-surface-muted"
            }
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <Card>
        {visible.length === 0 ? (
          <EmptyState icon={CalendarDays} title="Aucune session" description="Créez une session à partir d'une formation active." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Session</TH>
                <TH>Formation</TH>
                <TH>Dates</TH>
                <TH>État</TH>
                {context.training.groupsEnabled ? <TH>Groupes</TH> : null}
                <TH>Référent</TH>
                <TH className="text-right">Apprenants</TH>
              </tr>
            </THead>
            <tbody>
              {visible.map((s) => {
                const state = sessionState(s, today);
                return (
                  <TR key={s.id}>
                    <TD>
                      <Link href={`/formation/sessions/${s.id}`} className="font-medium hover:text-primary">
                        {s.name}
                      </Link>
                    </TD>
                    <TD className="text-sm">{s.program?.name ?? "—"}</TD>
                    <TD className="text-sm tabular-nums">
                      {s.starts_on ? formatDate(s.starts_on, "fr-FR", { dateStyle: "short" }) : "—"} → {s.ends_on ? formatDate(s.ends_on, "fr-FR", { dateStyle: "short" }) : "—"}
                    </TD>
                    <TD>
                      <StatusBadge value={state.key} map={{ [state.key]: state }} />
                    </TD>
                    {context.training.groupsEnabled ? (
                      <TD className="text-sm">{(s.groups ?? []).filter((g) => !g.archived_at).map((g) => g.name).join(", ") || "—"}</TD>
                    ) : null}
                    <TD className="text-sm">{s.head_teacher ? `${s.head_teacher.first_name} ${s.head_teacher.last_name}` : "—"}</TD>
                    <TD className="text-right tabular-nums">
                      {s.headcount}
                      {s.capacity ? ` / ${s.capacity}` : ""}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
