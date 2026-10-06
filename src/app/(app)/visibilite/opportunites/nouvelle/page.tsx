import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { OpportunityForm } from "@/features/ecosystem/components/opportunity-form";
import { moduleClosed } from "@/features/ecosystem/module-closed";
import { requirePermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Nouvelle offre" };

/** Offre publiée au nom de l'établissement (droit « Personnel »). */
export default async function NewSchoolOpportunityPage() {
  const context = await requirePermission("staff.manage");
  const closed = moduleClosed(context.organization, "opportunities");
  const supabase = await createClient();
  const [{ data: categories }, { data: countries }, { data: org }] = await Promise.all([
    supabase.from("opportunity_categories").select("key, label, poster").eq("active", true).order("sort_order"),
    supabase.from("countries").select("code, name").order("name"),
    supabase.from("organizations").select("country").eq("id", context.organization.id).single(),
  ]);
  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader title="Nouvelle offre" description="Elle sera publiée au nom de l'établissement, éventuellement après vérification par NeoScool." />
      {closed ?? (
        <Card>
          <CardContent className="pt-5">
            <OpportunityForm
              categories={(categories ?? []).filter((c) => c.poster !== "individual")}
              countries={countries ?? []}
              organizationId={context.organization.id}
              values={{ country: org?.country ?? null }}
              doneHref="/visibilite/opportunites/{id}"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
