import { School, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createClass } from "@/features/academic/actions";
import { classFields } from "@/features/academic/components/class-fields";
import { levelVisible, programVisible, SCHOOL_LEVEL_LABELS, schoolConfigOf } from "@/features/academic/school";
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
import { ownClassScope } from "@/lib/auth/scope";
import { can } from "@/lib/auth/session";
import { CLASS_KIND } from "@/lib/labels";
import { cn } from "@/lib/utils/cn";
import { isUuid, param } from "@/lib/utils/search-params";
import { vocabularyFor } from "@/lib/vocabulary";

export const metadata: Metadata = { title: "Classes" };

export default async function ClassesPage({ searchParams }: PageProps<"/classes">) {
  const context = await requirePermission("academic.read");
  const v = vocabularyFor(context.organization.type);
  const organizationId = context.organization.id;
  const params = await searchParams;
  const years = await getAcademicYears(organizationId);
  const requestedYear = param(params, "annee");
  const year = (isUuid(requestedYear) ? years.find((y) => y.id === requestedYear) : null) ?? (await getCurrentYear(organizationId));

  const manage = can(context, "academic.manage");
  const scope = await ownClassScope(context);
  const [allClasses, levels, programs, rooms, teachers] = await Promise.all([
    year ? getClasses(organizationId, year.id) : Promise.resolve([]),
    manage ? getLevels(organizationId) : Promise.resolve([]),
    manage ? getPrograms(organizationId) : Promise.resolve([]),
    manage ? getRooms(organizationId) : Promise.resolve([]),
    manage && can(context, "staff.read") ? getTeachers(organizationId) : Promise.resolve([]),
  ]);
  // Module Scolaire : seuls les niveaux et séries activés sont proposés ; filtre par niveau.
  const school = schoolConfigOf(context.organization.settings);
  const levelChoices = levels.filter((l) => levelVisible(l, school));
  const programChoices = programs.filter((p) => programVisible(p, school));
  const cycleFilter = school?.levels.find((l) => l === param(params, "niveau")) ?? null;
  const scoped = scope ? allClasses.filter((c) => scope.has(c.id)) : allClasses;
  const classes = cycleFilter ? scoped.filter((c) => c.level?.school_cycle === cycleFilter) : scoped;
  const counts = await getClassHeadcounts(organizationId, classes.map((c) => c.id));

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">Scolarité</p>
          <h1 className="text-2xl font-semibold sm:text-[26px]">{v.classes}</h1>
          <p className="text-sm text-muted-foreground">
            {classes.length} {(classes.length > 1 ? v.classes : v.klass).toLowerCase()}
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
              title={`Nouvelle ${v.klass.toLowerCase()} — ${year.name}`}
              triggerLabel={`Nouvelle ${v.klass.toLowerCase()}`}
              action={createClass}
              hidden={{ academic_year_id: year.id }}
              fields={classFields({ levels: levelChoices, programs: programChoices, rooms, teachers })}
            />
          ) : null}
        </div>
      </div>

      {school && school.levels.length > 1 ? (
        <nav aria-label="Filtrer par niveau" className="flex flex-wrap gap-1.5 text-xs">
          {[{ key: null, label: "Tous les niveaux" }, ...school.levels.map((l) => ({ key: l, label: SCHOOL_LEVEL_LABELS[l] }))].map((f) => {
            const query = new URLSearchParams();
            if (year && years.length > 1) query.set("annee", year.id);
            if (f.key) query.set("niveau", f.key);
            return (
              <Link
                key={f.key ?? "tous"}
                href={`/classes${query.size ? `?${query}` : ""}`}
                aria-current={cycleFilter === f.key ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 font-medium transition-colors",
                  cycleFilter === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary hover:text-primary",
                )}
              >
                {f.label}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {!year ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState icon={School} title="Aucune année scolaire" description="Créez d'abord une année dans la structure académique." />
          </CardContent>
        </Card>
      ) : classes.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState icon={School} title={`Aucune ${v.klass.toLowerCase()} pour cette année`} />
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
