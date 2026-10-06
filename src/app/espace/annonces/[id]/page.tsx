import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OpportunityManager, type ManagedOpportunity } from "@/features/ecosystem/components/opportunity-manager";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/search-params";

export const dynamic = "force-dynamic";

/** Annonce d'un particulier : réponses reçues, modification, archivage. */
export default async function MyOpportunityPage({ params }: PageProps<"/espace/annonces/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { data } = await (await createClient()).rpc("opportunity_manage", { p_id: id });
  if (!data) notFound();
  return (
    <>
      <Link href="/espace" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Mon espace
      </Link>
      <OpportunityManager data={data as unknown as ManagedOpportunity} threadBase="/espace/candidatures" doneHref={`/espace/annonces/${id}`} />
    </>
  );
}
