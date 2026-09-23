import { IdCard, Printer, QrCode } from "lucide-react";
import type { Metadata } from "next";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TabNav } from "@/components/shared/tab-nav";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getBranding } from "@/features/report-cards/queries";
import { issueBadge } from "@/features/staff/actions";
import { BadgeCard, type BadgeCardData } from "@/features/staff/components/badge-card";
import { BadgePreviewDialog } from "@/features/staff/components/badge-preview-dialog";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { qrDataUrl } from "@/lib/pdf/qr";
import { createClient } from "@/lib/supabase/server";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Badges du personnel" };

const KINDS = [
  { key: "tous", label: "Tout le personnel" },
  { key: "enseignants", label: "Enseignants et formateurs" },
  { key: "administratif", label: "Personnel administratif" },
] as const;

/**
 * Galerie des badges professionnels. Le QR (qui permet de pointer) n'est
 * affiché, généré et imprimé qu'avec la permission staff.badges.manage.
 */
export default async function StaffBadgesPage({ searchParams }: PageProps<"/personnel/badges">) {
  const context = await requirePermission("staff.read");
  const manage = can(context, "staff.badges.manage");
  const requested = param(await searchParams, "type");
  const kind = KINDS.find((k) => k.key === requested)?.key ?? "tous";
  const supabase = await createClient();
  let query = supabase
    .from("staff_members")
    .select("id, first_name, last_name, job_title, employee_number, photo_path, is_teacher, status")
    .eq("organization_id", context.organization.id)
    .is("archived_at", null)
    .eq("status", "active");
  if (kind === "enseignants") query = query.eq("is_teacher", true);
  if (kind === "administratif") query = query.eq("is_teacher", false);
  const [{ data: staff }, { data: badges }, branding] = await Promise.all([
    query.order("last_name"),
    supabase
      .from("staff_badges")
      .select(manage ? "staff_id, number, token, academic_year:academic_years(name)" : "staff_id, number, academic_year:academic_years(name)")
      .eq("organization_id", context.organization.id)
      .eq("status", "active"),
    getBranding(context.organization.id),
  ]);
  const badgeByStaff = new Map(
    ((badges ?? []) as unknown as { staff_id: string; number: string; token?: string; academic_year: { name: string } | null }[]).map((b) => [b.staff_id, b]),
  );
  const cards = await Promise.all(
    (staff ?? []).map(async (s) => {
      const badge = badgeByStaff.get(s.id);
      const data: BadgeCardData = {
        name: `${s.first_name} ${s.last_name}`,
        jobTitle: s.job_title,
        employeeNumber: s.employee_number,
        photoId: s.photo_path,
        organization: context.organization.name,
        logoId: branding?.logo_path ?? null,
        badgeNumber: badge?.number ?? null,
        year: badge?.academic_year?.name ?? null,
        qr: manage && badge?.token ? await qrDataUrl(`NEOSCOL-BADGE:${badge.token}`, "#0B1F3A") : null,
        isTeacher: s.is_teacher,
      };
      return { id: s.id, data, hasBadge: Boolean(badge) };
    }),
  );
  const withBadge = cards.filter((c) => c.hasBadge).length;

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Badges du personnel"
        description={`${cards.length} membre(s) actif(s) · ${withBadge} badge(s) actif(s). Le QR code sert uniquement au pointage sur la tablette de l'administration.`}
        actions={
          manage && withBadge > 0 ? (
            <Button asChild>
              <a href={`/api/documents/badges${kind === "tous" ? "" : `?type=${kind}`}`} target="_blank" rel="noreferrer">
                <Printer aria-hidden /> Imprimer tous les badges
              </a>
            </Button>
          ) : null
        }
      />
      {!manage ? (
        <Alert tone="info">Consultation seule : l&apos;affichage des QR codes, la génération et l&apos;impression sont réservés à la gestion des badges.</Alert>
      ) : null}
      <TabNav
        label="Filtrer le personnel"
        active={kind}
        tabs={KINDS.map((k) => ({ key: k.key, label: k.label, href: k.key === "tous" ? "/personnel/badges" : `/personnel/badges?type=${k.key}` }))}
      />
      {cards.length === 0 ? (
        <Card>
          <EmptyState icon={IdCard} title="Aucun membre du personnel" />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {cards.map((card, i) => (
            <li
              key={card.id}
              className="rise grid justify-items-center gap-3 rounded-3xl border border-border bg-surface-muted/60 p-5"
              style={{ "--delay": `${Math.min(i, 12) * 35}ms` } as React.CSSProperties}
            >
              <BadgeCard data={card.data} className="transition-transform duration-300 hover:-translate-y-1 hover:rotate-[-1deg]" />
              <div className="flex flex-wrap justify-center gap-2">
                <BadgePreviewDialog name={card.data.name} printHref={manage && card.hasBadge ? `/api/documents/badges/${card.id}` : undefined}>
                  <BadgeCard data={card.data} />
                </BadgePreviewDialog>
                {manage && !card.hasBadge ? (
                  <ConfirmAction
                    trigger={
                      <Button size="sm">
                        <QrCode aria-hidden /> Générer
                      </Button>
                    }
                    title={`Générer le badge de ${card.data.name} ?`}
                    description="Un QR code unique est créé ; il permet de pointer sur la tablette de l'administration."
                    confirmLabel="Générer"
                    action={issueBadge}
                    fields={{ staff_id: card.id }}
                  />
                ) : null}
                {manage && card.hasBadge ? (
                  <Button asChild size="sm" variant="secondary">
                    <a href={`/api/documents/badges/${card.id}`} target="_blank" rel="noreferrer">
                      <Printer aria-hidden /> Imprimer
                    </a>
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
