import { Inbox, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { InlineForm } from "@/features/ecosystem/components/inline-form";
import { LEAD_SOURCES, LEAD_STATUSES, LEAD_SUBJECTS } from "@/features/ecosystem/constants";
import { moduleClosed } from "@/features/ecosystem/module-closed";
import { updateLead } from "@/features/ecosystem/school-actions";
import { requirePermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Demandes reçues" };
export const dynamic = "force-dynamic";

const EVENT_KINDS: Record<string, string> = { note: "Note", call: "Appel", email: "E-mail", whatsapp: "WhatsApp", meeting: "Rendez-vous", status: "Statut" };
const when = (d: string) => new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

/** NeoScool Leads : demandes d'information venues de la fiche publique et des campagnes, avec leur origine et leur suivi. */
export default async function LeadsPage({ searchParams }: PageProps<"/visibilite/demandes">) {
  const context = await requirePermission("enrollments.manage");
  const closed = moduleClosed(context.organization, "leads");
  const sp = await searchParams;
  const status = param(sp, "statut") ?? "";
  const source = param(sp, "origine") ?? "";
  const selected = param(sp, "demande");
  const supabase = await createClient();
  let query = supabase.from("org_leads").select("id, full_name, phone, email, program, subject, message, source, campaign_id, status, assigned_to, created_at, updated_at").eq("organization_id", context.organization.id).order("created_at", { ascending: false }).limit(200);
  if (status) query = query.eq("status", status);
  if (source) query = query.eq("source", source);
  const { data: leads } = closed ? { data: [] } : await query;
  const current = isUuid(selected) ? (leads ?? []).find((l) => l.id === selected) : undefined;
  const [{ data: events }, { data: campaigns }] = await Promise.all([
    current ? supabase.from("org_lead_events").select("id, kind, body, created_at").eq("lead_id", current.id).order("created_at") : Promise.resolve({ data: [] as { id: string; kind: string; body: string; created_at: string }[] }),
    supabase.from("promo_campaigns").select("id, title").eq("organization_id", context.organization.id),
  ]);
  const campaignTitle = new Map((campaigns ?? []).map((c) => [c.id, c.title]));
  const link = (extra: Record<string, string>) => `/visibilite/demandes?${new URLSearchParams({ ...(status ? { statut: status } : {}), ...(source ? { origine: source } : {}), ...extra })}`;

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader title="Demandes reçues" description="Demandes d'information envoyées depuis votre fiche NeoScool Discover et vos campagnes. Les coordonnées ne servent qu'à répondre à la personne." />
      {closed ?? (
        <>
          <form method="get" className="flex flex-wrap gap-2">
            <Select name="statut" defaultValue={status} aria-label="Statut" className="w-auto">
              <option value="">Tous les statuts</option>
              {Object.entries(LEAD_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
            <Select name="origine" defaultValue={source} aria-label="Origine" className="w-auto">
              <option value="">Toutes les origines</option>
              {Object.entries(LEAD_SOURCES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <button type="submit" className="rounded-lg border border-border px-3 text-sm">
              Filtrer
            </button>
          </form>
          {(leads ?? []).length === 0 ? (
            <EmptyState icon={Inbox} title="Aucune demande" description="Les demandes envoyées depuis votre fiche publique et vos campagnes apparaîtront ici." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
              <ul className="grid content-start gap-2" data-testid="leads-list">
                {(leads ?? []).map((l) => (
                  <li key={l.id}>
                    <Link href={link({ demande: l.id })} scroll={false} className={`grid gap-1 rounded-xl border bg-surface p-3 hover:shadow sm:grid-cols-[1fr_auto] sm:items-center ${current?.id === l.id ? "border-primary" : "border-border"}`}>
                      <div className="grid">
                        <span className="font-medium">{l.full_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {LEAD_SUBJECTS[l.subject] ?? l.subject}
                          {l.program ? ` · ${l.program}` : ""} · {LEAD_SOURCES[l.source] ?? l.source}
                          {l.campaign_id && campaignTitle.get(l.campaign_id) ? ` (${campaignTitle.get(l.campaign_id)})` : ""} · {when(l.created_at)}
                        </span>
                      </div>
                      <StatusBadge value={l.status} map={LEAD_STATUSES} />
                    </Link>
                  </li>
                ))}
              </ul>
              {current ? (
                <Card className="content-start" data-testid="lead-detail">
                  <CardHeader>
                    <CardTitle>{current.full_name}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 text-sm">
                    <div className="grid gap-1">
                      {current.phone ? (
                        <a href={`tel:${current.phone}`} className="flex items-center gap-2 hover:underline">
                          <Phone className="size-4" aria-hidden /> {current.phone}
                        </a>
                      ) : null}
                      {current.email ? (
                        <a href={`mailto:${current.email}`} className="flex items-center gap-2 hover:underline">
                          <Mail className="size-4" aria-hidden /> {current.email}
                        </a>
                      ) : null}
                    </div>
                    {current.message ? <p className="whitespace-pre-line rounded-lg bg-surface-muted p-3">{current.message}</p> : null}
                    <ol className="grid gap-2 border-l border-border pl-3">
                      {(events ?? []).map((e) => (
                        <li key={e.id}>
                          <span className="text-xs text-muted-foreground">
                            {EVENT_KINDS[e.kind] ?? e.kind} · {when(e.created_at)}
                          </span>
                          <p className="whitespace-pre-line">{e.kind === "status" ? e.body.replace(/^(\w+) → (\w+)/, (_, a: string, b: string) => `${LEAD_STATUSES[a]?.label ?? a} → ${LEAD_STATUSES[b]?.label ?? b}`) : e.body}</p>
                        </li>
                      ))}
                    </ol>
                    <InlineForm action={updateLead} hidden={{ id: current.id }} submit="Enregistrer le suivi" reset testId="lead-update">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Select name="status" defaultValue={current.status} aria-label="Statut">
                          {Object.entries(LEAD_STATUSES).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v.label}
                            </option>
                          ))}
                        </Select>
                        <Select name="event_kind" defaultValue="note" aria-label="Type d'action">
                          {Object.entries(EVENT_KINDS)
                            .filter(([k]) => k !== "status")
                            .map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                        </Select>
                      </div>
                      <Textarea name="event_body" rows={2} maxLength={2000} placeholder="Compte rendu de l'appel, prochaine étape…" aria-label="Note" />
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" name="assign_me" defaultChecked={!current.assigned_to} /> Je prends en charge cette demande
                      </label>
                    </InlineForm>
                    {current.status === "enrolling" || current.status === "interested" ? (
                      <Link href="/inscriptions" className="text-sm font-semibold text-primary hover:underline">
                        Ouvrir les inscriptions →
                      </Link>
                    ) : null}
                  </CardContent>
                </Card>
              ) : (
                <p className="text-sm text-muted-foreground">Sélectionnez une demande pour la traiter.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
