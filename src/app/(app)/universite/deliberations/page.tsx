import { Gavel } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { createDeliberation } from "@/features/university/actions";
import { UniversityHeader } from "@/features/university/components/university-header";
import { requireUniversity } from "@/features/university/guard";
import { deliberationsList, promotions } from "@/features/university/queries";
import { can } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Délibérations" };

export default async function DeliberationsPage() {
  const context = await requireUniversity(["deliberations.read"]);
  const orgId = context.organization.id;
  const manage = can(context, "deliberations.manage");
  const [list, classes] = await Promise.all([deliberationsList(orgId), promotions(orgId)]);
  const current = classes.filter((c) => c.academic_year?.is_current);
  const supabase = await createClient();
  const yearIds = [...new Set(current.map((c) => c.academic_year_id))];
  const { data: periods } = yearIds.length ? await supabase.from("academic_periods").select("id, name, academic_year_id, sequence").in("academic_year_id", yearIds).order("sequence") : { data: [] };

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <UniversityHeader
        title="Délibérations"
        description="Jury par promotion, semestre et session : décisions proposées selon les règles, décisions du jury (chaque modification est historisée), clôture et procès-verbal. La clôture publie les résultats aux étudiants."
        actions={
          manage && current.length > 0 ? (
            <QuickFormDialog
              title="Ouvrir une délibération"
              description="Les résultats sont recalculés et une décision est proposée pour chaque étudiant."
              triggerLabel="Nouvelle délibération"
              action={createDeliberation}
              fields={[
                { name: "title", label: "Intitulé", required: true, placeholder: "Jury de fin de semestre 1", wide: true },
                { name: "class_id", label: "Promotion", type: "select", required: true, options: current.map((c) => ({ value: c.id, label: c.name })), wide: true },
                { name: "academic_period_id", label: "Semestre", type: "select", options: (periods ?? []).map((p) => ({ value: p.id, label: p.name })), hint: "Vide : délibération annuelle." },
                { name: "session", label: "Session", type: "select", required: true, options: [{ value: "normal", label: "Session normale" }, { value: "retake", label: "Session de rattrapage" }], defaultValue: "normal" },
                { name: "held_on", label: "Date du jury", type: "date" },
                { name: "president", label: "Président du jury" },
                { name: "members", label: "Membres du jury", type: "textarea", placeholder: "Un membre par ligne" },
              ]}
            />
          ) : null
        }
      />
      <Card>
        {list.length === 0 ? (
          <CardContent>
            <EmptyState icon={Gavel} title="Aucune délibération" />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Délibération</TH>
                <TH>Promotion</TH>
                <TH>Semestre</TH>
                <TH>Session</TH>
                <TH>Date</TH>
                <TH>Décisions</TH>
                <TH>Statut</TH>
              </TR>
            </THead>
            <tbody>
              {list.map((d) => (
                <TR key={d.id}>
                  <TD>
                    <Link href={`/universite/deliberations/${d.id}`} className="font-medium text-primary underline-offset-2 hover:underline">
                      {d.title}
                    </Link>
                  </TD>
                  <TD className="text-sm">{d.class?.name}</TD>
                  <TD className="text-sm">{d.period?.name ?? "Annuelle"}</TD>
                  <TD>{d.session === "retake" ? <Badge tone="warning">Rattrapage</Badge> : <Badge tone="info">Normale</Badge>}</TD>
                  <TD className="text-sm">{d.held_on ? formatDate(d.held_on, "fr-FR", { dateStyle: "medium" }) : "—"}</TD>
                  <TD className="text-sm tabular-nums">{d.decisions?.[0]?.count ?? 0}</TD>
                  <TD>{d.status === "closed" ? <Badge tone="success">Close — publiée</Badge> : <Badge tone="warning">Ouverte</Badge>}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
