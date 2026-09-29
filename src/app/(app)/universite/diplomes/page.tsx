import { Award, FileText, ShieldOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { issueDiploma, revokeDiploma } from "@/features/university/actions";
import { UniversityHeader } from "@/features/university/components/university-header";
import { DIPLOMA_STATUS } from "@/features/university/config";
import { requireUniversity } from "@/features/university/guard";
import { diplomasList, studentOptions, universityStructure } from "@/features/university/queries";
import { can } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Diplômes" };

const KINDS: Record<string, string> = { diploma: "Diplôme", certificate: "Certificat", attestation: "Attestation de réussite" };

export default async function DiplomasPage() {
  const context = await requireUniversity(["diplomas.manage"]);
  const orgId = context.organization.id;
  const [rows, students, structure] = await Promise.all([diplomasList(orgId), studentOptions(orgId), universityStructure(orgId)]);
  const pdf = context.university.features.documents && can(context, "documents.generate");

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <UniversityHeader
        title="Diplômes"
        description="Délivrance numérotée automatiquement (type, filière, niveau, année, mention). Un diplôme délivré n'est jamais modifié ni supprimé : il peut seulement être révoqué, avec motif, et l'historique est conservé."
        actions={
          <QuickFormDialog
            title="Délivrer un diplôme"
            triggerLabel="Délivrer un diplôme"
            action={issueDiploma}
            fields={[
              { name: "student_id", label: "Étudiant", type: "select", required: true, options: students, wide: true },
              { name: "kind", label: "Type", type: "select", required: true, options: Object.entries(KINDS).map(([value, label]) => ({ value, label })), defaultValue: "diploma" },
              { name: "title", label: "Intitulé", required: true, placeholder: "Licence en Informatique" },
              { name: "program_id", label: "Filière", type: "select", options: structure.programs.map((p) => ({ value: p.id, label: p.name })) },
              { name: "level_id", label: "Niveau", type: "select", options: structure.levels.map((l) => ({ value: l.id, label: l.name })) },
              { name: "mention", label: "Mention", placeholder: "Assez bien, Bien…" },
              { name: "conferred_on", label: "Date d'obtention", type: "date" },
              { name: "year_label", label: "Année académique", hint: "Vide : année en cours." },
            ]}
          />
        }
      />
      <Card>
        {rows.length === 0 ? (
          <CardContent>
            <EmptyState icon={Award} title="Aucun diplôme délivré" />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Numéro</TH>
                <TH>Étudiant</TH>
                <TH>Diplôme</TH>
                <TH>Année / mention</TH>
                <TH>Délivré le</TH>
                <TH>Statut</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-sm">{r.number ?? "—"}</TD>
                  <TD>
                    <Link href={`/eleves/${r.student_id}?onglet=universite`} className="grid hover:text-primary">
                      <span className="font-medium">
                        {r.student?.last_name} {r.student?.first_name}
                      </span>
                      <span className="text-xs text-muted-foreground">{r.student?.matricule}</span>
                    </Link>
                  </TD>
                  <TD className="text-sm">
                    {r.title}
                    <span className="block text-xs text-muted-foreground">
                      {KINDS[r.kind] ?? r.kind}
                      {r.program?.name ? ` · ${r.program.name}` : ""}
                      {r.level?.name ? ` · ${r.level.name}` : ""}
                    </span>
                  </TD>
                  <TD className="text-sm">
                    {r.year_label ?? "—"}
                    {r.mention ? <span className="block text-xs text-muted-foreground">{r.mention}</span> : null}
                  </TD>
                  <TD className="text-sm">{r.issued_on ? formatDate(r.issued_on, "fr-FR", { dateStyle: "medium" }) : "—"}</TD>
                  <TD>
                    <StatusBadge value={r.status ?? "issued"} map={DIPLOMA_STATUS} />
                    {r.revoked_reason ? <span className="block text-xs text-muted-foreground">{r.revoked_reason}</span> : null}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap justify-end gap-1">
                      {pdf ? (
                        <Button asChild variant="ghost" size="sm">
                          <a href={`/api/documents/universite/diplome/${r.id}`} target="_blank" rel="noreferrer">
                            <FileText aria-hidden /> PDF
                          </a>
                        </Button>
                      ) : null}
                      {r.status !== "revoked" ? (
                        <ConfirmAction
                          trigger={
                            <Button variant="ghost" size="sm" className="text-danger">
                              <ShieldOff aria-hidden /> Révoquer
                            </Button>
                          }
                          title={`Révoquer le diplôme ${r.number ?? ""} ?`}
                          description="Le diplôme reste dans l'historique avec le statut « Révoqué » ; sa vérification en ligne l'indiquera."
                          confirmLabel="Révoquer"
                          tone="danger"
                          action={revokeDiploma}
                          fields={{ id: r.id }}
                          reason={{ label: "Motif", required: true }}
                        />
                      ) : null}
                    </div>
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
