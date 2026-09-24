import { FileCog, Palette, RotateCcw, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteTemplate } from "@/features/documents/actions";
import { TemplateEditor } from "@/features/documents/components/template-editor";
import { listTemplates } from "@/features/documents/queries";
import { isStandardLayout, TEMPLATE_DEFAULTS } from "@/features/documents/templates";
import { TEXT_DOCUMENT_KINDS } from "@/features/documents/types";
import { getBranding } from "@/features/report-cards/queries";
import { requireOrganization } from "@/lib/auth/guards";
import { can, canAny } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/utils/format";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Document Studio" };

type Layout = { title?: string; body?: string; closing?: string };

/** Document Studio : modèles des documents rédigés, propres à l'établissement. */
export default async function DocumentStudioPage() {
  const context = await requireOrganization();
  if (!canAny(context, ["documents.read", "documents.generate", "documents.templates.manage"])) notFound();
  const manage = can(context, "documents.templates.manage");
  const org = context.organization;
  const [templates, branding] = await Promise.all([listTemplates(org.id), getBranding(org.id)]);
  const organization = {
    name: org.name,
    type: org.type,
    color: branding?.secondary_color ?? "#0F172A",
    accent: branding?.primary_color ?? "#1D4ED8",
    logoId: branding?.logo_path && isUuid(branding.logo_path) ? branding.logo_path : null,
    header: branding?.header_text ?? null,
    footer: branding?.footer_text ?? null,
    signatory: branding?.signatory_name ?? null,
    signatoryTitle: branding?.signatory_title ?? null,
  };
  const initial = (t: (typeof templates)[number]) => {
    const layout = (t.layout ?? {}) as Layout;
    const d = TEMPLATE_DEFAULTS[t.kind as keyof typeof TEMPLATE_DEFAULTS];
    return { id: t.id, name: t.name, description: t.description ?? "", title: layout.title ?? d.title, body: layout.body ?? d.body, closing: layout.closing ?? d.closing };
  };
  const standard = TEXT_DOCUMENT_KINDS.filter((k) => k !== "custom");
  const custom = templates.filter((t) => t.kind === "custom");

  return (
    <div className="grid gap-5">
      <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
        <Link href="/documents" className="hover:text-primary">
          Documents
        </Link>{" "}
        / <span className="text-foreground">Document Studio</span>
      </nav>
      <PageHeader
        title="Document Studio"
        description="Textes des documents officiels de l'établissement. Les variables {{…}} sont remplacées à l'émission ; les documents déjà émis ne changent pas."
        actions={
          can(context, "settings.manage") ? (
            <Button asChild variant="secondary">
              <Link href="/parametres/etablissement">
                <Palette aria-hidden /> Logo, couleurs, cachet et signature
              </Link>
            </Button>
          ) : null
        }
      />

      <section aria-label="Documents standard" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {standard.map((kind, i) => {
          const d = TEMPLATE_DEFAULTS[kind];
          const found = templates.find((x) => x.kind === kind && x.is_default);
          const t = found && !isStandardLayout(found.layout, kind) ? found : undefined;
          return (
            <Card key={kind} interactive className="rise grid content-between gap-3 p-4" style={{ "--delay": `${i * 35}ms` } as React.CSSProperties}>
              <div className="grid gap-1">
                <h2 className="flex flex-wrap items-center gap-2 font-semibold">
                  {d.label}
                  {t ? <Badge tone="primary">Personnalisé</Badge> : <Badge>Texte standard</Badge>}
                </h2>
                <p className="text-xs text-muted-foreground">{d.description}</p>
                <p className="line-clamp-3 text-sm text-muted-foreground">{((t?.layout ?? {}) as Layout).body ?? d.body}</p>
                {t ? <p className="text-xs text-muted-foreground">Modifié le {formatDateTime(t.updated_at, "fr-FR", org.timezone)}</p> : null}
              </div>
              {manage ? (
                <div className="flex flex-wrap gap-2">
                  <TemplateEditor kind={kind} mode="edit" initial={t ? initial(t) : undefined} organization={organization} />
                  {t ? (
                    <ConfirmAction
                      trigger={
                        <Button variant="ghost" size="sm">
                          <RotateCcw aria-hidden /> Texte standard
                        </Button>
                      }
                      title={`Rétablir le texte standard — ${d.label} ?`}
                      description="Le modèle personnalisé est supprimé ; les documents déjà émis ne changent pas."
                      confirmLabel="Rétablir"
                      action={deleteTemplate}
                      fields={{ template_id: t.id }}
                    />
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })}
      </section>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div className="grid gap-1">
            <CardTitle>Modèles personnalisés</CardTitle>
            <p className="text-sm text-muted-foreground">Certificats et documents propres à l&apos;établissement (certificat de mérite, autorisation de sortie…).</p>
          </div>
          {manage ? <TemplateEditor kind="custom" mode="create" organization={organization} /> : null}
        </CardHeader>
        {custom.length === 0 ? (
          <EmptyState icon={FileCog} title="Aucun modèle personnalisé" description="Créez un modèle : il sera proposé à la délivrance depuis le dossier de l'élève." />
        ) : (
          <CardContent>
            <ul className="stagger divide-y divide-border">
              {custom.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="grid min-w-0 flex-1">
                    <span className="font-medium">{t.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{t.description || ((t.layout ?? {}) as Layout).title}</span>
                  </div>
                  {manage ? (
                    <span className="flex gap-2">
                      <TemplateEditor kind="custom" mode="edit" initial={initial(t)} organization={organization} />
                      <ConfirmAction
                        trigger={
                          <Button variant="ghost" size="sm" className="text-danger" aria-label={`Supprimer le modèle ${t.name}`}>
                            <Trash2 aria-hidden />
                          </Button>
                        }
                        title={`Supprimer le modèle « ${t.name} » ?`}
                        description="Il ne sera plus proposé ; les documents déjà émis restent valides."
                        confirmLabel="Supprimer"
                        tone="danger"
                        action={deleteTemplate}
                        fields={{ template_id: t.id }}
                      />
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
