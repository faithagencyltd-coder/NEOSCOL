import Link from "next/link";

import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { Button } from "@/components/ui/button";
import { OpportunityForm, type OpportunityValues } from "@/features/ecosystem/components/opportunity-form";
import { APPLICATION_STATUSES, OPPORTUNITY_STATUSES } from "@/features/ecosystem/constants";
import { archiveOpportunity } from "@/features/ecosystem/public-actions";
import { createClient } from "@/lib/supabase/server";

export type ManagedOpportunity = {
  opportunity: OpportunityValues & { id: string; status: string; moderation_note: string | null; organization_id: string | null; published_at: string | null };
  category_label: string;
  applications: { id: string; status: string; message: string; created_at: string; unread: boolean; applicant_name: string; applicant_email: string | null; cv_file_id: string | null; cv_name: string | null }[];
};

/** Gestion d'une annonce (particulier ou établissement) : réponses reçues, modification, archivage. */
export async function OpportunityManager({ data, threadBase, doneHref }: { data: ManagedOpportunity; threadBase: string; doneHref: string }) {
  const o = data.opportunity;
  const supabase = await createClient();
  const [{ data: categories }, { data: countries }] = await Promise.all([
    supabase.from("opportunity_categories").select("key, label, poster").eq("active", true).order("sort_order"),
    supabase.from("countries").select("code, name").order("name"),
  ]);
  const allowed = (categories ?? []).filter((c) => c.poster === "both" || c.poster === (o.organization_id ? "organization" : "individual"));
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-bold">{o.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StatusBadge value={o.status} map={OPPORTUNITY_STATUSES} /> {data.category_label}
            {o.status === "published" ? (
              <Link href={`/opportunites/${o.id}`} className="text-primary hover:underline">
                Voir l&apos;annonce publique
              </Link>
            ) : null}
          </div>
          {o.moderation_note ? <p className="text-sm text-danger">Motif NeoScool : {o.moderation_note}</p> : null}
        </div>
        {o.status !== "archived" ? (
          <ConfirmAction
            trigger={<Button variant="secondary" size="sm">Archiver</Button>}
            title="Archiver l'annonce ?"
            description="Elle ne sera plus visible. Les réponses reçues restent consultables."
            confirmLabel="Archiver"
            action={archiveOpportunity}
            fields={{ id: o.id }}
          />
        ) : null}
      </div>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Réponses reçues ({data.applications.length})</h2>
        {data.applications.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune réponse pour le moment.</p>
        ) : (
          <ul className="grid gap-2" data-testid="received-applications">
            {data.applications.map((a) => (
              <li key={a.id}>
                <Link href={`${threadBase}/${a.id}`} className="grid gap-1 rounded-xl border border-border bg-white p-3 hover:shadow sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="grid">
                    <span className="font-medium">
                      {a.applicant_name || "Candidat"} {a.unread ? <span className="ml-1 rounded-full bg-primary px-1.5 text-[11px] text-white">nouveau</span> : null}
                    </span>
                    <span className="line-clamp-1 text-sm text-muted-foreground">{a.message}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleDateString("fr-FR")} {a.cv_name ? `· CV : ${a.cv_name}` : ""}
                    </span>
                  </div>
                  <StatusBadge value={a.status} map={APPLICATION_STATUSES} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {o.status !== "archived" ? (
        <details className="rounded-2xl border border-border bg-white p-4">
          <summary className="cursor-pointer font-semibold">Modifier l&apos;annonce</summary>
          <div className="pt-4">
            <OpportunityForm categories={allowed} countries={countries ?? []} organizationId={o.organization_id ?? undefined} values={o} doneHref={doneHref} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
