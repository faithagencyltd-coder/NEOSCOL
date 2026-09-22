import { School, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createClass } from "@/features/academic/actions";
import { classFields } from "@/features/academic/components/class-fields";
import {
  getAcademicYears,
  getClasses,
  getClassHeadcounts,
  getCurrentYear,
  getLevels,
  getPrograms,
  getRooms,
  getTeachers,
} from "@/features/academic/queries";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { CLASS_KIND } from "@/lib/labels";
import { cn } from "@/lib/utils/cn";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Classes" };

export default async function ClassesPage({ searchParams }: PageProps<"/classes">) {
  const context = await requirePermission("academic.read");
  const organizationId = context.organization.id;
  const params = await searchParams;
  const years = await getAcademicYears(organizationId);
  const requestedYear = param(params, "annee");
  const year = (isUuid(requestedYear) ? years.find((y) => y.id === requestedYear) : null) ?? (await getCurrentYear(organizationId));

  const manage = can(context, "academic.manage");
  const [classes, levels, programs, rooms, teachers] = await Promise.all([
    year ? getClasses(organizationId, year.id) : Promise.resolve([]),
    manage ? getLevels(organizationId) : Promise.resolve([]),
    manage ? getPrograms(organizationId) : Promise.resolve([]),
    manage ? getRooms(organizationId) : Promise.resolve([]),
    manage && can(context, "staff.read") ? getTeachers(organizationId) : Promise.resolve([]),
  ]);
  const counts = await getClassHeadcounts(organizationId, classes.map((c) => c.id));

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">Scolarité</p>
          <h1 className="text-2xl font-semibold sm:text-[26px]">Classes et sessions</h1>
          <p className="text-sm text-muted-foreground">
            {classes.length} classe{classes.length > 1 ? "s" : ""}
            {year ? ` · année ${year.name}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {years.length > 1 ? (
            <nav aria-label="Année scolaire" className="flex gap-1 rounded-xl border border-border bg-surface p-1">
              {years.map((y) => (
                <Link
                  key={y.id}
                  href={`/classes?annee=${y.id}`}
                  aria-current={y.id === year?.id ? "page" : undefined}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium",
                    y.id === year?.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-muted",
                  )}
                >
                  {y.name}
                </Link>
              ))}
            </nav>
          ) : null}
          {manage && year ? (
            <QuickFormDialog
              title={`Nouvelle classe — ${year.name}`}
              triggerLabel="Nouvelle classe"
              action={createClass}
              hidden={{ academic_year_id: year.id }}
              fields={classFields({ levels, programs, rooms, teachers })}
            />
          ) : null}
        </div>
      </div>

      {!year ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState icon={School} title="Aucune année scolaire" description="Créez d'abord une année dans la structure académique." />
          </CardContent>
        </Card>
      ) : classes.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState icon={School} title="Aucune classe pour cette année" />
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((klass) => {
            const count = counts.get(klass.id) ?? 0;
            const ratio = klass.capacity ? Math.min(count / klass.capacity, 1) : null;
            return (
              <li key={klass.id}>
                <Link href={`/classes/${klass.id}`} className="block h-full">
                  <Card className="grid h-full gap-4 p-5 transition-shadow hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid gap-0.5">
                        <h2 className="text-lg font-semibold">{klass.name}</h2>
                        <p className="text-sm text-muted-foreground">
                          {[klass.level?.name, klass.program?.name].filter(Boolean).join(" · ") || CLASS_KIND[klass.kind]}
                        </p>
                      </div>
                      {klass.kind === "training_session" ? <Badge tone="info">Session</Badge> : null}
                    </div>
                    <div className="grid gap-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Users className="size-4" aria-hidden /> Effectif
                        </span>
                        <strong className="tabular-nums">
                          {count}
                          {klass.capacity ? ` / ${klass.capacity}` : ""}
                        </strong>
                      </div>
                      {ratio !== null ? (
                        <span className="h-2 overflow-hidden rounded-full bg-surface-muted">
                          <span
                            className={cn("block h-full rounded-full", ratio >= 1 ? "bg-danger" : "bg-primary")}
                            style={{ width: `${Math.max(ratio * 100, count > 0 ? 3 : 0)}%` }}
                          />
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {klass.head_teacher ? `Prof. principal : ${klass.head_teacher.first_name} ${klass.head_teacher.last_name}` : "Aucun professeur principal"}
                      {klass.room ? ` · ${klass.room.name}` : ""}
                    </p>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
