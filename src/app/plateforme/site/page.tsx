import { ExternalLink, FileText, HelpCircle, Palette, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TRIAL_DAYS } from "@/features/billing/constants";
import { BrandForm, ContactsForm, FaqEditor, LegalForm } from "@/features/platform/components/site-forms";
import { defaultFaq } from "@/features/site/faq";
import { getSiteSettings } from "@/lib/site-settings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Site et marque — Plateforme" };

const SECTIONS = [
  { id: "coordonnees", title: "Coordonnées", description: "Affichées sur les pages publiques (tarifs, aide) : WhatsApp, e-mail, téléphone, adresse, horaires.", icon: Phone },
  { id: "faq", title: "Questions fréquentes", description: "Affichées sur les pages Tarifs et Aide. Sans liste, les questions d'origine sont utilisées.", icon: HelpCircle },
  { id: "textes", title: "Conditions générales et confidentialité", description: "Textes publiés sur /conditions et /confidentialite. Tant qu'un texte est vide, la page indique qu'il sera publié prochainement.", icon: FileText },
  { id: "marque", title: "Couleur et logo", description: "Appliqués à toute la plateforme (thème clair). Une couleur trop claire pour du texte blanc est refusée.", icon: Palette },
] as const;

/** Réglages publics de la plateforme : coordonnées, questions fréquentes, textes juridiques, couleur et logo. */
export default async function PlatformSitePage() {
  // Valeurs lues directement en base (jamais la copie en cache) pour modifier la dernière version.
  const supabase = await createClient();
  const { data: row } = await supabase.from("platform_site_settings").select("*").eq("id", 1).single();
  const site = {
    ...(await getSiteSettings()),
    ...(row ?? {}),
    faq: Array.isArray(row?.faq) ? (row.faq as { q: string; a: string }[]) : [],
    logo_url: row?.logo_path ? supabase.storage.from("platform-assets").getPublicUrl(row.logo_path).data.publicUrl : null,
  };
  return (
    <div className="grid gap-6 [&>*]:min-w-0">
      <nav aria-label="Pages publiques" className="flex flex-wrap gap-2 text-sm">
        {[
          ["/aide", "Voir la page Aide"],
          ["/tarifs", "Voir la page Tarifs"],
          ["/conditions", "Voir les conditions"],
          ["/confidentialite", "Voir la confidentialité"],
        ].map(([href, label]) => (
          <Link key={href} href={href!} target="_blank" className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 font-medium hover:border-primary">
            {label} <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        ))}
      </nav>
      {SECTIONS.map((section) => (
        <Card key={section.id} id={section.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <section.icon className="size-5 text-primary" aria-hidden /> {section.title}
            </CardTitle>
            <CardDescription>{section.description}</CardDescription>
          </CardHeader>
          <CardContent>
            {section.id === "coordonnees" ? <ContactsForm site={site} /> : null}
            {section.id === "faq" ? <FaqEditor site={site} defaults={defaultFaq(TRIAL_DAYS)} /> : null}
            {section.id === "textes" ? <LegalForm site={site} /> : null}
            {section.id === "marque" ? <BrandForm site={site} /> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
