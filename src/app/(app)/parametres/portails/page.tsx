import { ArrowRight, ExternalLink, FileDown, KeyRound, Link2, ShieldCheck, Share2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PORTALS, type PortalKind } from "@/features/auth/portals";
import { CopyLinkButton, PortalLinkShare } from "@/features/organization/components/portal-link-share";
import { requirePermission } from "@/lib/auth/guards";
import { qrDataUrl } from "@/lib/pdf/qr";
import { portalLinkUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lien des portails" };

type Counts = { parents: number; students: number; teachers: number; staff: number };

/**
 * Lien unique et partageable de l'établissement : portails Parent,
 * Enseignant / Formateur, Élève / Étudiant. Chacun s'y connecte avec ses
 * identifiants personnels ; seuls les comptes de l'établissement sont acceptés.
 */
export default async function PortalLinkSettingsPage() {
  const context = await requirePermission("settings.manage");
  const org = context.organization;
  const supabase = await createClient();
  const url = await portalLinkUrl(org.code);
  const [{ data: counts }, qr] = await Promise.all([
    supabase.rpc("portal_account_counts", { p_org: org.id }),
    qrDataUrl(url, "#0B1F3A"),
  ]);
  const c = (counts ?? { parents: 0, students: 0, teachers: 0, staff: 0 }) as Counts;
  const local = /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url);
  const rows: { kind: PortalKind; accounts: number; noun: string }[] = [
    { kind: "parent", accounts: c.parents, noun: "parent(s) avec accès" },
    { kind: "enseignant", accounts: c.teachers, noun: "enseignant(s) / formateur(s)" },
    { kind: "eleve", accounts: c.students, noun: "compte(s) élève / étudiant" },
    { kind: "personnel", accounts: c.staff, noun: "compte(s) du personnel" },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Lien des portails"
        description={`Un seul lien pour ${org.short_name || org.name} : parents, enseignants / formateurs et élèves / étudiants s'y connectent chacun avec leurs informations personnelles.`}
        actions={
          <>
            <Button asChild variant="secondary">
              <a href="/api/documents/affiche-portails" target="_blank" rel="noreferrer">
                <FileDown aria-hidden /> Affiche à imprimer (PDF)
              </a>
            </Button>
            <Button asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden /> Voir la page
              </a>
            </Button>
          </>
        }
      />

      {local ? (
        <Alert tone="warning" title="Adresse locale">
          Ce lien utilise l&apos;adresse de cet ordinateur ({new URL(url).host}) : il ne fonctionne que sur ce poste ou ce réseau. Une fois NéoScol
          en ligne (adresse définie par NEXT_PUBLIC_SITE_URL), le lien affiché ici devient partageable partout.
        </Alert>
      ) : null}

      <Card className="anim-fade-up overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="size-5 text-primary" aria-hidden /> Lien unique de l&apos;établissement
          </CardTitle>
          <CardDescription>À envoyer aux familles, aux enseignants et aux élèves, ou à publier sur votre site et vos réseaux.</CardDescription>
        </CardHeader>
        <CardContent>
          <PortalLinkShare url={url} organizationName={org.name} qr={qr} fileCode={org.code} />
        </CardContent>
      </Card>

      <Card className="anim-fade-up" style={{ "--delay": "120ms" } as React.CSSProperties}>
        <CardHeader>
          <CardTitle>Liens directs par portail</CardTitle>
          <CardDescription>Ouvrent directement le formulaire de connexion du portail concerné.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="stagger grid gap-2.5">
            {rows.map(({ kind, accounts, noun }) => {
              const { label, sub, method, icon: Icon } = PORTALS[kind];
              const direct = `${url}?portail=${kind}`;
              return (
                <li key={kind} className="flex flex-col gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-surface-muted/50 md:flex-row md:items-center">
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="grid min-w-0 gap-0.5">
                      <span className="flex flex-wrap items-center gap-2 font-semibold">
                        {label}
                        <Badge tone={accounts > 0 ? "success" : "neutral"}>
                          {accounts} {noun}
                        </Badge>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {sub} · {method}
                      </span>
                      <span className="truncate font-mono text-xs text-primary">{direct}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <CopyLinkButton text={direct} size="sm" />
                    <Button asChild size="sm" variant="secondary">
                      <a href={direct} target="_blank" rel="noreferrer">
                        <ExternalLink aria-hidden /> Ouvrir
                      </a>
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card className="anim-fade-up" style={{ "--delay": "200ms" } as React.CSSProperties}>
        <CardHeader>
          <CardTitle>Comment ça fonctionne</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-3">
          {[
            { icon: Share2, title: "1. Partagez le lien", text: "Par WhatsApp, SMS, e-mail, sur l'affiche imprimée (QR code) ou votre site." },
            { icon: KeyRound, title: "2. Chacun choisit son portail", text: "Et se connecte avec ses propres identifiants : téléphone + code SMS, matricule, e-mail ou mot de passe." },
            { icon: ShieldCheck, title: "3. Accès contrôlé", text: "Le serveur n'accepte que les comptes de cet établissement ayant le rôle du portail choisi. Tout refus est journalisé." },
          ].map((step) => (
            <div key={step.title} className="flex gap-3 rounded-xl border border-border p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <step.icon className="size-5" aria-hidden />
              </span>
              <span className="grid gap-0.5">
                <span className="font-semibold">{step.title}</span>
                <span className="text-muted-foreground">{step.text}</span>
              </span>
            </div>
          ))}
          <p className="text-muted-foreground md:col-span-3">
            Les comptes sont créés par l&apos;établissement : accès portail des parents depuis leur fiche, comptes élèves depuis le dossier, comptes du
            personnel depuis{" "}
            <Link href="/utilisateurs" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
              Utilisateurs <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
