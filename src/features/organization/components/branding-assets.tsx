import { ImageUp, Pencil } from "lucide-react";
import Image from "next/image";

import { FileUploadDialog } from "@/components/shared/file-upload-dialog";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveBranding, uploadBrandingImage } from "@/features/report-cards/actions";
import { isUuid } from "@/lib/utils/search-params";

const IMAGES = [
  { slot: "logo", label: "Logo", key: "logo_path" },
  { slot: "stamp", label: "Cachet", key: "stamp_path" },
  { slot: "signature", label: "Signature du chef d'établissement", key: "signature_path" },
] as const;

type Branding = {
  header_text: string | null;
  footer_text: string | null;
  signatory_name: string | null;
  signatory_title: string | null;
  logo_path: string | null;
  stamp_path: string | null;
  signature_path: string | null;
} | null;

/** Logo, cachet, signature, signataire, en-tête et pied de page des documents officiels. */
export function BrandingAssets({ branding, canEdit }: { branding: Branding; canEdit: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <CardTitle>Identité des documents officiels</CardTitle>
          <CardDescription>Logo, cachet, signature et signataire utilisés sur les bulletins, certificats, reçus et factures.</CardDescription>
        </div>
        {canEdit ? (
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
        <div className="grid content-start gap-1 text-sm">
          <span className="text-muted-foreground">Signataire</span>
          <strong>{branding?.signatory_name ?? "—"}</strong>
          <span className="text-muted-foreground">{branding?.signatory_title ?? ""}</span>
          <span className="mt-2 text-muted-foreground">En-tête</span>
          <span>{branding?.header_text ?? "—"}</span>
          <span className="mt-2 text-muted-foreground">Pied de page</span>
          <span>{branding?.footer_text ?? "—"}</span>
        </div>
        {IMAGES.map((image) => {
          const fileId = branding?.[image.key];
          return (
            <div key={image.slot} className="grid content-start justify-items-start gap-2 text-sm">
              <span className="text-muted-foreground">{image.label}</span>
              {fileId && isUuid(fileId) ? (
                <Image src={`/api/fichiers/${fileId}`} alt={image.label} width={120} height={80} unoptimized className="h-16 w-auto rounded border border-border bg-white object-contain p-1" />
              ) : (
                <span className="text-xs text-muted-foreground">Aucune image</span>
              )}
              {canEdit ? (
                <FileUploadDialog
                  title={image.label}
                  description="PNG (fond transparent conseillé) ou JPEG, 5 Mo maximum."
                  action={uploadBrandingImage}
                  fields={{ slot: image.slot }}
                  trigger={
                    <Button variant="ghost" size="sm">
                      <ImageUp aria-hidden /> {fileId ? "Remplacer" : "Ajouter"}
                    </Button>
                  }
                />
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
