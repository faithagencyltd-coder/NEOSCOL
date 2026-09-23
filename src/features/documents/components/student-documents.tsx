import { Ban, CreditCard, Download, FileBadge, FileSignature, FileSpreadsheet, FileText } from "lucide-react";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { revokeDocument } from "@/features/documents/actions";
import { DossierDialog, WrittenDocumentDialog } from "@/features/documents/components/document-dialogs";
import type { DossierSectionKey } from "@/features/documents/dossier";
import type { listStudentDocuments } from "@/features/documents/queries";
import { DOCUMENT_KIND_LABELS } from "@/features/documents/types";
import { ENROLLMENT_TYPE } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils/format";

type Enrollment = { id: string; reference: string; type: string; status: string; academic_year: { name: string } | null };

/** Onglet « Documents » du dossier élève : délivrance, réédition, révocation. */
export function StudentDocumentsTab({
  studentId,
  documents,
  enrollments,
  can,
  dossierOrder,
  timezone,
  customTemplates = [],
}: {
  studentId: string;
  documents: Awaited<ReturnType<typeof listStudentDocuments>>;
  enrollments: Enrollment[];
  can: { generate: boolean; dossier: boolean; revoke: boolean; saveDefault: boolean; transcript?: boolean };
  dossierOrder: DossierSectionKey[];
  timezone: string;
  customTemplates?: { id: string; name: string }[];
}) {
  const pdf = (href: string, label: string, Icon: typeof FileText) => (
    <Button asChild variant="secondary" size="sm">
      <a href={href} target="_blank" rel="noopener">
        <Icon aria-hidden /> {label}
      </a>
    </Button>
  );
  return (
    <div className="grid gap-5">
      {can.generate || can.dossier ? (
        <Card>
          <CardHeader>
            <CardTitle>Délivrer un document</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              {can.generate ? (
                <>
                  {pdf(`/api/documents/certificats/${studentId}`, "Certificat de scolarité", FileBadge)}
                  <WrittenDocumentDialog studentId={studentId} customTemplates={customTemplates} />
                  {pdf(`/api/documents/cartes/${studentId}`, "Carte scolaire", CreditCard)}
                  {can.transcript ? pdf(`/api/documents/releves/${studentId}`, "Relevé de notes", FileSpreadsheet) : null}
                </>
              ) : null}
              {can.dossier ? <DossierDialog studentId={studentId} initialOrder={dossierOrder} canSaveDefault={can.saveDefault} /> : null}
            </div>
            {can.generate && enrollments.length ? (
              <div className="grid gap-2">
                <p className="text-sm font-medium">Inscriptions</p>
                <ul className="grid gap-2">
                  {enrollments.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                      <span className="text-sm">
                        <strong>{e.reference}</strong> · {ENROLLMENT_TYPE[e.type] ?? e.type} · {e.academic_year?.name}
                      </span>
                      <span className="flex gap-2">
                        {pdf(`/api/documents/inscriptions/${e.id}`, "Fiche d'inscription", FileText)}
                        {pdf(`/api/documents/inscriptions/${e.id}?type=engagement`, "Engagement", FileSignature)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Documents émis</CardTitle>
        </CardHeader>
        {documents.length === 0 ? (
          <CardContent>
            <EmptyState icon={FileText} title="Aucun document émis" description="Chaque document délivré reçoit un numéro et un QR Code vérifiable." />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Numéro</TH>
                <TH>Document</TH>
                <TH>Émis le</TH>
                <TH>Statut</TH>
                <TH className="sr-only">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {documents.map((d) => (
                <TR key={d.id}>
                  <TD className="font-mono text-xs">{d.number}</TD>
                  <TD>
                    <span className="grid">
                      <span className="font-medium">{DOCUMENT_KIND_LABELS[d.kind] ?? d.kind}</span>
                      <span className="text-xs text-muted-foreground">{d.title}</span>
                    </span>
                  </TD>
                  <TD className="text-sm">{formatDateTime(d.issued_at, "fr-FR", timezone)}</TD>
                  <TD>
                    {d.status === "valid" ? (
                      <Badge tone="success">Valide</Badge>
                    ) : (
                      <Badge tone="danger" title={d.revoked_reason ?? undefined}>
                        Révoqué
                      </Badge>
                    )}
                  </TD>
                  <TD className="text-right">
                    <span className="inline-flex gap-1">
                      <Button asChild variant="ghost" size="sm" aria-label={`Ouvrir ${d.number}`}>
                        <a href={`/api/documents/emis/${d.id}`} target="_blank" rel="noopener">
                          <Download aria-hidden />
                        </a>
                      </Button>
                      {can.revoke && d.status === "valid" ? (
                        <ConfirmAction
                          trigger={
                            <Button variant="ghost" size="sm" className="text-danger" aria-label={`Révoquer ${d.number}`}>
                              <Ban aria-hidden />
                            </Button>
                          }
                          title={`Révoquer ${d.number} ?`}
                          description="Le document restera dans l'historique ; la vérification publique indiquera qu'il est révoqué."
                          confirmLabel="Révoquer"
                          tone="danger"
                          action={revokeDocument}
                          fields={{ document_id: d.id }}
                          reason={{ label: "Motif de la révocation", required: true }}
                        />
                      ) : null}
                    </span>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
