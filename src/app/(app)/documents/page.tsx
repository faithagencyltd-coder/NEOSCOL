import {
  CreditCard,
  FileBadge,
  FileCog,
  FileSpreadsheet,
  FileCheck2,
  FileSignature,
  FileStack,
  FileText,
  IdCard,
  Lock,
  Receipt,
  ReceiptText,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { LinkSelect } from "@/components/shared/link-select";
import { PageHeader } from "@/components/shared/page-header";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DossierDialog, WrittenDocumentDialog } from "@/features/documents/components/document-dialogs";
import { isTrainingOrg } from "@/features/training/config";
import { PdfPreviewDialog } from "@/features/documents/components/pdf-preview-dialog";
import { DOSSIER_SECTIONS, dossierOrder } from "@/features/documents/dossier";
import { listCustomTemplates } from "@/features/documents/queries";
import { DOCUMENT_KIND_LABELS } from "@/features/documents/types";
import { requireOrganization } from "@/lib/auth/guards";
import { can, canAny } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils/format";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Documents" };

type DocType = {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  href: string | null;
  allowed: boolean;
  missing?: string;
};

/**
 * Bibliothèque des documents officiels : chaque carte ouvre un aperçu ou génère
 * le PDF réel (contrôle des permissions et journalisation côté serveur).
 */
export default async function DocumentsPage({ searchParams }: PageProps<"/documents">) {
  const context = await requireOrganization();
  if (!canAny(context, ["documents.read", "documents.generate", "documents.dossier"])) notFound();
  const org = context.organization;
  const generate = can(context, "documents.generate");
  const finance = generate && can(context, "finance.read");
  const reports = generate && (can(context, "report_cards.manage") || can(context, "report_cards.publish"));
  const dossier = can(context, "documents.dossier") && generate;
  const supabase = await createClient();

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id, student:students!inner(id, first_name, last_name, matricule, photo_path, archived_at), class:classes(name), academic_year:academic_years!inner(is_current)")
    .eq("organization_id", org.id)
    .eq("status", "validated")
    .eq("academic_year.is_current", true)
    .is("student.archived_at", null);
  const students = (enrollments ?? [])
    .flatMap((e) => (e.student ? [{ ...e.student, enrollmentId: e.id, className: e.class?.name ?? "" }] : []))
    .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, "fr"));
  const requested = param(await searchParams, "eleve");
  const student = students.find((s) => s.id === requested) ?? students[0];

  const [{ data: invoices }, { data: payments }, { data: reportCards }, { data: issued }] = student
    ? await Promise.all([
        supabase.from("invoices").select("id, number").eq("organization_id", org.id).eq("student_id", student.id).neq("status", "draft").order("issued_on").limit(1),
        supabase.from("payments").select("id, number, paid_at").eq("organization_id", org.id).eq("student_id", student.id).eq("status", "completed").order("paid_at"),
        supabase.from("report_cards").select("id, period:academic_periods(name)").eq("organization_id", org.id).eq("student_id", student.id).order("created_at", { ascending: false }).limit(1),
        supabase.from("issued_documents").select("id, kind, number, issued_at, status").eq("organization_id", org.id).eq("student_id", student.id).order("issued_at", { ascending: false }).limit(8),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const customTemplates = generate ? await listCustomTemplates(org.id) : [];
  const firstPayment = payments?.[0];
  const lastPayment = payments?.at(-1);
  const card = reportCards?.[0];

  const types: DocType[] = student
    ? [
        { key: "fiche", title: "Fiche d'inscription", description: "Identité, scolarité, parents, pièces fournies.", icon: FileText, href: `/api/documents/inscriptions/${student.enrollmentId}`, allowed: generate },
        { key: "engagement", title: "Fiche d'engagement", description: "Engagement du parent / tuteur, signatures.", icon: FileSignature, href: `/api/documents/inscriptions/${student.enrollmentId}?type=engagement`, allowed: generate },
        { key: "recu-inscription", title: "Reçu d'inscription", description: "Premier versement (inscription + 1re tranche).", icon: ReceiptText, href: firstPayment ? `/api/documents/recus/${firstPayment.id}` : null, allowed: finance, missing: "Aucun paiement enregistré" },
        { key: "recu", title: "Reçu de paiement", description: "Dernier paiement, solde restant, QR de vérification.", icon: Receipt, href: lastPayment ? `/api/documents/recus/${lastPayment.id}` : null, allowed: finance, missing: "Aucun paiement enregistré" },
        { key: "facture", title: "Facture", description: "Lignes de frais, remises, échéancier.", icon: ScrollText, href: invoices?.[0] ? `/api/documents/factures/${invoices[0].id}` : null, allowed: finance, missing: "Aucune facture émise" },
        { key: "certificat", title: "Certificat de scolarité", description: "Modèle officiel, cachet et signature.", icon: FileBadge, href: `/api/documents/certificats/${student.id}`, allowed: generate },
        { key: "bulletin", title: "Bulletin", description: "Notes, moyennes, rang, appréciations.", icon: FileCheck2, href: card ? `/api/documents/bulletins/${card.id}` : null, allowed: reports, missing: "Bulletin non calculé" },
        { key: "releve", title: "Relevé de notes", description: "Moyennes de l'année par matière et par période.", icon: FileSpreadsheet, href: card ? `/api/documents/releves/${student.id}` : null, allowed: reports, missing: "Aucun bulletin" },
        { key: "carte", title: "Carte scolaire", description: "Format carte CR80 avec photo et QR.", icon: CreditCard, href: `/api/documents/cartes/${student.id}`, allowed: generate },
      ]
    : [];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Documents officiels"
        description="Aperçu et génération des documents PDF (QR de vérification, cachet, signature). Chaque émission est numérotée et tracée."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/documents/modeles">
                <FileCog aria-hidden /> Document Studio
              </Link>
            </Button>
            {can(context, "staff.read") ? (
              <Button asChild variant="secondary">
                <Link href="/personnel/badges">
                  <IdCard aria-hidden /> Badges du personnel
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      {!generate ? (
        <Alert tone="info" title="Consultation seule">
          Votre rôle ne permet pas de générer de documents officiels : les boutons de génération sont désactivés et le serveur refuse toute demande.
        </Alert>
      ) : null}
      {students.length === 0 ? (
        <Card>
          <EmptyState icon={FileStack} title="Aucun élève inscrit" description="Les documents se génèrent à partir des dossiers des élèves inscrits." />
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar name={`${student!.first_name} ${student!.last_name}`} photoId={student!.photo_path} className="size-12" />
              <div className="grid min-w-0">
                <span className="truncate font-semibold">
                  {student!.last_name} {student!.first_name}
                </span>
                <span className="text-sm text-muted-foreground">
                  {student!.matricule} · {student!.className}
                </span>
              </div>
            </div>
            <LinkSelect
              label="Choisir l'élève"
              className="w-full sm:w-80"
              value={student!.id}
              options={students.map((s) => ({ value: s.id, label: `${s.last_name} ${s.first_name} — ${s.className}`, href: `/documents?eleve=${s.id}` }))}
            />
          </Card>

          <section aria-label="Types de documents" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {types.map((t, i) => (
              <Card
                key={t.key}
                className="rise group grid content-between gap-4 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                style={{ "--delay": `${i * 35}ms` } as React.CSSProperties}
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0b2559] to-[#1d63ed] text-white shadow-sm transition-transform group-hover:scale-105">
                    <t.icon className="size-5" aria-hidden />
                  </span>
                  <div className="grid gap-0.5">
                    <h2 className="font-semibold leading-tight">{t.title}</h2>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  </div>
                </div>
                {!t.allowed ? (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Lock className="size-3.5" aria-hidden /> Non autorisé pour votre rôle
                  </p>
                ) : !t.href ? (
                  <p className="text-xs font-medium text-muted-foreground">{t.missing}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <PdfPreviewDialog href={t.href} title={`${t.title} — ${student!.first_name} ${student!.last_name}`} />
                    <Button asChild size="sm">
                      <a href={t.href} target="_blank" rel="noreferrer">
                        Générer PDF
                      </a>
                    </Button>
                  </div>
                )}
              </Card>
            ))}
            <Card className="rise grid content-between gap-4 p-4" style={{ "--delay": "300ms" } as React.CSSProperties}>
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0b2559] to-[#1d63ed] text-white">
                  <ScrollText className="size-5" aria-hidden />
                </span>
                <div className="grid gap-0.5">
                  <h2 className="font-semibold leading-tight">Autres documents</h2>
                  <p className="text-xs text-muted-foreground">Attestation, certificat de formation, convocation, contrat, modèles personnalisés.</p>
                </div>
              </div>
              {generate ? (
                <WrittenDocumentDialog
                  studentId={student!.id}
                  customTemplates={customTemplates}
                  training={isTrainingOrg(context.organization.type)}
                  trigger={
                    <Button size="sm">
                      <ScrollText aria-hidden /> Choisir et générer
                    </Button>
                  }
                />
              ) : (
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Lock className="size-3.5" aria-hidden /> Non autorisé pour votre rôle
                </p>
              )}
            </Card>
          </section>

          <Card className="overflow-hidden">
            <div className="grid gap-6 bg-gradient-to-br from-[#07142b] via-[#0b2559] to-[#0e4a9a] p-6 text-white lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="grid gap-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Dossier complet</p>
                <h2 className="text-2xl font-bold">Générer le dossier complet</h2>
                <p className="max-w-xl text-sm text-white/80">
                  Toutes les pièces de {student!.first_name} fusionnées en un seul PDF, dans l&apos;ordre choisi : fiche, engagement, factures, reçus,
                  certificats, bulletins et pièces jointes.
                </p>
                <div className="pt-1">
                  {dossier ? (
                    <DossierDialog
                      studentId={student!.id}
                      initialOrder={dossierOrder(null, (org.settings as { documents?: { dossier_sections?: unknown } } | null)?.documents?.dossier_sections)}
                      canSaveDefault={can(context, "settings.manage")}
                    />
                  ) : (
                    <Badge tone="neutral">Réservé à la direction et au secrétariat</Badge>
                  )}
                </div>
              </div>
              <ol aria-label="Pièces fusionnées" className="relative mx-auto h-56 w-56">
                {DOSSIER_SECTIONS.map((section, i) => (
                  <li
                    key={section.key}
                    className="absolute left-0 top-0 flex h-40 w-32 flex-col gap-1.5 rounded-lg border border-white/30 bg-white p-2.5 text-[9px] font-semibold text-[#0b2559] shadow-xl transition-transform duration-500 hover:-translate-y-2"
                    style={{ transform: `translate(${i * 14}px, ${i * 9}px) rotate(${(i - 3) * 2.5}deg)`, zIndex: i }}
                  >
                    {section.label}
                    <span className="h-1 w-3/4 rounded bg-[#e3e9f4]" />
                    <span className="h-1 w-full rounded bg-[#e3e9f4]" />
                    <span className="h-1 w-2/3 rounded bg-[#e3e9f4]" />
                  </li>
                ))}
              </ol>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documents déjà émis pour {student!.first_name}</CardTitle>
            </CardHeader>
            <CardContent>
              {(issued ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun document émis pour le moment.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {(issued ?? []).map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{DOCUMENT_KIND_LABELS[d.kind] ?? d.kind}</span>
                        <span className="text-muted-foreground"> · {d.number} · {formatDateTime(d.issued_at, "fr-FR", org.timezone)}</span>
                      </span>
                      {d.status === "revoked" ? <Badge tone="danger">Révoqué</Badge> : <Badge tone="success">Valide</Badge>}
                      {can(context, "documents.read") ? <PdfPreviewDialog href={`/api/documents/emis/${d.id}`} title={`${DOCUMENT_KIND_LABELS[d.kind] ?? d.kind} ${d.number}`} /> : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
