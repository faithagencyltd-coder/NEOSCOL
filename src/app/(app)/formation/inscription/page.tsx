import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { EnrollForm } from "@/features/training/components/enroll-form";
import { requireTraining } from "@/features/training/guard";
import { openSessions } from "@/features/training/queries";
import { can } from "@/lib/auth/session";
import { todayIn } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Inscrire un apprenant" };

export default async function EnrollPage({ searchParams }: PageProps<"/formation/inscription">) {
  const context = await requireTraining("enrollments.manage");
  const organization = context.organization;
  const params = await searchParams;
  const today = todayIn(organization.timezone);
  const supabase = await createClient();
  const [sessions, { data: learners }] = await Promise.all([
    openSessions(organization.id, today),
    supabase
      .from("students")
      .select("id, matricule, first_name, last_name")
      .eq("organization_id", organization.id)
      .is("archived_at", null)
      .in("status", ["active", "prospect", "inactive"])
      .order("last_name")
      .limit(1000),
  ]);
  const { data: counts } = sessions.length
    ? await supabase.from("enrollments").select("class_id").in("class_id", sessions.map((s) => s.id)).in("status", ["pending", "validated"])
    : { data: [] };
  const headcount = (id: string) => (counts ?? []).filter((c) => c.class_id === id).length;
  const requestedSession = param(params, "session");
  const requestedStudent = param(params, "apprenant");

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Inscrire un apprenant"
        description="Apprenant → formation → session → groupe → tarif → paiements. Le matricule, la facture, l'échéancier et le reçu sont générés automatiquement."
      />
      {sessions.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarDays} title="Aucune session ouverte" description="Créez d'abord une session (en cours ou à venir) pour une formation active." />
        </Card>
      ) : (
        <EnrollForm
          sessions={sessions.map((s) => ({
            id: s.id,
            name: s.name,
            formation: s.program.name,
            starts_on: s.starts_on,
            ends_on: s.ends_on,
            capacity: s.capacity,
            headcount: headcount(s.id),
            tuition: Number(s.tuition_amount ?? s.program.tuition_amount ?? 0),
            registration: Number(s.program.registration_fee ?? 0),
            installments: s.program.default_installments,
            groups: (s.groups ?? []).filter((g) => !g.archived_at).map((g) => ({ id: g.id, name: g.name, capacity: g.capacity })),
          }))}
          learners={(learners ?? []).map((l) => ({ id: l.id, label: `${l.last_name} ${l.first_name} — ${l.matricule}` }))}
          groupsEnabled={context.training.groupsEnabled}
          currency={organization.currency}
          today={today}
          can={{ payment: can(context, "finance.payments.create"), discount: can(context, "finance.invoices.manage") }}
          defaultSessionId={isUuid(requestedSession) && sessions.some((s) => s.id === requestedSession) ? requestedSession : undefined}
          defaultStudentId={isUuid(requestedStudent) ? requestedStudent : undefined}
        />
      )}
    </div>
  );
}
