import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ApplicationThread, type ApplicationThreadData } from "@/features/ecosystem/components/application-thread";
import { requirePermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Candidature" };
export const dynamic = "force-dynamic";

/** Candidature reçue par l'établissement : CV, échanges, statut. */
export default async function SchoolApplicationPage({ params }: PageProps<"/visibilite/opportunites/candidatures/[id]">) {
  await requirePermission("staff.manage");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { data } = await (await createClient()).rpc("application_thread", { p_id: id });
  if (!data) notFound();
  const thread = data as unknown as ApplicationThreadData;
  return (
    <div className="grid min-w-0 gap-4">
      <Link href={`/visibilite/opportunites/${thread.opportunity_id}`} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Retour à l&apos;offre
      </Link>
      <ApplicationThread data={thread} />
    </div>
  );
}
