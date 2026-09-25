import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { CheckoutWizard } from "@/features/billing/components/checkout-wizard";
import { getSubscription, listPlans } from "@/features/billing/queries";
import { requirePermission } from "@/lib/auth/guards";
import { activePaymentSetup } from "@/lib/payments/config";
import { publicBaseUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Payer mon abonnement" };

export default async function CheckoutPage({ searchParams }: PageProps<"/abonnement/souscrire">) {
  const context = await requirePermission("billing.manage");
  const params = await searchParams;
  const supabase = await createClient();
  const [plans, subscription, { data: org }] = await Promise.all([
    listPlans(),
    getSubscription(context.organization.id),
    supabase.from("organizations").select("name, type, city, country, email, phone, code").eq("id", context.organization.id).single(),
  ]);
  const setup = activePaymentSetup(await publicBaseUrl());
  const active = plans.filter((p) => p.is_active);
  const trialing = subscription?.status === "TRIALING";
  return (
    <div className="grid gap-6">
      <PageHeader title="Payer mon abonnement" description="Formule, périodicité, récapitulatif puis paiement sécurisé. Montants officiels en F CFA (XOF)." />
      <CheckoutWizard
        plans={active}
        organization={{
          name: org?.name ?? context.organization.name,
          type: org?.type ?? context.organization.type,
          city: org?.city ?? null,
          country: org?.country ?? "",
          email: org?.email ?? null,
          phone: org?.phone ?? null,
          code: org?.code ?? context.organization.code,
        }}
        initialPlan={typeof params.formule === "string" ? params.formule : (subscription?.plan?.code ?? "")}
        initialInterval={params.periodicite === "YEARLY" || (!params.periodicite && subscription?.billing_interval === "YEARLY") ? "YEARLY" : "MONTHLY"}
        trial={{ active: trialing, endLabel: trialing && subscription?.trial_end ? formatDate(subscription.trial_end, "fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null }}
        payment={setup.enabled ? { enabled: true, label: setup.label, test: setup.mode === "test" } : { enabled: false, label: "", test: false, reason: setup.reason }}
      />
    </div>
  );
}
