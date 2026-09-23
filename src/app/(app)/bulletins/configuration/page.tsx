import type { Metadata } from "next";
import Link from "next/link";

import { BrandingAssets } from "@/features/organization/components/branding-assets";
import { ReportConfigEditor } from "@/features/report-cards/components/config-editor";
import { readReportConfig } from "@/features/report-cards/config";
import { getBranding, getReportCardConfig } from "@/features/report-cards/queries";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Configuration du bulletin" };


/** Éditeur du bulletin par établissement (report_cards.manage) + identité des documents (settings.manage). */
export default async function ReportCardSettingsPage() {
  const context = await requirePermission("report_cards.manage");
  const organizationId = context.organization.id;
  const [config, branding] = await Promise.all([getReportCardConfig(organizationId), getBranding(organizationId)]);
  const canBrand = can(context, "settings.manage");
  return (
    <div className="grid gap-5">
      <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
        <Link href="/bulletins" className="hover:text-primary">
          Bulletins
        </Link>{" "}
        / <span className="text-foreground">Configuration</span>
      </nav>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold sm:text-[26px]">Configuration du bulletin</h1>
        <p className="text-sm text-muted-foreground">
          Propre à l&apos;établissement. Les matières, leurs coefficients et leur ordre se gèrent dans chaque{" "}
          <Link href="/classes" className="font-medium text-primary hover:underline">
            classe
          </Link>
          ; les périodes dans la{" "}
          <Link href="/structure" className="font-medium text-primary hover:underline">
            structure académique
          </Link>
          .
        </p>
      </div>

      <BrandingAssets branding={branding} canEdit={canBrand} />

      <ReportConfigEditor initial={readReportConfig(config)} />
    </div>
  );
}
