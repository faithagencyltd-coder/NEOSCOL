import { ArrowRight, Building2, CalendarClock, CheckCircle2, CreditCard, Lock, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { switchOrganization } from "@/features/auth/actions";
import { CreateSpaceButton, Module4ComponentsForm } from "@/features/billing/components/module4-forms";
import { COMPONENT_ICONS } from "@/features/billing/components/module4-space-bar";
import { INTERVAL_LABELS, MODULE4_COMPONENTS, SUBSCRIPTION_STATUS } from "@/features/billing/constants";
import { module4Overview } from "@/features/billing/module4";
import { requireOrganization } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatMoney } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Mes espaces" };

/**
 * Module 4 : établissement principal et ses espaces (un par domaine souscrit),
 * sous un seul abonnement. Accès, création et domaines contrôlés en base.
 */
export default async function SpacesPage() {
  const context = await requireOrganization();
  const overview = await module4Overview(context.organization.id);
  if (!overview) redirect("/tableau-de-bord");
  const isGroup = context.organization.id === overview.group.id;
  const canCreate = isGroup && can(context, "settings.manage");
  const canBill = isGroup && can(context, "billing.manage");
  const trialing = overview.status === "TRIALING";
  const interval = INTERVAL_LABELS[overview.interval] ?? INTERVAL_LABELS.MONTHLY!;
  const price = overview.interval === "YEARLY" ? overview.annual_price : overview.monthly_price;
  const endAt = trialing || !overview.current_period_end ? overview.trial_end : overview.current_period_end;
  const fmt = (d: string | null | undefined) => (d ? formatDate(d, "fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—");

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Mes espaces"
        description={`${overview.group.name} — un seul abonnement Module 4 pour vos domaines : école, formation professionnelle, université.`}
        actions={
          isGroup && can(context, "billing.read") ? (
            <Button asChild variant="secondary">
              <Link href="/abonnement">
                <CreditCard aria-hidden /> Mon abonnement
              </Link>
            </Button>
          ) : null
        }
      />

      <Card className="anim-fade-up overflow-hidden">
        <div className="bg-gradient-to-br from-[#07142b] via-[#0b2559] to-[#4f46e5] p-5 text-white sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="grid gap-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Abonnement</p>
              <h2 className="text-2xl font-bold">Module 4 — Multi-modules</h2>
              <p className="text-sm text-white/80">
                {formatMoney(price, overview.currency)} {interval.short} · {interval.label} · même prix pour 1, 2 ou 3 domaines
              </p>
            </div>
            <span className="rounded-full bg-white/95 px-1 py-0.5">
              <StatusBadge value={overview.status} map={SUBSCRIPTION_STATUS} />
            </span>
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm text-white/85">
            <CalendarClock className="size-4 text-cyan-300" aria-hidden />
            {trialing ? "Fin de l'essai gratuit" : "Fin de période"} : {fmt(endAt)} · souscrit le {fmt(overview.created_at)}
          </p>
        </div>
      </Card>

      <ul className="stagger grid gap-4 md:grid-cols-3">
        {MODULE4_COMPONENTS.map((c) => {
          const subscribed = overview.components.includes(c.key);
          const space = overview.spaces.find((s) => s.component === c.key);
          const Icon = COMPONENT_ICONS[c.key];
          const readOnly = space?.access === "read_only";
          return (
            <li
              key={c.key}
              className={cn(
                "hover-lift flex flex-col gap-4 rounded-3xl border bg-surface p-5 shadow-sm",
                subscribed ? "border-primary/30" : "border-border opacity-80",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span className={cn("flex size-11 items-center justify-center rounded-2xl", subscribed ? "bg-primary-soft text-primary" : "bg-surface-muted text-muted-foreground")}>
                  <Icon className="size-5" aria-hidden />
                </span>
                {subscribed ? (
                  <Badge tone="success">
                    <CheckCircle2 className="size-3.5" aria-hidden /> Inclus
                  </Badge>
                ) : (
                  <Badge tone="neutral">
                    <XCircle className="size-3.5" aria-hidden /> Non inclus
                  </Badge>
                )}
              </div>
              <div className="grid gap-1">
                <h3 className="font-bold">{c.label}</h3>
                <p className="text-sm text-muted-foreground">{c.hint}</p>
              </div>
              {space ? (
                <div className="grid gap-1 rounded-2xl border border-border p-3 text-sm">
                  <span className="font-semibold">{space.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{space.code}</span>
                  {readOnly ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-warning">
                      <Lock className="size-3.5" aria-hidden /> Lecture seule — données conservées
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-auto flex flex-wrap gap-2">
                {space && space.member ? (
                  <form action={switchOrganization}>
                    <input type="hidden" name="organizationId" value={space.id} />
                    <Button type="submit" size="sm" variant={readOnly ? "secondary" : "primary"}>
                      Ouvrir l&apos;espace <ArrowRight aria-hidden />
                    </Button>
                  </form>
                ) : space ? (
                  <p className="text-xs text-muted-foreground">Vous n&apos;êtes pas membre de cet espace.</p>
                ) : subscribed && canCreate ? (
                  <CreateSpaceButton component={c.key} label={c.label} defaultName={`${overview.group.name} — ${c.label}`} />
                ) : subscribed ? (
                  <p className="text-xs text-muted-foreground">Espace pas encore créé par la direction.</p>
                ) : canBill ? (
                  <Button asChild size="sm" variant="secondary">
                    <a href="#domaines">Ajouter ce domaine</a>
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">Domaine non inclus dans l&apos;abonnement.</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {!isGroup ? (
        <Alert tone="info">
          <span className="inline-flex items-center gap-2">
            <Building2 className="size-4" aria-hidden /> Les domaines et l&apos;abonnement se gèrent depuis l&apos;établissement principal « {overview.group.name} ».
          </span>
        </Alert>
      ) : null}

      {canBill ? (
        <Card id="domaines" className="anim-fade-up scroll-mt-24">
          <CardHeader>
            <CardTitle>Domaines de l&apos;abonnement</CardTitle>
            <CardDescription>1, 2 ou 3 domaines : le tarif du Module 4 reste identique. Un domaine retiré passe en lecture seule, sans suppression.</CardDescription>
          </CardHeader>
          <CardContent>
            <Module4ComponentsForm components={overview.components} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
