import { AlertTriangle, ArrowRight, Gift, Lock } from "lucide-react";
import Link from "next/link";

import { getAccessState } from "@/features/billing/queries";
import { cn } from "@/lib/utils/cn";

/**
 * Bandeau d'état de l'abonnement NéoScol : essai (jours restants), échéance
 * dépassée, lecture seule. Les responsables (billing.read) voient le lien de paiement ;
 * en lecture seule, tous les membres sont informés.
 */
export async function SubscriptionBanner({ organizationId, canBill }: { organizationId: string; canBill: boolean }) {
  const state = await getAccessState(organizationId);
  if (!state?.status || state.is_demo) return null;
  const days = state.days_left ?? 0;
  const endDate = state.end_at ? new Date(state.end_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "";

  let tone: "info" | "warning" | "danger";
  let icon = Gift;
  let text: string;
  if (state.access === "read_only") {
    tone = "danger";
    icon = Lock;
    text = "Établissement en lecture seule : l'abonnement NéoScol est à régler. Toutes vos données sont conservées et consultables.";
  } else if (state.status === "TRIALING") {
    if (!canBill) return null;
    tone = days <= 3 ? "warning" : "info";
    text = days > 0 ? `Essai gratuit — il vous reste ${days} jour${days > 1 ? "s" : ""} d'essai (jusqu'au ${endDate}).` : "Votre essai gratuit se termine aujourd'hui.";
  } else if (["PAST_DUE", "GRACE_PERIOD"].includes(state.status)) {
    if (!canBill) return null;
    tone = "warning";
    icon = AlertTriangle;
    text = "Abonnement à régler : réglez-le pour éviter le passage en lecture seule.";
  } else if (state.cancel_at_period_end) {
    if (!canBill) return null;
    tone = "info";
    text = `Annulation programmée : accès complet jusqu'au ${endDate}.`;
  } else {
    return null;
  }
  const Icon = icon;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "anim-fade-up flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-sm font-medium",
        tone === "danger" ? "bg-danger-soft text-danger" : tone === "warning" ? "bg-warning-soft text-warning" : "bg-primary-soft text-primary",
      )}
    >
      <span className="inline-flex items-center gap-2">
        <Icon className="size-4 shrink-0" aria-hidden /> {text}
      </span>
      {canBill ? (
        <Link href="/abonnement" className="inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline">
          {state.status === "TRIALING" ? "Choisir ma formule" : "Mon abonnement"} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}
