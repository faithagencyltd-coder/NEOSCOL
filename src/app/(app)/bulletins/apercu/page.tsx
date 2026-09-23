import { EyeOff, FileSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { LinkSelect } from "@/components/shared/link-select";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { getCurrentYear, getPeriods } from "@/features/academic/queries";
import { getRollCallClasses } from "@/features/attendance/queries";
import { reportCardData } from "@/features/documents/snapshots";
import { readReportConfig } from "@/features/report-cards/config";
import { getReportCardConfig } from "@/features/report-cards/queries";
import { featureEnabled } from "@/lib/features";
import { todayIn } from "@/lib/dates";
import { requireOrganization } from "@/lib/auth/guards";
import { canAny } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Aperçu du bulletin" };

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toFixed(2).replace(".", ","));

/**
 * Aperçu À L'ÉCRAN du bulletin (calcul en direct, rien n'est enregistré).
 * Aucun téléchargement, aucune impression, aucun PDF : les documents officiels
 * sont réservés à l'administration (contrôle côté serveur des routes PDF).
 */
export default async function ReportPreviewPage({ searchParams }: PageProps<"/bulletins/apercu">) {
  const context = await requireOrganization();
  if (!canAny(context, ["grades.enter", "report_cards.manage", "grades.read"])) notFound();
  const organizationId = context.organization.id;
  const params = await searchParams;
  const year = await getCurrentYear(organizationId);
  if (!year) notFound();
  const manage = canAny(context, ["report_cards.manage", "grades.read"]);
  const [classes, periods, rawConfig] = await Promise.all([
    getRollCallClasses(organizationId, year.id, context.user.id, manage),
    getPeriods(organizationId, year.id),
    getReportCardConfig(organizationId),
  ]);
  const config = readReportConfig(rawConfig);
  const today = todayIn(context.organization.timezone);
  const classId = isUuid(param(params, "classe")) && classes.some((c) => c.id === param(params, "classe")) ? param(params, "classe")! : classes[0]?.id;
  const period = periods.find((p) => p.id === param(params, "periode")) ?? periods.find((p) => p.starts_on <= today && p.ends_on >= today) ?? periods[0];
  const supabase = await createClient();
  const { data: rows, error } = classId && period ? await supabase.rpc("preview_report_cards", { p_class_id: classId, p_period_id: period.id }) : { data: [], error: null };
  const studentIds = (rows ?? []).map((r) => r.student_id);
  const { data: students } = studentIds.length ? await supabase.from("students").select("id, first_name, last_name, matricule").in("id", studentIds) : { data: [] };
  const list = (rows ?? [])
    .map((r) => ({ ...r, student: (students ?? []).find((s) => s.id === r.student_id) }))
    .sort((a, b) => (a.student?.last_name ?? "").localeCompare(b.student?.last_name ?? "", "fr"));
  const selectedId = isUuid(param(params, "eleve")) ? param(params, "eleve") : list[0]?.student_id;
  const selected = list.find((r) => r.student_id === selectedId);
  const data = selected ? reportCardData(selected.data) : null;
  const ranking = featureEnabled(context.organization, "ranking") && config.show_rank;
  const href = (c?: string, p?: string, e?: string) => `/bulletins/apercu?classe=${c ?? classId ?? ""}&periode=${p ?? period?.id ?? ""}${e ? `&eleve=${e}` : ""}`;

  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <p className="text-sm text-muted-foreground">Pédagogie</p>
        <h1 className="text-2xl font-semibold sm:text-[26px]">Aperçu du bulletin</h1>
        <p className="text-sm text-muted-foreground">Calcul en direct à partir des notes saisies. Consultation uniquement.</p>
      </div>
      <Alert tone="info">
        <span className="flex items-center gap-2">
          <EyeOff className="size-4" aria-hidden /> Aperçu non officiel : aucun téléchargement, aucune impression. Le bulletin PDF est généré par l&apos;administration.
        </span>
      </Alert>
      {classes.length === 0 ? (
        <Card>
          <EmptyState icon={FileSearch} title="Aucune classe" description="Aucune classe ne vous est affectée." />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <LinkSelect label="Classe" className="w-full sm:w-52" value={classId ?? ""} options={classes.map((c) => ({ value: c.id, label: c.name, href: href(c.id) }))} />
            <LinkSelect label="Période" className="w-full sm:w-52" value={period?.id ?? ""} options={periods.map((p) => ({ value: p.id, label: p.name, href: href(undefined, p.id) }))} />
            <LinkSelect
              label="Élève"
              className="w-full sm:w-72"
              value={selectedId ?? ""}
              options={list.map((r) => ({ value: r.student_id, label: `${r.student?.last_name ?? ""} ${r.student?.first_name ?? ""}`, href: href(undefined, undefined, r.student_id) }))}
            />
          </div>
          {error ? <Alert tone="danger">Aperçu indisponible pour cette classe.</Alert> : null}
          {selected && data ? (
            <>
              <p className="hidden text-center font-semibold print:block">Impression non autorisée : aperçu non officiel.</p>
              <article
                className="relative mx-auto grid w-full max-w-4xl select-none gap-4 overflow-hidden rounded-2xl bg-white p-6 text-[13px] text-[#0f1b3d] shadow-lg print:hidden"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[25deg] whitespace-nowrap text-6xl font-black tracking-widest text-red-500/10"
                >
                  APERÇU — NON OFFICIEL
                </span>
                <header className="flex items-center justify-between border-b-2 pb-2" style={{ borderColor: config.primary_color }}>
                  <strong>{context.organization.name}</strong>
                  <span style={{ color: config.accent_color }} className="font-semibold">
                    {period?.name} · {year.name}
                  </span>
                </header>
                <h2 className="text-center text-lg font-bold" style={{ color: config.primary_color }}>
                  {config.title}
                </h2>
                <p>
                  <strong>
                    {selected.student?.last_name} {selected.student?.first_name}
                  </strong>{" "}
                  · {selected.student?.matricule} · {classes.find((c) => c.id === classId)?.name}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[12px]">
                    <thead>
                      <tr className="text-white" style={{ backgroundColor: config.primary_color }}>
                        <th className="px-2 py-1.5 text-left">Matière</th>
                        {data.columns.map((c) => (
                          <th key={c.key} className="px-2 py-1.5">
                            {c.label}
                          </th>
                        ))}
                        <th className="px-2 py-1.5">MOY.</th>
                        <th className="px-2 py-1.5">COEF.</th>
                        <th className="px-2 py-1.5">Points</th>
                        {config.show_class_stats ? <th className="px-2 py-1.5">Moy. cl.</th> : null}
                        {config.show_appreciation ? <th className="px-2 py-1.5 text-left">Appréciation</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {data.subjects.map((s) => (
                        <tr key={s.subject} className="border-b border-[#e3e9f4]">
                          <td className="px-2 py-1.5 font-medium">{s.subject}</td>
                          {data.columns.map((c) => (
                            <td key={c.key} className="px-2 py-1.5 text-center tabular-nums">
                              {fmt(s.columns?.[c.key])}
                            </td>
                          ))}
                          <td className="px-2 py-1.5 text-center font-semibold tabular-nums">{fmt(s.average)}</td>
                          <td className="px-2 py-1.5 text-center">{s.coefficient}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums">{fmt(s.points)}</td>
                          {config.show_class_stats ? <td className="px-2 py-1.5 text-center tabular-nums">{fmt(s.class_average)}</td> : null}
                          {config.show_appreciation ? <td className="px-2 py-1.5">{s.mention ?? ""}</td> : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap gap-4 rounded-lg bg-[#f3f6fc] p-3">
                  <span>
                    Moyenne générale : <strong className="text-base">{fmt(selected.average)} / 20</strong>
                    {data.mention ? ` · ${data.mention}` : ""}
                  </span>
                  {ranking && selected.rank ? (
                    <span>
                      Rang : <strong>
                        {selected.rank}
                        {selected.rank === 1 ? "er" : "e"} / {selected.class_size}
                      </strong>
                    </span>
                  ) : null}
                  {data.proposed_decision ? <span>Décision proposée : {data.proposed_decision}</span> : null}
                </div>
              </article>
            </>
          ) : (
            <Card>
              <EmptyState icon={FileSearch} title="Aucune donnée à afficher" description="Aucun élève ou aucune note pour cette période." />
            </Card>
          )}
          <p className="text-xs text-muted-foreground">
            Retour à <Link href="/mes-cours" className="text-primary hover:underline">mes cours</Link>.
          </p>
        </>
      )}
    </div>
  );
}
