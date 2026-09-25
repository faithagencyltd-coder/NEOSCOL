import { CalendarDays, Pencil, Power, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { DetailList } from "@/components/shared/detail-list";
import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { getRooms, getTeachers } from "@/features/academic/queries";
import { deleteFormation, saveCompetency, saveFormation, saveModule, saveSession, setCompetencyActive, setFormationActive } from "@/features/training/actions";
import { sessionState } from "@/features/training/config";
import { formationFields, sessionFields } from "@/features/training/fields";
import { requireTraining } from "@/features/training/guard";
import { getFormation, listSessions } from "@/features/training/queries";
import { can } from "@/lib/auth/session";
import { todayIn } from "@/lib/dates";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Formation" };

export default async function FormationPage({ params, searchParams }: PageProps<"/formation/formations/[id]">) {
  const context = await requireTraining("academic.read");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const organization = context.organization;
  const data = await getFormation(organization.id, id);
  if (!data) notFound();
  const { formation, competencies, modules } = data;
  const query = await searchParams;
  const today = todayIn(organization.timezone);
  const manage = can(context, "academic.manage");
  const [sessions, rooms, teachers] = await Promise.all([
    listSessions(organization.id, { formationId: id }),
    manage ? getRooms(organization.id) : Promise.resolve([]),
    manage && can(context, "staff.read") ? getTeachers(organization.id) : Promise.resolve([]),
  ]);
  const money = (n: number | null) => (n == null ? "—" : formatMoney(Number(n), organization.currency));

  return (
    <div className="grid min-w-0 gap-5 [&>*]:min-w-0">
      <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
        <Link href="/formation/formations" className="hover:text-primary">
          Formations
        </Link>{" "}
        / <span className="text-foreground">{formation.name}</span>
      </nav>
      {param(query, "cree") ? <Alert tone="success">Formation créée. Ajoutez maintenant ses modules, ses compétences et une première session.</Alert> : null}
      {!formation.is_active ? (
        <Alert tone="warning" title="Formation désactivée">
          Aucune nouvelle session ni inscription n&apos;est possible. L&apos;historique reste consultable.
        </Alert>
      ) : null}

      <Card className="anim-fade-up">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{formation.code}</span>
            <CardTitle className="text-2xl">{formation.name}</CardTitle>
            {formation.description ? <CardDescription>{formation.description}</CardDescription> : null}
          </div>
          {manage ? (
            <div className="flex flex-wrap gap-2">
              <QuickFormDialog
                title="Modifier la formation"
                action={saveFormation}
                fields={formationFields(formation)}
                hidden={{ formation_id: formation.id }}
                trigger={
                  <Button variant="secondary" size="sm">
                    <Pencil aria-hidden /> Modifier
                  </Button>
                }
              />
              <ConfirmAction
                trigger={
                  <Button variant="secondary" size="sm">
                    <Power aria-hidden /> {formation.is_active ? "Désactiver" : "Réactiver"}
                  </Button>
                }
                title={formation.is_active ? "Désactiver cette formation ?" : "Réactiver cette formation ?"}
                description={formation.is_active ? "Plus aucune session ni inscription ne pourra être créée. Rien n'est supprimé." : "La formation redevient disponible pour les sessions et inscriptions."}
                confirmLabel={formation.is_active ? "Désactiver" : "Réactiver"}
                action={setFormationActive}
                fields={{ formation_id: formation.id, active: formation.is_active ? "false" : "true" }}
              />
              {sessions.length === 0 ? (
                <ConfirmAction
                  trigger={
                    <Button variant="ghost" size="sm" className="text-danger">
                      <Trash2 aria-hidden /> Supprimer
                    </Button>
                  }
                  title="Supprimer définitivement cette formation ?"
                  description="Possible uniquement tant qu'aucune session ni inscription n'existe. Ses modules et compétences sont retirés."
                  confirmLabel="Supprimer"
                  tone="danger"
                  action={deleteFormation}
                  fields={{ formation_id: formation.id }}
                />
              ) : null}
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          <DetailList
            items={[
              { label: "Durée", value: [formation.duration_label, formation.duration_hours ? `${formation.duration_hours} heures` : null].filter(Boolean).join(" · ") },
              { label: "Niveau", value: formation.training_level },
              { label: "Coût de la formation", value: money(formation.tuition_amount) },
              { label: "Frais d'inscription", value: money(formation.registration_fee) },
              { label: "Échéances proposées", value: formation.default_installments ? `${formation.default_installments} versement(s)` : "Paiement intégral" },
              { label: "Certificat délivré", value: formation.certificate_title },
              { label: "Conditions d'admission", value: formation.admission_conditions },
              { label: "Programme", value: formation.syllabus },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="anim-fade-up">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>Sessions</CardTitle>
            <CardDescription>Dates, capacité, formateurs, groupes et apprenants de chaque session.</CardDescription>
          </div>
          {manage && formation.is_active ? (
            <QuickFormDialog
              title="Nouvelle session"
              triggerLabel="Nouvelle session"
              action={saveSession}
              fields={sessionFields({ formations: [], rooms, teachers }, { program_id: formation.id })}
              hidden={{ program_id: formation.id }}
              submitLabel="Créer la session"
            />
          ) : null}
        </CardHeader>
        {sessions.length === 0 ? (
          <EmptyState icon={CalendarDays} title="Aucune session" description="Ouvrez une session pour inscrire des apprenants." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Session</TH>
                <TH>Dates</TH>
                <TH>État</TH>
                <TH className="text-right">Apprenants</TH>
              </tr>
            </THead>
            <tbody>
              {sessions.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <Link href={`/formation/sessions/${s.id}`} className="font-medium hover:text-primary">
                      {s.name}
                    </Link>
                  </TD>
                  <TD className="text-sm tabular-nums">
                    {s.starts_on ? formatDate(s.starts_on, "fr-FR", { dateStyle: "short" }) : "—"} → {s.ends_on ? formatDate(s.ends_on, "fr-FR", { dateStyle: "short" }) : "—"}
                  </TD>
                  <TD>
                    <StatusBadge value={sessionState(s, today).key} map={{ [sessionState(s, today).key]: sessionState(s, today) }} />
                  </TD>
                  <TD className="text-right tabular-nums">
                    {s.headcount}
                    {s.capacity ? ` / ${s.capacity}` : ""}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card className="anim-fade-up">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="grid gap-1">
              <CardTitle>Modules (cours)</CardTitle>
              <CardDescription>Utilisés dans l&apos;emploi du temps, les évaluations et le relevé de notes.</CardDescription>
            </div>
            {manage ? (
              <QuickFormDialog
                title="Nouveau module"
                triggerLabel="Ajouter"
                action={saveModule}
                hidden={{ program_id: formation.id }}
                fields={[
                  { name: "name", label: "Intitulé", required: true, placeholder: "Traitement de texte", wide: true },
                  { name: "code", label: "Code", required: true, placeholder: "WORD" },
                ]}
              />
            ) : null}
          </CardHeader>
          <CardContent>
            {modules.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun module.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {modules.map((m) => (
                  <li key={m.id}>
                    <Badge tone={m.is_active ? "primary" : "neutral"}>
                      {m.name} · {m.code}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="anim-fade-up">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="grid gap-1">
              <CardTitle>Compétences visées</CardTitle>
              <CardDescription>Évaluées dans le dossier de chaque apprenant (fiche de compétences).</CardDescription>
            </div>
            {manage ? (
              <QuickFormDialog
                title="Nouvelle compétence"
                triggerLabel="Ajouter"
                action={saveCompetency}
                hidden={{ program_id: formation.id }}
                fields={[
                  { name: "name", label: "Compétence", required: true, placeholder: "Construire un tableau de calcul", wide: true },
                  { name: "sequence", label: "Ordre", type: "number", min: 0, defaultValue: String(competencies.length + 1) },
                  { name: "description", label: "Description", type: "textarea", wide: true },
                ]}
              />
            ) : null}
          </CardHeader>
          <CardContent>
            {competencies.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune compétence définie.</p>
            ) : (
              <ol className="grid gap-2">
                {competencies.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
                    <span className={c.is_active ? "text-sm" : "text-sm text-muted-foreground line-through"}>
                      {c.sequence}. {c.name}
                    </span>
                    {manage ? (
                      <ConfirmAction
                        trigger={
                          <Button variant="ghost" size="sm">
                            {c.is_active ? "Désactiver" : "Réactiver"}
                          </Button>
                        }
                        title={c.is_active ? "Désactiver cette compétence ?" : "Réactiver cette compétence ?"}
                        description="Les évaluations déjà saisies sont conservées."
                        confirmLabel={c.is_active ? "Désactiver" : "Réactiver"}
                        action={setCompetencyActive}
                        fields={{ competency_id: c.id, program_id: formation.id, active: c.is_active ? "false" : "true" }}
                      />
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
