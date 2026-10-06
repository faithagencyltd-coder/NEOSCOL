import { Download, FileLock2, Scale, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { savePrivacyRequest } from "@/features/platform/team-actions";
import { canWritePlatform, getPlatformRole } from "@/lib/auth/platform";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Confidentialité — Plateforme" };

const TYPES: Record<string, string> = {
  access: "Accès à ses données",
  rectification: "Rectification",
  deletion: "Suppression",
  export: "Portabilité (copie)",
  opposition: "Opposition",
  other: "Autre",
};
const STATUSES: Record<string, { label: string; tone: "info" | "warning" | "success" | "neutral" }> = {
  received: { label: "Reçue", tone: "info" },
  in_progress: { label: "En cours", tone: "warning" },
  completed: { label: "Traitée", tone: "success" },
  rejected: { label: "Refusée (motivée)", tone: "neutral" },
};
const opts = (m: Record<string, string | { label: string }>) => Object.entries(m).map(([value, v]) => ({ value, label: typeof v === "string" ? v : v.label }));

/** Confidentialité : registre des demandes des personnes, export des données d'un établissement, règles de conservation. */
export default async function PlatformPrivacyPage() {
  const supabase = await createClient();
  const [{ data: requests }, { data: orgs }, role] = await Promise.all([
    supabase.from("privacy_requests").select("*, organization:organizations(name)").order("created_at", { ascending: false }).limit(200),
    supabase.from("organizations").select("id, name").order("name"),
    getPlatformRole(),
  ]);
  const writable = canWritePlatform(role);
  const today = new Date().toISOString().slice(0, 10);
  const orgOptions = (orgs ?? []).map((o) => ({ value: o.id, label: o.name }));

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-2xl font-bold">Confidentialité et protection des données</h2>
          <p className="text-sm text-muted-foreground">Demandes des personnes (parents, élèves, personnel), export des données d&apos;un établissement et règles de conservation.</p>
        </div>
        {writable ? (
          <QuickFormDialog
            title="Enregistrer une demande"
            description="Demande reçue par e-mail, courrier ou téléphone. Échéance : 30 jours."
            triggerLabel="Nouvelle demande"
            action={savePrivacyRequest}
            fields={[
              { name: "requester_name", label: "Nom du demandeur", type: "text", required: true },
              { name: "requester_email", label: "E-mail du demandeur", type: "text" },
              { name: "request_type", label: "Type de demande", type: "select", required: true, options: opts(TYPES), defaultValue: "access" },
              { name: "organization_id", label: "Établissement concerné", type: "select", options: orgOptions },
              { name: "details", label: "Détails", type: "textarea", required: true, wide: true },
            ]}
          />
        ) : null}
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="size-5 text-primary" aria-hidden /> Registre des demandes
          </CardTitle>
          <CardDescription>Une demande non traitée après 30 jours est signalée en rouge.</CardDescription>
        </CardHeader>
        {(requests ?? []).length === 0 ? (
          <CardContent>
            <EmptyState icon={Scale} title="Aucune demande enregistrée" />
          </CardContent>
        ) : (
          <Table data-testid="privacy-list">
            <THead>
              <tr className="border-t border-border">
                <TH>N°</TH>
                <TH>Demandeur</TH>
                <TH>Type</TH>
                <TH>Échéance</TH>
                <TH>État</TH>
                {writable ? <TH /> : null}
              </tr>
            </THead>
            <tbody>
              {(requests ?? []).map((r) => {
                const late = r.due_at < today && !["completed", "rejected"].includes(r.status);
                return (
                  <TR key={r.id}>
                    <TD className="tabular-nums">{r.number}</TD>
                    <TD>
                      <span className="grid text-sm">
                        <span className="font-medium">{r.requester_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {r.requester_email ?? "—"} · {(r.organization as { name: string } | null)?.name ?? "établissement non précisé"}
                        </span>
                        <span className="line-clamp-2 text-xs text-muted-foreground">{r.details}</span>
                      </span>
                    </TD>
                    <TD className="text-sm">{TYPES[r.request_type]}</TD>
                    <TD className={`text-sm ${late ? "font-semibold text-danger" : ""}`}>
                      {formatDate(r.due_at)}
                      {late ? " (dépassée)" : ""}
                    </TD>
                    <TD>
                      <Badge tone={STATUSES[r.status]?.tone}>{STATUSES[r.status]?.label}</Badge>
                    </TD>
                    {writable ? (
                      <TD>
                        <QuickFormDialog
                          title={`Demande n° ${r.number}`}
                          description={r.details}
                          trigger={
                            <Button size="sm" variant="secondary">
                              Traiter
                            </Button>
                          }
                          action={savePrivacyRequest}
                          hidden={{ id: r.id, requester_name: r.requester_name, request_type: r.request_type, details: r.details }}
                          fields={[
                            { name: "status", label: "État", type: "select", required: true, options: opts(STATUSES), defaultValue: r.status },
                            { name: "response", label: "Réponse apportée / motif d'un refus", type: "textarea", wide: true, defaultValue: r.response ?? "" },
                          ]}
                        />
                      </TD>
                    ) : null}
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileLock2 className="size-5 text-primary" aria-hidden /> Export des données d&apos;un établissement
            </CardTitle>
            <CardDescription>Portabilité ou fin de contrat : un fichier JSON avec toutes les données de l&apos;établissement, sans aucune clé, aucun jeton ni mot de passe.</CardDescription>
          </CardHeader>
          <CardContent>
            {role === "owner" ? (
              <form method="post" action="/plateforme/confidentialite/export" className="grid gap-3" data-testid="org-export-form">
                <label className="grid gap-1 text-sm font-medium">
                  Établissement
                  <Select name="organization_id" required defaultValue="">
                    <option value="" disabled>
                      Choisir…
                    </option>
                    {orgOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Motif (journal)
                  <Input name="reason" required minLength={5} maxLength={500} placeholder="ex. demande écrite de la direction du 12/10" />
                </label>
                <div>
                  <Button type="submit">
                    <Download aria-hidden /> Exporter
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">Réservé aux propriétaires de la plateforme.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" aria-hidden /> Conservation et protections
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1.5 text-sm">
              <li>• Données de chaque établissement strictement séparées (contrôle dans la base sur chaque table).</li>
              <li>• Journal des actions inaltérable, sans mot de passe ni clé.</li>
              <li>• Mesure d&apos;audience du site : sans cookie, empreinte jetable quotidienne, supprimée après 13 mois.</li>
              <li>• Tentatives de connexion : identifiants et adresses enregistrés sous forme hachée uniquement.</li>
              <li>• Clés des fournisseurs chiffrées, jamais réaffichées.</li>
              <li>• Aucun accès de la plateforme « à la place » d&apos;un utilisateur ; la fiche établissement ne montre aucune donnée d&apos;élève.</li>
              <li>• Suppression de données : jamais automatique, décidée au cas par cas avec l&apos;établissement (registre ci-dessus).</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
