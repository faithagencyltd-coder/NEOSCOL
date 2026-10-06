import { LifeBuoy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { addSupportMessage, createSupportTicket } from "@/features/support/actions";
import { options, TICKET_CATEGORIES, TICKET_SEVERITIES, TICKET_STATUSES } from "@/features/support/constants";
import { SupportThread } from "@/features/support/thread";
import { requireOrganization } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Assistance" };

/** Assistance : signaler un problème ou poser une question à l'équipe NeoScool, puis suivre la réponse. */
export default async function AssistancePage({ searchParams }: PageProps<"/assistance">) {
  const context = await requireOrganization();
  const params = await searchParams;
  const selected = param(params, "demande");
  const supabase = await createClient();
  const { data: tickets } = await supabase
    .from("support_tickets")
    .select("id, number, title, category, severity, status, created_at, updated_at, description")
    .eq("organization_id", context.organization.id)
    .order("updated_at", { ascending: false })
    .limit(100);
  const current = isUuid(selected) ? (tickets ?? []).find((t) => t.id === selected) : undefined;
  const { data: messages } = current
    ? await supabase.from("support_ticket_messages").select("id, body, author_side, internal, created_at").eq("ticket_id", current.id).order("created_at")
    : { data: [] };

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Assistance"
        description="Un problème, une question ? L'équipe NeoScool vous répond ici et vous prévient par notification."
        actions={
          <QuickFormDialog
            title="Nouvelle demande d'assistance"
            description="Décrivez le problème : ce que vous faisiez, ce qui s'est passé, qui est concerné. N'indiquez jamais de mot de passe."
            triggerLabel="Nouvelle demande"
            action={createSupportTicket}
            fields={[
              { name: "title", label: "Sujet", type: "text", required: true, wide: true },
              { name: "category", label: "Catégorie", type: "select", required: true, options: options(TICKET_CATEGORIES), defaultValue: "question" },
              { name: "severity", label: "Urgence", type: "select", required: true, options: options(TICKET_SEVERITIES), defaultValue: "medium" },
              { name: "description", label: "Description", type: "textarea", required: true, wide: true },
            ]}
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Vos demandes</CardTitle>
            <CardDescription>Visibles par vous et par les responsables de l&apos;établissement.</CardDescription>
          </CardHeader>
          <CardContent>
            {(tickets ?? []).length === 0 ? (
              <EmptyState icon={LifeBuoy} title="Aucune demande" description="Utilisez « Nouvelle demande » pour contacter l'équipe NeoScool." />
            ) : (
              <ul className="grid gap-2" data-testid="support-list">
                {(tickets ?? []).map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/assistance?demande=${t.id}`}
                      className={`grid gap-1 rounded-xl border p-3 text-sm hover:bg-surface-muted/50 ${t.id === current?.id ? "border-primary" : "border-border"}`}
                    >
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">
                          N° {t.number} — {t.title}
                        </span>
                        <Badge tone={TICKET_STATUSES[t.status]?.tone}>{TICKET_STATUSES[t.status]?.label ?? t.status}</Badge>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {TICKET_CATEGORIES[t.category]} · mise à jour {new Date(t.updated_at).toLocaleString("fr-FR")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          {current ? (
            <>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1">
                  <CardTitle>
                    N° {current.number} — {current.title}
                  </CardTitle>
                  <CardDescription className="flex flex-wrap gap-2">
                    <Badge tone={TICKET_STATUSES[current.status]?.tone}>{TICKET_STATUSES[current.status]?.label}</Badge>
                    <Badge tone={TICKET_SEVERITIES[current.severity]?.tone}>Urgence {TICKET_SEVERITIES[current.severity]?.label.toLowerCase()}</Badge>
                  </CardDescription>
                </div>
                {current.status !== "closed" ? (
                  <QuickFormDialog
                    title="Répondre"
                    trigger={<Button size="sm">Répondre</Button>}
                    action={addSupportMessage}
                    hidden={{ ticket_id: current.id }}
                    fields={[{ name: "body", label: "Votre message", type: "textarea", required: true, wide: true }]}
                  />
                ) : null}
              </CardHeader>
              <CardContent>
                <SupportThread description={current.description} createdAt={current.created_at} messages={(messages ?? []).map((m) => ({ ...m, author: m.author_side === "school" ? "Établissement" : null }))} />
              </CardContent>
            </>
          ) : (
            <CardContent className="pt-5">
              <EmptyState icon={LifeBuoy} title="Sélectionnez une demande" description="Le fil des échanges s'affiche ici." />
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
