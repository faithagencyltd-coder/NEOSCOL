import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PrintButton } from "@/components/shared/print-button";
import { LogoMark } from "@/components/shared/logo";
import { getBranding, getOrganizationCard, getReportCard, reportClassAverage, reportSubjects } from "@/features/report-cards/queries";
import { featureEnabled } from "@/lib/features";
import { requireOrganization } from "@/lib/auth/guards";
import { canAny } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils/format";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Bulletin de notes" };

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toFixed(2).replace(".", ","));

/** Bulletin imprimable (A4). La version PDF avec QR Code de vérification arrive avec le Document Studio. */
export default async function PrintReportCardPage({ params }: PageProps<"/impression/bulletins/[id]">) {
  const context = await requireOrganization();
  if (!canAny(context, ["report_cards.manage", "grades.read"])) notFound();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const organizationId = context.organization.id;
  const [card, branding, organization] = await Promise.all([
    getReportCard(organizationId, id),
    getBranding(organizationId),
    getOrganizationCard(organizationId),
  ]);
  if (!card || !card.student || !card.class) notFound();
  const subjects = reportSubjects(card.data);
  const ranking = featureEnabled(context.organization, "ranking");
  const accent = branding?.primary_color ?? "#1d63ed";

  return (
    <div className="min-h-dvh bg-background py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-4 print:hidden">
        <p className="text-sm text-muted-foreground">
          {card.status === "draft" ? "Brouillon — non publié aux familles." : "Bulletin publié."}
        </p>
        <PrintButton />
      </div>
      <article className="mx-auto grid max-w-[210mm] gap-5 bg-white p-[12mm] text-[12px] text-[#0f1b3d] shadow-lg print:max-w-none print:p-[10mm] print:shadow-none">
        <header className="flex items-center justify-between gap-4 border-b-2 pb-3" style={{ borderColor: accent }}>
          <div className="flex items-center gap-3">
            <LogoMark className="size-12" />
            <div className="grid">
              <strong className="text-[15px]">{organization?.name}</strong>
              <span className="text-[11px] text-[#5b6b8c]">
                {[organization?.address, organization?.city].filter(Boolean).join(", ")}
                {organization?.phone ? ` · ${organization.phone}` : ""}
              </span>
            </div>
          </div>
          <div className="text-right text-[11px] text-[#5b6b8c]">
            Année scolaire {card.class.academic_year?.name}
            <br />
            {card.period?.name}
          </div>
        </header>

        <h1 className="text-center font-display text-[20px] font-bold tracking-wide" style={{ color: accent }}>
          BULLETIN DE NOTES
        </h1>

        <section className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-[#f4f7fc] p-3">
          <p>
            Élève : <strong>{card.student.last_name} {card.student.first_name}</strong>
          </p>
          <p>
            Matricule : <strong>{card.student.matricule}</strong>
          </p>
          <p>
            Classe : <strong>{card.class.name}</strong>
          </p>
          <p>
            Né(e) le :{" "}
            <strong>
              {card.student.birth_date ? formatDate(card.student.birth_date, "fr-FR", { dateStyle: "short" }) : "—"}
              {card.student.birth_place ? ` à ${card.student.birth_place}` : ""}
            </strong>
          </p>
          <p>
            Effectif : <strong>{card.class_size ?? "—"}</strong>
          </p>
          <p>
            Professeur principal :{" "}
            <strong>{card.class.head_teacher ? `${card.class.head_teacher.first_name} ${card.class.head_teacher.last_name}` : "—"}</strong>
          </p>
        </section>

        <table className="w-full border-collapse text-[11.5px]">
          <thead>
            <tr className="text-left text-white" style={{ background: accent }}>
              <th className="px-2 py-1.5">Matière</th>
              <th className="px-2 py-1.5 text-center">Coef.</th>
              <th className="px-2 py-1.5 text-center">Moyenne</th>
              <th className="px-2 py-1.5 text-center">Moy. × coef.</th>
              <th className="px-2 py-1.5 text-center">Moy. classe</th>
              <th className="px-2 py-1.5 text-center">Min / Max</th>
              <th className="px-2 py-1.5">Enseignant</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s.subject} className="border-b border-[#e3e9f4]">
                <td className="px-2 py-1.5 font-semibold">{s.subject}</td>
                <td className="px-2 py-1.5 text-center">{s.coefficient}</td>
                <td className="px-2 py-1.5 text-center font-semibold">{fmt(s.average)}</td>
                <td className="px-2 py-1.5 text-center">{s.average === null ? "—" : fmt(s.average * s.coefficient)}</td>
                <td className="px-2 py-1.5 text-center">{fmt(s.class_average)}</td>
                <td className="px-2 py-1.5 text-center">
                  {fmt(s.min)} / {fmt(s.max)}
                </td>
                <td className="px-2 py-1.5">{s.teacher ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border-2 p-3 text-center" style={{ borderColor: accent }}>
            <p className="text-[11px] text-[#5b6b8c]">Moyenne générale</p>
            <p className="font-display text-[22px] font-bold">{fmt(card.average)} / 20</p>
          </div>
          <div className="rounded-lg border border-[#e3e9f4] p-3 text-center">
            <p className="text-[11px] text-[#5b6b8c]">Moyenne de la classe</p>
            <p className="font-display text-[18px] font-semibold">{fmt(reportClassAverage(card.data))}</p>
          </div>
          <div className="rounded-lg border border-[#e3e9f4] p-3 text-center">
            <p className="text-[11px] text-[#5b6b8c]">{ranking ? "Rang" : "Décision"}</p>
            <p className="font-display text-[18px] font-semibold">
              {ranking ? (card.rank ? `${card.rank}${card.rank === 1 ? "er" : "e"} / ${card.class_size}` : "—") : (card.decision ?? "—")}
            </p>
          </div>
        </section>

        <section className="grid gap-2 rounded-lg border border-[#e3e9f4] p-3">
          <p>
            <strong>Appréciation :</strong> {card.appreciation ?? "—"}
          </p>
          {card.head_teacher_comment ? (
            <p>
              <strong>Professeur principal :</strong> {card.head_teacher_comment}
            </p>
          ) : null}
          {ranking && card.decision ? (
            <p>
              <strong>Décision du conseil :</strong> {card.decision}
            </p>
          ) : null}
        </section>

        <footer className="mt-4 flex items-end justify-between gap-6">
          <p className="text-[10px] text-[#5b6b8c]">
            {branding?.footer_text ?? ""}
            {card.published_at ? ` · Publié le ${formatDate(card.published_at, "fr-FR", { dateStyle: "long" })}` : ""}
          </p>
          <div className="grid justify-items-center gap-10 text-center">
            <span className="font-semibold">{branding?.signatory_title ?? "Le chef d'établissement"}</span>
            <span>{branding?.signatory_name ?? ""}</span>
          </div>
        </footer>
      </article>
    </div>
  );
}
