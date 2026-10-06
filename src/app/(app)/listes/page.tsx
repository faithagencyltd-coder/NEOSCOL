import { CalendarClock, FileSpreadsheet, FileText, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { LinkSelect } from "@/components/shared/link-select";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTeachers } from "@/features/academic/queries";
import { getClassLists, getExportOptions, getYears, groupingLabels, resolveYear } from "@/features/exports/data";
import { todayIn } from "@/lib/dates";
import { requireOrganization } from "@/lib/auth/guards";
import { can, canAny } from "@/lib/auth/session";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Listes et exportations" };

const SELECT = "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm";

function Select({ name, label, options, all }: { name: string; label: string; options: { id: string; name: string }[]; all: string }) {
  if (!options.length) return null;
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <select name={name} className={SELECT} defaultValue="">
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Listes et exportations : listes des élèves / étudiants / apprenants (PDF,
 * Excel) et emplois du temps (PDF), toujours séparés par classe (session,
 * promotion, groupe), pour l'établissement actif et selon les droits.
 */
export default async function ListsExportPage({ searchParams }: PageProps<"/listes">) {
  const context = await requireOrganization();
  const lists = can(context, "students.read");
  const timetables = canAny(context, ["timetable.read", "timetable.manage"]);
  if (!lists && !timetables) notFound();
  const org = context.organization;
  const params = await searchParams;
  const [years, year] = await Promise.all([getYears(org.id), resolveYear(org.id, param(params, "annee") ?? null)]);
  if (!year) {
    return (
      <Card>
        <CardContent className="pt-5">
          <EmptyState icon={ListChecks} title="Aucune année académique" />
        </CardContent>
      </Card>
    );
  }
  const labels = groupingLabels(org.type);
  const v = labels.vocabulary;
  const [options, preview, teachers] = await Promise.all([
    getExportOptions(org.id, year.id),
    lists ? getClassLists(org.id, { yearId: year.id, classIds: [], levelId: null, programId: null, trackId: null, groupId: null, sex: "all" }, todayIn(org.timezone)) : Promise.resolve([]),
    timetables && can(context, "staff.read") ? getTeachers(org.id) : Promise.resolve([]),
  ]);
  const count = new Map(preview.map((s) => [s.id, s]));
  const totals = preview.reduce((t, s) => ({ all: t.all + s.students.length, boys: t.boys + s.boys, girls: t.girls + s.girls }), { all: 0, boys: 0, girls: 0 });
  const classLabel = (c: (typeof options.classes)[number]) => [c.level, c.program, c.track].filter(Boolean).join(" · ");

  const classPicker = (id: string) =>
    options.classes.length ? (
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">
          {v.classes} <span className="font-normal text-muted-foreground">(aucune case cochée = toutes ; chaque {v.klass.toLowerCase()} reste une liste séparée)</span>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {options.classes.map((c) => {
            const s = count.get(c.id);
            return (
              <label key={c.id} className="flex items-start gap-2 rounded-xl border border-border p-2.5 text-sm hover:bg-surface-muted/50">
                <input type="checkbox" name="classes" value={c.id} className="mt-0.5 size-4 accent-[var(--primary)]" data-testid={`${id}-class`} />
                <span className="grid min-w-0">
                  <span className="font-semibold">{c.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {classLabel(c) || "—"}
                    {s ? ` · ${s.students.length} (${s.boys} G, ${s.girls} F)` : ""}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    ) : (
      <p className="text-sm text-muted-foreground">Aucune {v.klass.toLowerCase()} pour cette année.</p>
    );

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Listes et exportations"
        description={`Listes des ${v.students.toLowerCase()} et emplois du temps en PDF ou Excel, séparés par ${v.klass.toLowerCase()} — ${org.short_name || org.name}.`}
        actions={
          years.length > 1 ? (
            <LinkSelect label={v.year} className="w-56" value={year.id} options={years.map((y) => ({ value: y.id, label: y.name, href: `/listes?annee=${y.id}` }))} />
          ) : null
        }
      />

      {lists ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="size-5 text-primary" aria-hidden /> Listes des {v.students.toLowerCase()}
            </CardTitle>
            <CardDescription>
              {v.year} {year.name} : {totals.all} inscrit(s) — {totals.boys} garçon(s), {totals.girls} fille(s), répartis en {preview.length} {v.classes.toLowerCase()}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form method="get" action="/api/exports/listes" target="_blank" className="grid gap-5" data-testid="list-export-form">
              <input type="hidden" name="annee" value={year.id} />
              {classPicker("list")}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Select name="niveau" label={labels.level} options={options.levels} all="Tous les niveaux" />
                <Select name="filiere" label={labels.program} options={options.programs} all="Toutes" />
                <Select name="parcours" label={labels.track} options={options.tracks} all="Tous" />
                <Select name="groupe" label={labels.group} options={options.groups.map((g) => ({ id: g.id, name: `${g.name} (${options.classes.find((c) => c.id === g.class_id)?.name ?? ""})` }))} all="Tous les groupes" />
              </div>
              <fieldset className="flex flex-wrap gap-3">
                <legend className="mb-2 text-sm font-medium">Sexe</legend>
                {[
                  ["all", "Garçons et filles"],
                  ["M", "Garçons uniquement"],
                  ["F", "Filles uniquement"],
                ].map(([value, text]) => (
                  <label key={value} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                    <input type="radio" name="sexe" value={value} defaultChecked={value === "all"} className="accent-[var(--primary)]" />
                    {text}
                  </label>
                ))}
              </fieldset>
              <div className="grid gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="separer" value="1" className="size-4 accent-[var(--primary)]" /> Séparer garçons et filles dans chaque liste (PDF : deux tableaux ; Excel : deux feuilles)
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="photos" value="1" className="size-4 accent-[var(--primary)]" data-testid="list-photos" /> Inclure les photos des {v.students.toLowerCase()}
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" name="format" value="pdf" data-testid="list-pdf">
                  <FileText aria-hidden /> Exporter en PDF
                </Button>
                <Button type="submit" name="format" value="xlsx" variant="secondary" data-testid="list-xlsx">
                  <FileSpreadsheet aria-hidden /> Exporter en Excel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {timetables ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-5 text-primary" aria-hidden /> Emplois du temps (PDF)
            </CardTitle>
            <CardDescription>Créneaux réellement enregistrés : une page par {v.klass.toLowerCase()} ; une {v.klass.toLowerCase()} sans créneau n&apos;est pas exportée comme un document vide.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <form method="get" action="/api/exports/emplois-du-temps" target="_blank" className="grid gap-5" data-testid="timetable-export-form">
              <input type="hidden" name="annee" value={year.id} />
              {classPicker("tt")}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Select name="niveau" label={labels.level} options={options.levels} all="Tous les niveaux" />
                <Select name="filiere" label={labels.program} options={options.programs} all="Toutes" />
                <Select name="groupe" label={labels.group} options={options.groups.map((g) => ({ id: g.id, name: `${g.name} (${options.classes.find((c) => c.id === g.class_id)?.name ?? ""})` }))} all="Toute la session" />
              </div>
              <div>
                <Button type="submit" data-testid="tt-pdf">
                  <FileText aria-hidden /> Exporter les emplois du temps en PDF
                </Button>
              </div>
            </form>
            {teachers.length ? (
              <form method="get" action="/api/exports/emplois-du-temps" target="_blank" className="flex flex-wrap items-end gap-3 border-t border-border pt-5">
                <input type="hidden" name="annee" value={year.id} />
                <label className="grid gap-1 text-sm font-medium">
                  Emploi du temps d&apos;un {v.teacher.toLowerCase()}
                  <select name="enseignant" className={`${SELECT} w-64`} required defaultValue="">
                    <option value="" disabled>
                      Choisir…
                    </option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.first_name} {t.last_name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" variant="secondary">
                  <FileText aria-hidden /> PDF
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
