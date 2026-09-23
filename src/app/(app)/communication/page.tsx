import { Megaphone, Pencil, Pin, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { deleteAnnouncement } from "@/features/communication/actions";
import { AUDIENCE_LABELS, AnnouncementDialog } from "@/features/communication/components/announcement-dialog";
import { listAnnouncementsForManagement } from "@/features/communication/queries";
import { getVisibleAnnouncements } from "@/features/dashboard/queries";
import { requireOrganization } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { todayIn } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Annonces" };

function status(a: { published_at: string | null; expires_at: string | null }, now: string) {
  if (!a.published_at) return { label: "Brouillon", tone: "neutral" as const };
  if (a.published_at > now) return { label: `Programmée le ${formatDate(a.published_at)}`, tone: "info" as const };
  if (a.expires_at && a.expires_at <= now) return { label: "Expirée", tone: "warning" as const };
  return { label: "Publiée", tone: "success" as const };
}

/** Annonces de l'établissement : publication ciblée (communication.announce), lecture pour tous. */
export default async function CommunicationPage() {
  const context = await requireOrganization();
  const orgId = context.organization.id;
  const manage = can(context, "communication.announce");
  const tz = context.organization.timezone;
  const now = new Date().toISOString();

  if (!manage) {
    const visible = await getVisibleAnnouncements(orgId);
    return (
      <div className="grid gap-5">
        <PageHeader title="Annonces" description="Annonces publiées par la direction de l'établissement." />
        <Card>
          {visible.length === 0 ? (
            <EmptyState icon={Megaphone} title="Aucune annonce" description="Aucune annonce en cours." />
          ) : (
            <CardContent className="grid gap-4 pt-5">
              {visible.map((a) => (
                <article key={a.id} className="grid gap-1 text-sm">
                  <h2 className="flex items-center gap-2 font-semibold">
                    {a.is_pinned ? <Pin className="size-4 text-accent" aria-label="Épinglée" /> : null}
                    {a.title}
                  </h2>
                  <p className="whitespace-pre-line text-muted-foreground">{a.body}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.published_at ? formatDateTime(a.published_at, "fr-FR", tz) : ""}
                    {a.author_name ? ` · ${a.author_name}` : ""}
                  </p>
                </article>
              ))}
            </CardContent>
          )}
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const [announcements, { data: classes }] = await Promise.all([
    listAnnouncementsForManagement(orgId),
    supabase.from("classes").select("id, name, academic_year:academic_years!inner(is_current)").eq("organization_id", orgId).eq("academic_year.is_current", true).order("name"),
  ]);
  const classList = (classes ?? []).map((c) => ({ id: c.id, name: c.name }));
  const className = new Map(classList.map((c) => [c.id, c.name]));
  const today = todayIn(tz);

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Annonces"
        description="Publiez une information à tout l'établissement ou à un public ciblé (profils, classes). Les destinataires reçoivent une notification."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/messages">Messagerie</Link>
            </Button>
            <AnnouncementDialog classes={classList} today={today} />
          </>
        }
      />
      <Card>
        {announcements.length === 0 ? (
          <EmptyState icon={Megaphone} title="Aucune annonce" description="Publiez la première annonce de l'établissement." />
        ) : (
          <ul className="divide-y divide-border">
            {announcements.map((a, i) => {
              const s = status(a, now);
              const audience = (a.audience ?? {}) as { personas?: string[]; class_ids?: string[] };
              return (
                <li key={a.id} className="rise grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-start" style={{ "--delay": `${Math.min(i, 10) * 30}ms` } as React.CSSProperties}>
                  <div className="grid min-w-0 gap-1.5">
                    <h2 className="flex flex-wrap items-center gap-2 font-semibold">
                      {a.is_pinned ? <Pin className="size-4 text-accent" aria-label="Épinglée" /> : null}
                      {a.title}
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </h2>
                    <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">{a.body}</p>
                    <p className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                      {(audience.personas ?? []).map((p) => (
                        <Badge key={p} tone="primary">
                          {AUDIENCE_LABELS[p as keyof typeof AUDIENCE_LABELS] ?? p}
                        </Badge>
                      ))}
                      {(audience.class_ids ?? []).map((id) => (
                        <Badge key={id} tone="info">
                          {className.get(id) ?? "Classe"}
                        </Badge>
                      ))}
                      <span className="self-center">
                        {a.author_name ? `${a.author_name} · ` : ""}
                        {formatDateTime(a.published_at ?? a.created_at, "fr-FR", tz)}
                        {a.expires_at ? ` · jusqu'au ${formatDate(a.expires_at)}` : ""}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-1.5 sm:justify-end">
                    <AnnouncementDialog
                      classes={classList}
                      today={today}
                      announcement={a}
                      trigger={
                        <Button size="sm" variant="secondary" aria-label={`Modifier « ${a.title} »`}>
                          <Pencil aria-hidden />
                        </Button>
                      }
                    />
                    <ConfirmAction
                      trigger={
                        <Button size="sm" variant="ghost" aria-label={`Supprimer « ${a.title} »`}>
                          <Trash2 aria-hidden />
                        </Button>
                      }
                      title={`Supprimer « ${a.title} » ?`}
                      description="L'annonce disparaît immédiatement pour tous les destinataires."
                      confirmLabel="Supprimer"
                      tone="danger"
                      action={deleteAnnouncement}
                      fields={{ id: a.id }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
