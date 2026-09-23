import { ImageUp, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { FileUploadDialog } from "@/components/shared/file-upload-dialog";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveBranding, uploadBrandingImage } from "@/features/report-cards/actions";
import { ReportConfigEditor } from "@/features/report-cards/components/config-editor";
import { readReportConfig } from "@/features/report-cards/config";
import { getBranding, getReportCardConfig } from "@/features/report-cards/queries";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Configuration du bulletin" };

const IMAGES = [
  { slot: "logo", label: "Logo", key: "logo_path" },
  { slot: "stamp", label: "Cachet", key: "stamp_path" },
  { slot: "signature", label: "Signature du chef d'établissement", key: "signature_path" },
] as const;

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

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>Identité des documents officiels</CardTitle>
            <CardDescription>Logo, cachet, signature et signataire utilisés sur les bulletins, certificats, reçus et factures.</CardDescription>
          </div>
          {canBrand ? (
            <QuickFormDialog
              title="Signataire et textes"
              trigger={
                <Button variant="secondary" size="sm">
                  <Pencil aria-hidden /> Modifier
                </Button>
              }
              action={saveBranding}
              fields={[
                { name: "signatory_name", label: "Nom du signataire", defaultValue: branding?.signatory_name ?? undefined },
                { name: "signatory_title", label: "Fonction du signataire", defaultValue: branding?.signatory_title ?? undefined },
                { name: "header_text", label: "Mention d'en-tête", defaultValue: branding?.header_text ?? undefined, wide: true },
                { name: "footer_text", label: "Pied de page", defaultValue: branding?.footer_text ?? undefined, wide: true },
              ]}
            />
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Signataire</span>
            <strong>{branding?.signatory_name ?? "—"}</strong>
            <span className="text-muted-foreground">{branding?.signatory_title ?? ""}</span>
          </div>
          {IMAGES.map((image) => {
            const fileId = branding?.[image.key];
            return (
              <div key={image.slot} className="grid justify-items-start gap-2 text-sm">
                <span className="text-muted-foreground">{image.label}</span>
                {fileId && isUuid(fileId) ? (
                  <Image src={`/api/fichiers/${fileId}`} alt={image.label} width={120} height={80} unoptimized className="h-16 w-auto rounded border border-border bg-white object-contain p-1" />
                ) : (
                  <span className="text-xs text-muted-foreground">Aucune image</span>
                )}
                {canBrand ? (
                  <FileUploadDialog
                    title={image.label}
                    description="PNG (fond transparent conseillé) ou JPEG, 5 Mo maximum."
                    action={uploadBrandingImage}
                    fields={{ slot: image.slot }}
                    trigger={
                      <Button variant="ghost" size="sm">
                        <ImageUp aria-hidden /> Remplacer
                      </Button>
                    }
                  />
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <ReportConfigEditor initial={readReportConfig(config)} />
    </div>
  );
}
