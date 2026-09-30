import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { GatewayCard, type GatewayView } from "@/features/platform/components/gateway-card";
import { encryptionKeyFrom } from "@/lib/messaging/crypto";
import { customDefinitionSchema, customGatewayDefinition } from "@/lib/payments/custom-definition";
import { GATEWAYS, type GatewayDefinition } from "@/lib/payments/gateways";
import { publicBaseUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Paiements en ligne — Plateforme" };

/**
 * Passerelles de paiement des abonnements : le Super Admin choisit, active,
 * change de fournisseur et passe du mode test au réel sans toucher au code.
 */
export default async function PlatformGatewaysPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("payment_gateway_settings")
    .select("provider, checkout_enabled, mode, is_default, public_label, instructions, config, secret_hint, last_test_at, last_test_ok, last_test_message");
  const base = await publicBaseUrl();
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  const envFallback = (process.env.PAYMENT_PROVIDER ?? "").trim();
  const anyEnabled = (rows ?? []).some((r) => r.checkout_enabled);
  const { data: customs } = await supabase.from("custom_payment_gateways").select("provider, definition, payment_providers(name, description, is_active)").order("created_at");
  const customDefs: (GatewayDefinition & { custom?: true; archived?: boolean })[] = [];
  for (const c of customs ?? []) {
    const p = c.payment_providers as unknown as { name: string; description: string | null; is_active: boolean } | null;
    const parsed = customDefinitionSchema.safeParse(c.definition);
    if (parsed.success) customDefs.push({ ...customGatewayDefinition(c.provider, p?.name ?? c.provider, p?.description ?? null, parsed.data), archived: !p?.is_active });
  }

  const gateways: GatewayView[] = [...GATEWAYS, ...customDefs].map((def) => {
    const row = rows?.find((r) => r.provider === def.code);
    return {
      def,
      enabled: row?.checkout_enabled ?? false,
      mode: row?.mode === "live" ? "live" : "test",
      isDefault: row?.is_default ?? false,
      publicLabel: row?.public_label ?? "",
      instructions: row?.instructions ?? "",
      config: (row?.config ?? {}) as Record<string, string>,
      secretHint: row?.secret_hint ?? null,
      webhookUrl: `${base}/api/webhooks/payments/${def.code}${secret ? `?cle=${encodeURIComponent(secret)}` : ""}`,
      lastTest: row?.last_test_at ? { at: row.last_test_at, ok: Boolean(row.last_test_ok), message: row.last_test_message } : null,
      custom: "custom" in def ? { editHref: `/plateforme/paiements-en-ligne/agregateur/${def.code}`, archived: Boolean("archived" in def && def.archived) } : undefined,
    };
  });

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="grid gap-1">
        <h2 className="text-2xl font-bold">Paiements en ligne</h2>
        <p className="text-sm text-muted-foreground">
          Choisissez les moyens de paiement proposés aux établissements pour leur abonnement. Vous pouvez en activer plusieurs (le client choisit), changer de
          fournisseur à tout moment et passer du mode test au mode réel, sans aucune intervention technique. Pour tout autre moyen (numéro Mobile Money, virement,
          lien de paiement de n&apos;importe quel fournisseur), utilisez le « Paiement par transfert » : vous validez chaque paiement dans l&apos;onglet Paiements.
          Un agrégateur absent de la liste ? Ajoutez-le vous-même avec « Ajouter un agrégateur ».
        </p>
      </div>
      <Link href="/plateforme/paiements-en-ligne/agregateur" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
        <Plus className="size-4" aria-hidden /> Ajouter un agrégateur
      </Link>
      </div>
      {!encryptionReady() ? <Alert tone="danger" title="Chiffrement indisponible">La clé de service Supabase est absente du serveur : impossible d&apos;enregistrer des clés.</Alert> : null}
      {!anyEnabled ? (
        <Alert tone="warning" title="Aucune passerelle proposée pour l'instant">
          {envFallback
            ? `Le serveur utilise encore sa configuration technique (${envFallback}). Dès qu'une passerelle est proposée ici, elle la remplace.`
            : "Les établissements ne peuvent pas encore payer en ligne. Configurez puis proposez au moins une passerelle."}
        </Alert>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-2">
        {gateways.map((g) => (
          <GatewayCard key={g.def.code} gateway={g} />
        ))}
      </div>
    </div>
  );
}

function encryptionReady() {
  return encryptionKeyFrom(process.env) !== null;
}
