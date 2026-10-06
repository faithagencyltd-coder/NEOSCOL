import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { addSupportMessage, updateSupportTicket } from "@/features/support/actions";
import { options, TICKET_CATEGORIES, TICKET_SEVERITIES, TICKET_STATUSES } from "@/features/support/constants";
import { SupportThread } from "@/features/support/thread";
import { canWritePlatform, getPlatformRole } from "@/lib/auth/platform";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Demande — Plateforme" };

/** Détail d'une demande ou d'un incident : fil, réponse, note interne, statut et gravité. */
const SUPPORT_CHANNELS: Record<string, string> = { chatbot: "Assistant (chatbot)", whatsapp: "WhatsApp", site: "Site", email: "E-mail", platform: "Plateforme" };

export default async function PlatformIncidentPage({ params }: PageProps<"/plateforme/incidents/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const [{ data: t }, { data: messages }, role] = await Promise.all([
    supabase.from("support_tickets").select("*, organization:organizations(id, name)").eq("id", id).maybeSingle(),
    supabase.from("support_ticket_messages").select("id, body, author_side, internal, created_at").eq("ticket_id", id).order("created_at"),
    getPlatformRole(),
  ]);
  if (!t) notFound();
  const org = t.organization as { id: string; name: string } | null;
  const writable = canWritePlatform(role);

  return (
    <div className="grid min-w-0 gap-5 [&>*]:min-w-0">
      <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
        <Link href="/plateforme/incidents" className="hover:text-primary">
          Assistance et incidents
        </Link>{" "}
        / <span className="text-foreground">N° {t.number}</span>
      </nav>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>
              {t.kind === "incident" ? "Incident" : "Demande"} n° {t.number} — {t.title}
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              <Badge tone={TICKET_STATUSES[t.status]?.tone}>{TICKET_STATUSES[t.status]?.label}</Badge>
              <Badge tone={TICKET_SEVERITIES[t.severity]?.tone}>Gravité {TICKET_SEVERITIES[t.severity]?.label.toLowerCase()}</Badge>
              <span>{TICKET_CATEGORIES[t.category]}</span>
              <span>·</span>
              {org ? (
                <Link href={`/plateforme/etablissements/${org.id}`} className="text-primary hover:underline">
                  {org.name}
                </Link>
              ) : (
                <span>{t.kind === "incident" ? "Plateforme" : "Visiteur sans établissement"}</span>
              )}
              {t.channel && t.channel !== "portal" ? <Badge tone="info">Canal : {SUPPORT_CHANNELS[t.channel] ?? t.channel}</Badge> : null}
            </CardDescription>
            {t.requester_name || t.requester_email || t.requester_phone ? (
              <p className="text-sm text-muted-foreground" data-testid="ticket-requester">
                Contact : {[t.requester_name, t.requester_email, t.requester_phone].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
          {writable ? (
            <div className="flex flex-wrap gap-2">
              {t.status !== "closed" ? (
                <QuickFormDialog
                  title="Répondre"
                  description="L'établissement est prévenu par notification, sauf pour une note interne."
                  trigger={<Button size="sm">Répondre</Button>}
                  action={addSupportMessage}
                  hidden={{ ticket_id: t.id }}
                  fields={[
                    { name: "body", label: "Message", type: "textarea", required: true, wide: true },
                    { name: "internal", label: "Note interne (invisible pour l'établissement)", type: "checkbox", wide: true },
                  ]}
                />
              ) : null}
              <QuickFormDialog
                title="Traitement"
                trigger={
                  <Button size="sm" variant="secondary">
                    Statut et gravité
                  </Button>
                }
                action={updateSupportTicket}
                hidden={{ ticket_id: t.id }}
                fields={[
                  { name: "status", label: "Statut", type: "select", required: true, options: options(TICKET_STATUSES), defaultValue: t.status },
                  { name: "severity", label: "Gravité", type: "select", required: true, options: options(TICKET_SEVERITIES), defaultValue: t.severity },
                  { name: "assign_me", label: "Je prends en charge cette demande", type: "checkbox", wide: true, defaultValue: t.assigned_to ? "false" : "true" },
                ]}
              />
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          <SupportThread description={t.description} createdAt={t.created_at} author={org ? org.name : "Équipe NeoScool"} messages={messages ?? []} />
          {t.resolved_at ? <p className="mt-3 text-xs text-muted-foreground">Résolue le {new Date(t.resolved_at).toLocaleString("fr-FR")}.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
