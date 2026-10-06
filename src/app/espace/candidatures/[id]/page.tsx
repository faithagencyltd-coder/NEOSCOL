import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ApplicationThread, type ApplicationThreadData } from "@/features/ecosystem/components/application-thread";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/search-params";

export const dynamic = "force-dynamic";

/** Fil d'une candidature (côté candidat ou côté auteur de l'annonce). */
export default async function ApplicationPage({ params }: PageProps<"/espace/candidatures/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { data } = await (await createClient()).rpc("application_thread", { p_id: id });
  if (!data) notFound();
  const thread = data as unknown as ApplicationThreadData;
  return (
    <>
      <Link href={thread.manager ? `/espace/annonces/${thread.opportunity_id}` : "/espace"} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Retour
      </Link>
      <ApplicationThread data={thread} />
    </>
  );
}
