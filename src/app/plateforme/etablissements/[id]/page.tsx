import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FeaturesForm } from "@/features/organization/components/features-form";
import { savePlatformOrganizationFeatures } from "@/features/organization/feature-actions";
import { ORG_TYPE_LABELS } from "@/features/platform/org-types";
import { FEATURE_FLAGS, featureEnabled, featureLockedByPlatform } from "@/lib/features";
import type { OrganizationSummary } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Fonctionnalités de l'établissement" };

/**
 * Super Admin : fonctionnalités d'un établissement. Décocher = arrêt forcé
 * (prime sur le réglage de l'établissement, motif obligatoire, audité).
 */
export default async function PlatformOrganizationFeaturesPage({ params }: PageProps<"/plateforme/etablissements/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("id, name, short_name, code, type, currency, locale, timezone, is_demo, settings").eq("id", id).maybeSingle();
  if (!org) notFound();
  // Colonne calculée (règles générales du Contrôle des modules), lue à part : non décrite par les types générés.
  const { data: locks } = await supabase.from("organizations").select("platform_locked_features" as string).eq("id", id).maybeSingle();
  const organization = { ...org, platform_locked_features: (locks as { platform_locked_features?: Record<string, boolean> } | null)?.platform_locked_features ?? null } as unknown as OrganizationSummary;
  // Arrêt propre à cet établissement (le formulaire) ; les règles générales sont seulement signalées.
  const ownLock = (key: (typeof FEATURE_FLAGS)[number]["key"]) => featureLockedByPlatform({ ...organization, platform_locked_features: null }, key);
  const ruleLock = (key: (typeof FEATURE_FLAGS)[number]["key"]) => organization.platform_locked_features?.[key] === false;
  return (
    <div className="grid gap-5">
      <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
        <Link href="/plateforme" className="hover:text-primary">
          Établissements
        </Link>{" "}
        / <span className="text-foreground">{org.name}</span>
      </nav>
      <Card>
        <CardHeader>
          <CardTitle>Fonctionnalités — {org.name}</CardTitle>
          <CardDescription>
            {ORG_TYPE_LABELS[org.type] ?? org.type} · {org.code}. Décochez une fonctionnalité pour l&apos;arrêter dans cet établissement : elle disparaît de ses
            écrans et l&apos;établissement ne peut pas la réactiver. Aucune donnée n&apos;est supprimée.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FeaturesForm
            mode="platform"
            action={savePlatformOrganizationFeatures}
            hidden={{ organization_id: org.id }}
            rows={FEATURE_FLAGS.map((f) => ({
              ...f,
              enabled: !ownLock(f.key),
              hint: `${f.hint} ${ownLock(f.key) ? "— arrêtée par NeoScool." : ruleLock(f.key) ? "— arrêtée par une règle générale (Contrôle des modules)." : featureEnabled(organization, f.key) ? "— active dans l'établissement." : "— désactivée par l'établissement."}`,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
