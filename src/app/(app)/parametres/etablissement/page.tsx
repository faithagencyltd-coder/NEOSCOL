import { FileCog, Link2, Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandingAssets } from "@/features/organization/components/branding-assets";
import { IdentityForm } from "@/features/organization/components/identity-form";
import { getBranding } from "@/features/report-cards/queries";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Établissement" };

/** Identité de l'établissement : coordonnées, couleurs, logo, cachet, signature, en-tête et pied de page. */
export default async function OrganizationIdentityPage() {
  const context = await requirePermission("settings.manage");
  const orgId = context.organization.id;
  const supabase = await createClient();
  const [{ data: org }, branding] = await Promise.all([
    supabase.from("organizations").select("name, type, short_name, code, email, phone, website, address, city").eq("id", orgId).single(),
    getBranding(orgId),
  ]);
  return (
    <div className="grid gap-5">
      <PageHeader
        title="Identité de l'établissement"
        description={`Coordonnées et identité visuelle reprises sur tous les documents officiels. Code établissement : ${org?.code ?? "—"}.`}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/parametres/portails">
                <Link2 aria-hidden /> Lien des portails
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/documents/modeles">
                <FileCog aria-hidden /> Document Studio
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/parametres">
                <Settings2 aria-hidden /> Règles et paramètres
              </Link>
            </Button>
          </>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Coordonnées et couleurs</CardTitle>
        </CardHeader>
        <CardContent>
          <IdentityForm
            canEdit={can(context, "settings.manage")}
            values={{
              name: org?.name ?? context.organization.name,
              type: org?.type ?? context.organization.type,
              short_name: org?.short_name ?? null,
              email: org?.email ?? null,
              phone: org?.phone ?? null,
              website: org?.website ?? null,
              address: org?.address ?? null,
              city: org?.city ?? null,
              primary_color: branding?.primary_color ?? "#1D4ED8",
              secondary_color: branding?.secondary_color ?? "#0F172A",
              logoId: branding?.logo_path && isUuid(branding.logo_path) ? branding.logo_path : null,
            }}
          />
        </CardContent>
      </Card>
      <BrandingAssets branding={branding} canEdit={can(context, "settings.manage")} />
    </div>
  );
}
