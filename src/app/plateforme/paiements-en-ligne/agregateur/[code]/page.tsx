import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { CustomGatewayEditor } from "@/features/platform/components/custom-gateway-editor";
import { aiAvailable } from "@/lib/ai/anthropic";
import { CUSTOM_CODE, customDefinitionSchema, EMPTY_DEFINITION } from "@/lib/payments/custom-definition";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Agrégateur personnalisé — Plateforme" };

export default async function EditCustomGatewayPage({ params }: PageProps<"/plateforme/paiements-en-ligne/agregateur/[code]">) {
  const { code } = await params;
  if (!CUSTOM_CODE.test(code)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("custom_payment_gateways").select("provider, definition, payment_providers(name, description, is_active)").eq("provider", code).maybeSingle();
  if (!data) notFound();
  const provider = data.payment_providers as unknown as { name: string; description: string | null; is_active: boolean } | null;
  const parsed = customDefinitionSchema.safeParse(data.definition);
  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <Link href="/plateforme/paiements-en-ligne" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Paiements en ligne
      </Link>
      <div className="grid gap-1">
        <h2 className="text-2xl font-bold">{provider?.name ?? code}</h2>
        <p className="text-sm text-muted-foreground">Toute modification de la définition retire l&apos;agrégateur des moyens proposés jusqu&apos;à un nouveau test réussi.</p>
      </div>
      {!provider?.is_active ? <Alert tone="warning" title="Agrégateur archivé">Enregistrer le réactive (il restera non proposé tant qu&apos;il n&apos;est pas testé).</Alert> : null}
      {!parsed.success ? <Alert tone="danger" title="Définition enregistrée invalide">Corrigez-la ci-dessous (repartie d&apos;un modèle vierge).</Alert> : null}
      <CustomGatewayEditor code={code} initialName={provider?.name ?? ""} initialDescription={provider?.description ?? ""} initial={parsed.success ? parsed.data : EMPTY_DEFINITION} aiReady={await aiAvailable()} />
    </div>
  );
}
