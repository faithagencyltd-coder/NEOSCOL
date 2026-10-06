import { Briefcase, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { OPPORTUNITY_STATUSES } from "@/features/ecosystem/constants";
import { moduleClosed } from "@/features/ecosystem/module-closed";
import { requirePermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Recrutement" };
export const dynamic = "force-dynamic";

/** NeoScool Opportunities côté établissement : offres d'emploi publiées au nom de l'établissement et candidatures reçues. */
export default async function SchoolOpportunitiesPage() {
  const context = await requirePermission("staff.manage");
  const closed = moduleClosed(context.organization, "opportunities");
  const supabase = await createClient();
  const { data: posts } = await supabase.from("opportunities").select("id, title, status, expires_at, category, moderation_note, created_at").eq("organization_id", context.organization.id).order("created_at", { ascending: false });
  const ids = (posts ?? []).map((p) => p.id);
  const { data: apps } = ids.length ? await supabase.from("opportunity_applications").select("opportunity_id, author_unread, status").in("opportunity_id", ids).neq("status", "withdrawn") : { data: [] };
  const count = (id: string) => (apps ?? []).filter((a) => a.opportunity_id === id);

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Recrutement"
        description="Publiez vos offres d'emploi et de stage sur NeoScool Opportunities, et suivez les candidatures (CV, échanges, statut)."
        actions={
          closed ? null : (
            <Button asChild size="sm">
              <Link href="/visibilite/opportunites/nouvelle">
                <Plus aria-hidden /> Nouvelle offre
              </Link>
            </Button>
          )
        }
      />
      {closed ??
        ((posts ?? []).length === 0 ? (
          <EmptyState icon={Briefcase} title="Aucune offre" description="Publiez une offre : enseignant, surveillant, comptable, stage…" />
        ) : (
          <ul className="grid gap-2" data-testid="school-opportunities">
            {(posts ?? []).map((p) => {
              const received = count(p.id);
              const unread = received.filter((a) => a.author_unread).length;
              return (
                <li key={p.id}>
                  <Link href={`/visibilite/opportunites/${p.id}`} className="grid gap-1 rounded-xl border border-border bg-surface p-3 hover:shadow sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="grid">
                      <span className="font-medium">{p.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {received.length} candidature(s){unread ? ` dont ${unread} nouvelle(s)` : ""} · jusqu&apos;au {new Date(p.expires_at).toLocaleDateString("fr-FR")}
                      </span>
                      {p.moderation_note ? <span className="text-xs text-danger">Motif NeoScool : {p.moderation_note}</span> : null}
                    </div>
                    <StatusBadge value={p.status} map={OPPORTUNITY_STATUSES} />
                  </Link>
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
}
