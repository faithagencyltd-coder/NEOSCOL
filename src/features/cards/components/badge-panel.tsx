import { Ban, Download, FileDown, IdCard, Pencil, Printer, RefreshCcw } from "lucide-react";
import Link from "next/link";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils/format";

import { regenerateCardQr, revokeCard } from "../actions";
import type { CardData, CardDesign } from "../design";
import type { CardBadge } from "../server";
import { IssueCardButton, ValidityForm } from "./card-forms";
import { StudentCard3D } from "./student-card-3d";

/**
 * Onglet « Badge & QR » du dossier : carte 3D (recto / verso), impression,
 * PDF, image, état du badge, régénération du QR, désactivation, validité.
 */
export function BadgePanel({
  studentId,
  card,
  design,
  badge,
  holder,
  canManage,
  canEdit,
  active,
  timezone,
}: {
  studentId: string;
  card: CardData;
  design: CardDesign;
  badge: CardBadge | null;
  /** « l'élève », « l'apprenant(e) », « l'étudiant(e) » */
  holder: string;
  canManage: boolean;
  canEdit: boolean;
  active: boolean;
  timezone: string;
}) {
  const printed = badge ? badge.printed_count > 0 : false;
  const base = `/api/cartes/${studentId}`;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid gap-4">
        <Card className="grid gap-4 bg-gradient-to-b from-amber-50/40 to-muted/40 p-4 sm:p-8 dark:from-transparent">
          <StudentCard3D card={card} design={design} />
        </Card>
        {badge ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Button asChild variant="secondary">
              <a href={`${base}/pdf`} target="_blank" rel="noreferrer">
                <Printer aria-hidden /> Imprimer
              </a>
            </Button>
            <Button asChild variant="secondary">
              <a href={`${base}/pdf?telecharger=1`}>
                <FileDown aria-hidden /> Générer PDF
              </a>
            </Button>
            <Button asChild variant="secondary">
              <a href={`${base}/image`}>
                <Download aria-hidden /> Télécharger
              </a>
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid content-start gap-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">État du badge</CardTitle>
            {badge ? <Badge tone={printed ? "success" : "info"}>{printed ? "Imprimé" : "Généré"}</Badge> : <Badge>Non généré</Badge>}
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {badge ? (
              <>
                <dl className="grid gap-2">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Carte n°</dt>
                    <dd className="font-mono text-xs font-semibold">{badge.number}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Générée le</dt>
                    <dd className="text-right font-medium">{formatDateTime(badge.issued_at, "fr-FR", timezone)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Imprimée / exportée le</dt>
                    <dd className="text-right font-medium">{badge.last_printed_at ? formatDateTime(badge.last_printed_at, "fr-FR", timezone) : "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">QR code</dt>
                    <dd className="font-medium text-success">Actif à la tablette</dd>
                  </div>
                </dl>
                {canManage ? (
                  <div className="grid gap-2">
                    <ConfirmAction
                      trigger={
                        <Button variant="secondary" className="w-full">
                          <RefreshCcw aria-hidden /> Régénérer le QR code
                        </Button>
                      }
                      title="Régénérer le QR code ?"
                      description="L'ancienne carte est désactivée immédiatement et ne scanne plus. Une nouvelle carte avec un nouveau QR code est émise ; l'historique est conservé."
                      confirmLabel="Régénérer"
                      action={regenerateCardQr}
                      fields={{ student_id: studentId }}
                      reason={{ label: "Motif (facultatif)", required: false }}
                    />
                    <ConfirmAction
                      trigger={
                        <Button variant="ghost" className="w-full text-danger">
                          <Ban aria-hidden /> Désactiver (badge perdu / volé)
                        </Button>
                      }
                      title="Désactiver la carte ?"
                      description="La carte ne pourra plus être scannée. Vous pourrez en générer une nouvelle."
                      confirmLabel="Désactiver"
                      tone="danger"
                      action={revokeCard}
                      fields={{ student_id: studentId }}
                      reason={{ label: "Motif", required: true }}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState
                icon={IdCard}
                title="Aucune carte active"
                description={active ? `Générez la carte pour que ${holder} puisse la présenter et scanner.` : `${holder.charAt(0).toUpperCase()}${holder.slice(1)} n'est pas actif : aucune carte ne peut être émise.`}
                action={canManage && active ? <IssueCardButton studentId={studentId} /> : undefined}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Validité</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ValidityForm studentId={studentId} value={badge?.valid_until ?? null} yearLabel={card.validity && !badge?.valid_until ? card.validity : "Fin de l'année en cours"} disabled={!badge || !canManage} />
          </CardContent>
        </Card>

        {canEdit ? (
          <Button asChild variant="secondary">
            <Link href={`/eleves/${studentId}/modifier`}>
              <Pencil aria-hidden /> Modifier les informations
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
