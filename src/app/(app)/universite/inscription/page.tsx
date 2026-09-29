import { Layers } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { Card } from "@/components/ui/card";
import { EnrollStudentForm } from "@/features/university/components/enroll-student-form";
import { UniversityHeader } from "@/features/university/components/university-header";
import { requireUniversity } from "@/features/university/guard";
import { promotions } from "@/features/university/queries";
import { todayIn } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Inscription administrative" };

export default async function UniversityEnrollPage({ searchParams }: PageProps<"/universite/inscription">) {
  const context = await requireUniversity(["enrollments.manage"]);
  const organization = context.organization;
  const params = await searchParams;
  const supabase = await createClient();
  const current = (await promotions(organization.id)).filter((p) => p.academic_year?.is_current);
  const classIds = current.map((p) => p.id);
  const programIds = [...new Set(current.map((p) => p.program_id).filter((v): v is string => Boolean(v)))];
  const yearIds = [...new Set(current.map((p) => p.academic_year_id))];
  const [{ data: students }, { data: counts }, { data: tracks }, { data: groups }, { data: units }, { data: rates }] = await Promise.all([
    supabase
      .from("students")
      .select("id, matricule, first_name, last_name")
      .eq("organization_id", organization.id)
      .is("archived_at", null)
      .in("status", ["active", "prospect", "inactive"])
      .order("last_name")
      .limit(2000),
    classIds.length ? supabase.from("enrollments").select("class_id").in("class_id", classIds).in("status", ["pending", "validated"]) : Promise.resolve({ data: [] as { class_id: string | null }[] }),
    programIds.length ? supabase.from("program_tracks").select("id, name, program_id").in("program_id", programIds).eq("is_active", true).order("name") : Promise.resolve({ data: [] as { id: string; name: string; program_id: string }[] }),
    classIds.length && context.university.features.groups
      ? supabase.from("training_groups").select("id, name, class_id").in("class_id", classIds).is("archived_at", null).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string; class_id: string }[] }),
    programIds.length
      ? supabase.from("teaching_units").select("id, program_id, level_id, track_id").in("program_id", programIds).eq("is_active", true).eq("is_optional", false)
      : Promise.resolve({ data: [] as { id: string; program_id: string; level_id: string | null; track_id: string | null }[] }),
    yearIds.length
      ? supabase.from("fee_rates").select("id, academic_year_id, level_id, program_id, class_id, amount, is_mandatory, installment_plan, fee_type:fee_types(name)").in("academic_year_id", yearIds)
      : Promise.resolve({ data: [] }),
  ]);
  const requestedPromotion = param(params, "promotion");
  const requestedStudent = param(params, "etudiant");

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <UniversityHeader
        title="Inscription administrative et pédagogique"
        description="Étudiant → année académique → filière → niveau → parcours → frais universitaires, puis inscription pédagogique aux UE du semestre. Matricule, facture et échéancier générés automatiquement."
      />
      {current.length === 0 ? (
        <Card>
          <EmptyState icon={Layers} title="Aucune promotion ouverte" description="Créez une promotion (filière + niveau) pour l'année académique en cours depuis la fiche de la filière." />
        </Card>
      ) : (
        <EnrollStudentForm
          promotions={current.map((p) => ({
            id: p.id,
            name: p.name,
            program: p.program?.name ?? "—",
            level: p.level?.name ?? "—",
            year: p.academic_year?.name ?? "",
            trackId: p.track_id,
            capacity: p.capacity,
            headcount: (counts ?? []).filter((c) => c.class_id === p.id).length,
            units: (units ?? []).filter((u) => u.program_id === p.program_id && (!u.level_id || u.level_id === p.level_id) && (!u.track_id || u.track_id === p.track_id)).length,
            tracks: (tracks ?? []).filter((t) => t.program_id === p.program_id).map((t) => ({ id: t.id, name: t.name })),
            groups: (groups ?? []).filter((g) => g.class_id === p.id).map((g) => ({ id: g.id, name: g.name })),
            fees: (rates ?? [])
              .filter(
                (r) =>
                  r.is_mandatory &&
                  r.academic_year_id === p.academic_year_id &&
                  (r.class_id ? r.class_id === p.id : r.program_id ? r.program_id === p.program_id : r.level_id ? r.level_id === p.level_id : true),
              )
              .map((r) => ({ label: r.fee_type?.name ?? "Frais", amount: Number(r.amount), installments: Array.isArray(r.installment_plan) ? Math.max(1, r.installment_plan.length) : 1 })),
          }))}
          students={(students ?? []).map((s) => ({ id: s.id, label: `${s.last_name} ${s.first_name} — ${s.matricule}` }))}
          groupsEnabled={context.university.features.groups}
          currency={organization.currency}
          today={todayIn(organization.timezone)}
          defaultPromotionId={isUuid(requestedPromotion) && current.some((p) => p.id === requestedPromotion) ? requestedPromotion : undefined}
          defaultStudentId={isUuid(requestedStudent) ? requestedStudent : undefined}
        />
      )}
    </div>
  );
}
