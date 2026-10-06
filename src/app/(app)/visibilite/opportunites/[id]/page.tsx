import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OpportunityManager, type ManagedOpportunity } from "@/features/ecosystem/components/opportunity-manager";
import { requirePermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Offre et candidatures" };
export const dynamic = "force-dynamic";

/** Offre de l'établissement : candidatures reçues, modification, archivage. */
export default async function SchoolOpportunityPage({ params }: PageProps<"/visibilite/opportunites/[id]">) {
  await requirePermission("staff.manage");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { data } = await (await createClient()).rpc("opportunity_manage", { p_id: id });
  if (!data) notFound();
  return <OpportunityManager data={data as unknown as ManagedOpportunity} threadBase="/visibilite/opportunites/candidatures" doneHref={`/visibilite/opportunites/${id}`} />;
}
