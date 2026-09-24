import { ArrowRight, Lock, MapPin, SearchX, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PortalGateway } from "@/features/auth/components/portal-gateway";
import { isPortalKind, normalizeOrgCode } from "@/features/auth/portals";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ORGANIZATION_TYPE_LABELS } from "@/lib/vocabulary";

async function loadOrganization(raw: string) {
  const code = normalizeOrgCode(decodeURIComponent(raw));
  if (!code) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("organization_portal", { p_code: code });
  return data?.[0] ?? null;
}

export async function generateMetadata({ params }: PageProps<"/acces/[code]">): Promise<Metadata> {
  const org = await loadOrganization((await params).code);
  return { title: org ? `${org.short_name || org.name} — Portails` : "Lien des portails", robots: { index: false } };
}

/**
 * Lien unique et partageable d'un établissement : portails Parent,
 * Enseignant / Formateur, Élève / Étudiant (et administration). Chacun se
 * connecte avec ses propres identifiants ; l'appartenance à l'établissement et
 * le rôle correspondant au portail sont vérifiés côté serveur.
 */
export default async function PortalLinkPage({ params, searchParams }: PageProps<"/acces/[code]">) {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const org = await loadOrganization(code);

  if (!org) {
    return (
      <div className="grid justify-items-center gap-4 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
          <SearchX className="size-7" aria-hidden />
        </span>
        <div className="grid gap-1">
          <h1 className="text-xl font-bold text-[#0b1f4d] dark:text-white">Lien d&apos;accès introuvable</h1>
          <p className="text-sm text-muted-foreground">
            Aucun établissement actif ne correspond à ce lien. Vérifiez l&apos;adresse reçue ou demandez-la à votre établissement.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/connexion">Page de connexion NéoScol</Link>
        </Button>
      </div>
    );
  }

  const portail = typeof query.portail === "string" && isPortalKind(query.portail) ? query.portail : null;
  const next = typeof query.suite === "string" ? query.suite : undefined;
  const context = await getSessionContext();
  const signedIn = context?.organizations.some((o) => o.id === org.id) ?? false;
  const initials = (org.short_name || org.name)
    .split(/\s+/)
    .filter((w) => /^[A-Za-zÀ-ÿ0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <div className="grid gap-6">
      <div className="anim-fade-up flex items-center gap-4">
        {org.has_logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo servi par une route dynamique
          <img src={`/acces/${org.code}/logo`} alt={`Logo ${org.name}`} className="size-16 shrink-0 rounded-2xl bg-white object-contain p-1.5 shadow-md ring-1 ring-border" />
        ) : (
          <span
            className="flex size-16 shrink-0 items-center justify-center rounded-2xl font-display text-xl font-bold text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${org.primary_color}, ${org.secondary_color})` }}
            aria-hidden
          >
            {initials}
          </span>
        )}
        <div className="grid min-w-0 gap-0.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Espace de connexion</p>
          <h1 className="text-xl font-bold leading-tight text-[#0b1f4d] sm:text-2xl dark:text-white">{org.name}</h1>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>{ORGANIZATION_TYPE_LABELS[org.type] ?? org.type}</span>
            {org.city ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" aria-hidden /> {org.city}
              </span>
            ) : null}
            <span className="rounded-full bg-primary-soft px-2 py-0.5 font-mono font-semibold text-primary">{org.code}</span>
          </p>
        </div>
      </div>

      {org.is_demo ? (
        <Alert tone="info">Établissement de démonstration : les données affichées sont fictives.</Alert>
      ) : null}

      {signedIn ? (
        <Alert tone="success" title="Vous êtes déjà connecté(e)">
          <span className="flex flex-wrap items-center justify-between gap-2">
            Votre session est ouverte pour cet établissement.
            <Link href="/tableau-de-bord" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
              Accéder à mon espace <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </span>
        </Alert>
      ) : null}

      <PortalGateway code={org.code} initial={portail} next={next} accent={org.primary_color} />

      <div className="grid grid-cols-2 gap-3 border-t border-border/70 pt-5 text-xs">
        <p className="flex items-start gap-2.5">
          <ShieldCheck className="size-7 shrink-0 text-primary" aria-hidden />
          <span className="grid">
            <span className="font-semibold text-[#0b1f4d] dark:text-white">Identifiants personnels</span>
            <span className="text-muted-foreground">Chacun se connecte avec ses propres informations</span>
          </span>
        </p>
        <p className="flex items-start gap-2.5">
          <Lock className="size-7 shrink-0 text-primary" aria-hidden />
          <span className="grid">
            <span className="font-semibold text-[#0b1f4d] dark:text-white">Accès contrôlé</span>
            <span className="text-muted-foreground">Réservé aux comptes de cet établissement</span>
          </span>
        </p>
      </div>
    </div>
  );
}
