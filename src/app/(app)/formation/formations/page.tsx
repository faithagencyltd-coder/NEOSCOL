import { Hammer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { saveFormation } from "@/features/training/actions";
import { sessionState } from "@/features/training/config";
import { formationFields } from "@/features/training/fields";
import { requireTraining } from "@/features/training/guard";
import { listFormations } from "@/features/training/queries";
import { can } from "@/lib/auth/session";
import { todayIn } from "@/lib/dates";
import { formatMoney } from "@/lib/utils/format";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Formations" };

export default async function FormationsPage({ searchParams }: PageProps<"/formation/formations">) {
  const context = await requireTraining("academic.read");
  const organization = context.organization;
  const params = await searchParams;
  const today = todayIn(organization.timezone);
  const formations = await listFormations(organization.id);
  const manage = can(context, "academic.manage");
  const showInactive = param(params, "toutes") === "1";
  const visible = showInactive ? formations : formations.filter((f) => f.is_active);

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Formations"
        description="Le centre définit librement ses formations : durée, programme, coût, niveau, conditions d'admission et certificat délivré."
        actions={
          <>
            <Link href={showInactive ? "/formation/formations" : "/formation/formations?toutes=1"} className="text-sm font-medium text-primary hover:underline">
              {showInactive ? "Masquer les formations désactivées" : "Afficher aussi les formations désactivées"}
            </Link>
            {manage ? <QuickFormDialog title="Nouvelle formation" triggerLabel="Nouvelle formation" action={saveFormation} fields={formationFields()} submitLabel="Créer la formation" /> : null}
          </>
        }
      />
      {param(params, "supprime") ? <Alert tone="success">Formation supprimée.</Alert> : null}
      {visible.length === 0 ? (
        <Card>
          <EmptyState icon={Hammer} title="Aucune formation" description="Créez votre première formation : aucune liste de métiers n'est imposée." />
        </Card>
      ) : (
        <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((f) => {
            const sessions = (f.sessions ?? []).filter((s) => !s.archived_at);
            const ongoing = sessions.filter((s) => sessionState(s, today).key === "ongoing").length;
            return (
              <Link key={f.id} href={`/formation/formations/${f.id}`} className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                <Card interactive className="grid h-full gap-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid gap-0.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{f.code}</span>
                      <span className="text-lg font-semibold group-hover:text-primary">{f.name}</span>
                    </div>
                    {f.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Désactivée</Badge>}
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Durée</dt>
                      <dd className="font-medium">{f.duration_label ?? (f.duration_hours ? `${f.duration_hours} h` : "—")}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Coût</dt>
                      <dd className="font-medium">{f.tuition_amount != null ? formatMoney(Number(f.tuition_amount), organization.currency) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Niveau</dt>
                      <dd className="font-medium">{f.training_level ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Sessions</dt>
                      <dd className="font-medium">
                        {sessions.length} {ongoing ? <Badge tone="primary">{ongoing} en cours</Badge> : null}
                      </dd>
                    </div>
                  </dl>
                  {f.certificate_title ? <p className="text-xs text-muted-foreground">Délivre : {f.certificate_title}</p> : null}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
