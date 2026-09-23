import { Download, FileCheck2, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { Card } from "@/components/ui/card";
import { DOCUMENT_KIND_LABELS } from "@/features/documents/types";
import { LockedFeature } from "@/features/portal/components/locked-feature";
import { requirePortal } from "@/features/portal/context";
import { getStudentIssuedDocuments } from "@/features/portal/queries";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Documents" };

/** Documents officiels émis par l'établissement (copie identique, QR de vérification). */
export default async function PortalDocumentsPage() {
  const { organization, parent, student, status } = await requirePortal();
  if (!student) return <EmptyState icon={FileCheck2} title="Aucun dossier rattaché" />;
  const header = (
    <div className="grid gap-1">
      <h1 className="text-xl font-bold">Documents</h1>
      <p className="text-sm text-muted-foreground">
        Documents officiels de {student.first_name} délivrés par l&apos;établissement ; chacun porte un QR code de vérification.
      </p>
    </div>
  );
  if (status?.features.documents) {
    return (
      <>
        {header}
        <LockedFeature feature="Documents" overdue={status.overdue_amount} currency={organization.currency} parent={parent} />
      </>
    );
  }
  const documents = await getStudentIssuedDocuments(organization.id, student.id);
  return (
    <>
      {header}
      {documents.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Aucun document disponible" description="Certificats, attestations et bulletins officiels apparaissent ici dès leur émission." />
      ) : (
        <div className="grid gap-3">
          {documents.map((d) => (
            <Card key={d.id} className="flex flex-wrap items-center gap-4 p-4">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <FileCheck2 className="size-5" aria-hidden />
              </span>
              <div className="grid min-w-0 flex-1 gap-0.5">
                <h2 className="truncate font-semibold">{DOCUMENT_KIND_LABELS[d.kind] ?? d.title}</h2>
                <p className="text-sm text-muted-foreground">
                  N° {d.number} · émis le {formatDate(d.issued_at)}
                </p>
              </div>
              <a
                href={`/api/documents/emis/${d.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
              >
                <Download className="size-4" aria-hidden /> PDF
              </a>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
