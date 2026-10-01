import { ExternalLink, Flag as FlagIcon, Inbox, MessageCircle, MessageSquareQuote, Pencil, Settings2, Share2, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { QuickFormDialog, type QuickField } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Flag } from "@/features/marketing/flags";
import { HOME_SECTIONS, systemsToText, type InstitutionalSystem } from "@/features/platform/site-web";
import { saveCountryProfile, saveSiteVideo, saveSiteWebSettings, saveSocialLink, saveTestimonial, updateLead } from "@/features/platform/site-web-actions";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Site web — Plateforme" };

const NETWORKS = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "other", label: "Autre" },
];
const TOPICS = [
  { value: "school", label: "Module scolaire" },
  { value: "university", label: "Université" },
  { value: "training", label: "Formation professionnelle" },
  { value: "badge", label: "Smart Badge" },
  { value: "ai", label: "Assistant IA" },
  { value: "steering", label: "Pilotage" },
  { value: "portals", label: "Portails" },
  { value: "other", label: "Présentation" },
];
const AVAILABILITY = [
  { value: "configurable", label: "Configuration disponible" },
  { value: "preparing", label: "En préparation" },
  { value: "available", label: "Disponible" },
];
const LEAD_STATUS: Record<string, { label: string; tone: "info" | "warning" | "success" | "neutral" }> = {
  new: { label: "Nouvelle", tone: "info" },
  in_progress: { label: "En cours", tone: "warning" },
  done: { label: "Traitée", tone: "success" },
  spam: { label: "Indésirable", tone: "neutral" },
};

const editButton = (label: string) => (
  <Button size="sm" variant="ghost" aria-label={label}>
    <Pencil aria-hidden />
  </Button>
);

/** Contenus du site officiel administrables sans code. */
export default async function PlatformSiteWebPage() {
  const supabase = await createClient();
  const [{ data: settings }, { data: socials }, { data: countries }, { data: profiles }, { data: videos }, { data: testimonials }, { data: leads }] = await Promise.all([
    supabase.from("platform_site_settings").select("*").eq("id", 1).single(),
    supabase.from("site_social_links").select("*").order("sort_order"),
    supabase.from("countries").select("code, name, default_currency, is_active").order("sort_order"),
    supabase.from("site_country_profiles").select("*"),
    supabase.from("site_videos").select("*").order("sort_order"),
    supabase.from("site_testimonials").select("*").order("sort_order"),
    supabase.from("site_leads").select("*").order("created_at", { ascending: false }).limit(100),
  ]);
  const profileOf = new Map((profiles ?? []).map((p) => [p.country_code, p]));
  const sections = (settings?.home_sections ?? {}) as Record<string, boolean>;
  const newLeads = (leads ?? []).filter((l) => l.status === "new").length;

  const settingsFields: QuickField[] = [
    { name: "slogan", label: "Slogan (français)", defaultValue: settings?.slogan ?? "", placeholder: "Plateforme de gestion d'établissement", wide: true },
    { name: "slogan_en", label: "Slogan (anglais)", defaultValue: settings?.slogan_en ?? "", wide: true },
    { name: "seo_description", label: "Description pour les moteurs de recherche (français)", type: "textarea", defaultValue: settings?.seo_description ?? "" },
    { name: "seo_description_en", label: "Description pour les moteurs de recherche (anglais)", type: "textarea", defaultValue: settings?.seo_description_en ?? "" },
    { name: "whatsapp_enabled", label: "Afficher le bouton WhatsApp", type: "checkbox", defaultValue: String(settings?.whatsapp_enabled ?? true) },
    { name: "whatsapp_label", label: "Texte du bouton", defaultValue: settings?.whatsapp_label ?? "", placeholder: "Parler à NeoScool" },
    {
      name: "whatsapp_position",
      label: "Position du bouton",
      type: "select",
      required: true,
      options: [
        { value: "right", label: "En bas à droite" },
        { value: "left", label: "En bas à gauche" },
      ],
      defaultValue: settings?.whatsapp_position ?? "right",
    },
    { name: "whatsapp_message", label: "Message prérempli", defaultValue: settings?.whatsapp_message ?? "", placeholder: "Bonjour NeoScool, je souhaite en savoir plus.", wide: true },
    ...HOME_SECTIONS.map((s) => ({ name: `section_${s.key}`, label: `Accueil : ${s.label}`, type: "checkbox" as const, defaultValue: String(sections[s.key] !== false) })),
  ];

  const socialFields = (s?: NonNullable<typeof socials>[number]): QuickField[] => [
    { name: "network", label: "Réseau", type: "select", required: true, options: NETWORKS, defaultValue: s?.network ?? "facebook" },
    { name: "label", label: "Nom affiché", required: true, defaultValue: s?.label ?? "" },
    { name: "url", label: "Adresse (https://…)", required: true, defaultValue: s?.url ?? "", wide: true },
    { name: "sort_order", label: "Ordre", type: "number", defaultValue: String(s?.sort_order ?? 0) },
    { name: "is_active", label: "Affiché sur le site", type: "checkbox", defaultValue: String(s?.is_active ?? true) },
  ];

  const videoFields = (v?: NonNullable<typeof videos>[number]): QuickField[] => [
    { name: "topic", label: "Thème", type: "select", required: true, options: TOPICS, defaultValue: v?.topic ?? "school" },
    { name: "sort_order", label: "Ordre", type: "number", defaultValue: String(v?.sort_order ?? 0) },
    { name: "title", label: "Titre (français)", required: true, defaultValue: v?.title ?? "", wide: true },
    { name: "title_en", label: "Titre (anglais)", defaultValue: v?.title_en ?? "", wide: true },
    { name: "description", label: "Description", type: "textarea", defaultValue: v?.description ?? "" },
    { name: "video_url", label: "Adresse du fichier vidéo (https://…, MP4)", required: true, defaultValue: v?.video_url ?? "", wide: true },
    { name: "poster_url", label: "Image d'aperçu (https://…)", defaultValue: v?.poster_url ?? "", wide: true },
    { name: "is_published", label: "Publiée sur le site", type: "checkbox", defaultValue: String(v?.is_published ?? false) },
  ];

  const testimonialFields = (q?: NonNullable<typeof testimonials>[number]): QuickField[] => [
    { name: "author_name", label: "Nom de la personne", required: true, defaultValue: q?.author_name ?? "" },
    { name: "author_role", label: "Fonction", defaultValue: q?.author_role ?? "" },
    { name: "organization", label: "Établissement", defaultValue: q?.organization ?? "", wide: true },
    { name: "quote", label: "Témoignage (ses propres mots)", type: "textarea", required: true, defaultValue: q?.quote ?? "" },
    { name: "photo_url", label: "Photo (https://…, avec son accord)", defaultValue: q?.photo_url ?? "", wide: true },
    { name: "sort_order", label: "Ordre", type: "number", defaultValue: String(q?.sort_order ?? 0) },
    { name: "consent_confirmed", label: "J'ai l'accord écrit de cette personne pour publier son témoignage", type: "checkbox", defaultValue: String(q?.consent_confirmed ?? false) },
    { name: "is_published", label: "Publié sur le site", type: "checkbox", defaultValue: String(q?.is_published ?? false) },
  ];

  return (
    <div className="grid gap-6 [&>*]:min-w-0">
      <nav aria-label="Site public" className="flex flex-wrap gap-2 text-sm">
        {[
          ["/", "Voir l'accueil"],
          ["/en", "Version anglaise"],
          ["/contact", "Page contact"],
          ["/pays", "Page pays"],
        ].map(([href, label]) => (
          <Link key={href} href={href!} target="_blank" className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 font-medium hover:border-primary">
            {label} <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        ))}
        <Link href="/plateforme/site" className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 font-medium hover:border-primary">
          Coordonnées, questions, couleur et logo → Site et marque
        </Link>
        <Link href="/plateforme/site-web/visuels" className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 font-medium hover:border-primary">
          Bibliothèque visuelle (photos et illustrations)
        </Link>
      </nav>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="size-5 text-primary" aria-hidden /> Réglages du site et bouton WhatsApp
            </CardTitle>
            <CardDescription>Slogan, référencement, bouton WhatsApp (le numéro se règle dans Site et marque → Coordonnées) et sections affichées sur l&apos;accueil.</CardDescription>
          </div>
          <QuickFormDialog title="Réglages du site" triggerLabel="Modifier" action={saveSiteWebSettings} fields={settingsFields} />
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2" data-testid="site-web-settings">
          <p>
            <span className="text-muted-foreground">Slogan : </span>
            {settings?.slogan ?? "texte d'origine"}
          </p>
          <p className="flex items-center gap-1.5">
            <MessageCircle className="size-4 text-emerald-600" aria-hidden />
            WhatsApp :{" "}
            {settings?.whatsapp_enabled && settings?.whatsapp ? `affiché (+${settings.whatsapp}, ${settings.whatsapp_position === "left" ? "à gauche" : "à droite"})` : settings?.whatsapp ? "masqué" : "aucun numéro renseigné"}
          </p>
          <p className="sm:col-span-2">
            <span className="text-muted-foreground">Sections masquées : </span>
            {HOME_SECTIONS.filter((s) => sections[s.key] === false).map((s) => s.label).join(", ") || "aucune"}
          </p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle className="flex items-center gap-2">
              <Inbox className="size-5 text-primary" aria-hidden /> Demandes reçues {newLeads ? <Badge tone="info">{newLeads} nouvelle(s)</Badge> : null}
            </CardTitle>
            <CardDescription>Messages et demandes de démonstration envoyés depuis le site.</CardDescription>
          </div>
        </CardHeader>
        {leads?.length ? (
          <Table data-testid="lead-list">
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Contact</TH>
                <TH>Demande</TH>
                <TH>État</TH>
                <TH className="text-right">Suivi</TH>
              </tr>
            </THead>
            <tbody>
              {leads.map((l) => (
                <TR key={l.id}>
                  <TD className="whitespace-nowrap text-sm">{formatDateTime(l.created_at)}</TD>
                  <TD>
                    <span className="grid text-sm">
                      <span className="font-semibold">{l.full_name}</span>
                      <a href={`mailto:${l.email}`} className="text-primary hover:underline">
                        {l.email}
                      </a>
                      {l.phone ? <span className="text-xs text-muted-foreground">{l.phone}</span> : null}
                    </span>
                  </TD>
                  <TD>
                    <span className="grid max-w-md text-sm">
                      <span className="font-medium">
                        {l.kind === "demo" ? "Démonstration" : "Contact"}
                        {l.organization ? ` · ${l.organization}` : ""}
                        {l.country ? ` · ${l.country}` : ""}
                      </span>
                      {l.message ? <span className="line-clamp-2 text-xs text-muted-foreground">{l.message}</span> : null}
                    </span>
                  </TD>
                  <TD>
                    <Badge tone={LEAD_STATUS[l.status]?.tone ?? "neutral"}>{LEAD_STATUS[l.status]?.label ?? l.status}</Badge>
                  </TD>
                  <TD className="text-right">
                    <QuickFormDialog
                      title={`Suivi : ${l.full_name}`}
                      description={l.message ?? undefined}
                      action={updateLead}
                      hidden={{ id: l.id }}
                      trigger={editButton(`Suivre la demande de ${l.full_name}`)}
                      fields={[
                        { name: "status", label: "État", type: "select", required: true, options: Object.entries(LEAD_STATUS).map(([value, s]) => ({ value, label: s.label })), defaultValue: l.status },
                        { name: "admin_note", label: "Note interne", type: "textarea", defaultValue: l.admin_note ?? "" },
                      ]}
                    />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <CardContent className="text-sm text-muted-foreground">Aucune demande pour le moment.</CardContent>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle className="flex items-center gap-2">
              <Share2 className="size-5 text-primary" aria-hidden /> Réseaux sociaux
            </CardTitle>
            <CardDescription>Seuls les réseaux affichés apparaissent dans le pied de page du site.</CardDescription>
          </div>
          <QuickFormDialog title="Nouveau réseau" triggerLabel="Ajouter un réseau" action={saveSocialLink} fields={socialFields()} />
        </CardHeader>
        {socials?.length ? (
          <Table data-testid="social-list">
            <THead>
              <tr>
                <TH>Réseau</TH>
                <TH>Adresse</TH>
                <TH>État</TH>
                <TH className="text-right">Modifier</TH>
              </tr>
            </THead>
            <tbody>
              {socials.map((s) => (
                <TR key={s.id}>
                  <TD className="font-semibold">{s.label}</TD>
                  <TD className="max-w-xs truncate text-sm">{s.url}</TD>
                  <TD>{s.is_active ? <Badge tone="success">Affiché</Badge> : <Badge tone="neutral">Masqué</Badge>}</TD>
                  <TD className="text-right">
                    <QuickFormDialog title={`Modifier ${s.label}`} action={saveSocialLink} fields={socialFields(s)} hidden={{ id: s.id }} trigger={editButton(`Modifier ${s.label}`)} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <CardContent className="text-sm text-muted-foreground">Aucun réseau : le pied de page n&apos;en affiche aucun.</CardContent>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlagIcon className="size-5 text-primary" aria-hidden /> Pays affichés sur le site
          </CardTitle>
          <CardDescription>
            Devise, langues et paramètres viennent de l&apos;onglet Pays. Ici : affichage, statut, contexte éducatif et systèmes institutionnels. Un système n&apos;est
            publié que s&apos;il est marqué « vérifié » ; NeoScool est toujours présenté en complément, jamais en remplacement.
          </CardDescription>
        </CardHeader>
        <Table data-testid="country-list">
          <THead>
            <tr>
              <TH>Pays</TH>
              <TH>Statut sur le site</TH>
              <TH>Systèmes vérifiés</TH>
              <TH className="text-right">Modifier</TH>
            </tr>
          </THead>
          <tbody>
            {(countries ?? []).map((c) => {
              const p = profileOf.get(c.code);
              const systems = (p?.institutional_systems ?? []) as InstitutionalSystem[];
              return (
                <TR key={c.code}>
                  <TD>
                    <span className="flex items-center gap-2 font-semibold">
                      <Flag code={c.code} className="h-4 w-6 rounded-sm ring-1 ring-black/10" /> {c.name}
                      {!c.is_active ? <Badge tone="neutral">Pays inactif</Badge> : null}
                    </span>
                  </TD>
                  <TD className="text-sm">{p?.is_displayed ? (AVAILABILITY.find((a) => a.value === p.availability)?.label ?? p.availability) : <span className="text-muted-foreground">Non affiché</span>}</TD>
                  <TD className="text-sm">{systems.filter((s) => s.verified).map((s) => s.name).join(", ") || "—"}</TD>
                  <TD className="text-right">
                    <QuickFormDialog
                      title={`Site web : ${c.name}`}
                      action={saveCountryProfile}
                      hidden={{ code: c.code }}
                      trigger={editButton(`Modifier ${c.name}`)}
                      fields={[
                        { name: "is_displayed", label: "Afficher ce pays sur le site", type: "checkbox", defaultValue: String(p?.is_displayed ?? false) },
                        { name: "availability", label: "Statut affiché", type: "select", required: true, options: AVAILABILITY, defaultValue: p?.availability ?? "configurable" },
                        { name: "sort_order", label: "Ordre", type: "number", defaultValue: String(p?.sort_order ?? 100) },
                        { name: "education_context", label: "Contexte éducatif (français)", type: "textarea", defaultValue: p?.education_context ?? "" },
                        { name: "education_context_en", label: "Contexte éducatif (anglais)", type: "textarea", defaultValue: p?.education_context_en ?? "" },
                        { name: "academic_structure", label: "Structure académique (français)", defaultValue: p?.academic_structure ?? "", wide: true },
                        { name: "academic_structure_en", label: "Structure académique (anglais)", defaultValue: p?.academic_structure_en ?? "", wide: true },
                        { name: "marketing_text", label: "Texte de présentation (français)", type: "textarea", defaultValue: p?.marketing_text ?? "" },
                        { name: "marketing_text_en", label: "Texte de présentation (anglais)", type: "textarea", defaultValue: p?.marketing_text_en ?? "" },
                        {
                          name: "systems",
                          label: "Systèmes institutionnels : une ligne « Nom | description | vérifié »",
                          type: "textarea",
                          defaultValue: systemsToText(systems),
                          hint: "Écrivez « vérifié » en troisième colonne uniquement si l'information a été vérifiée.",
                        },
                      ]}
                    />
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle className="flex items-center gap-2">
              <Video className="size-5 text-primary" aria-hidden /> Vidéos
            </CardTitle>
            <CardDescription>Section « Découvrez NeoScool en action ». Sans vidéo publiée, le site l&apos;annonce « en préparation ».</CardDescription>
          </div>
          <QuickFormDialog title="Nouvelle vidéo" triggerLabel="Ajouter une vidéo" action={saveSiteVideo} fields={videoFields()} />
        </CardHeader>
        {videos?.length ? (
          <Table data-testid="video-list">
            <THead>
              <tr>
                <TH>Vidéo</TH>
                <TH>Thème</TH>
                <TH>État</TH>
                <TH className="text-right">Modifier</TH>
              </tr>
            </THead>
            <tbody>
              {videos.map((v) => (
                <TR key={v.id}>
                  <TD className="font-semibold">{v.title}</TD>
                  <TD className="text-sm">{TOPICS.find((t) => t.value === v.topic)?.label ?? v.topic}</TD>
                  <TD>{v.is_published ? <Badge tone="success">Publiée</Badge> : <Badge tone="neutral">Brouillon</Badge>}</TD>
                  <TD className="text-right">
                    <QuickFormDialog title={`Modifier ${v.title}`} action={saveSiteVideo} fields={videoFields(v)} hidden={{ id: v.id }} trigger={editButton(`Modifier ${v.title}`)} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <CardContent className="text-sm text-muted-foreground">Aucune vidéo pour le moment.</CardContent>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle className="flex items-center gap-2">
              <MessageSquareQuote className="size-5 text-primary" aria-hidden /> Témoignages
            </CardTitle>
            <CardDescription>Uniquement de vraies personnes, avec leur accord écrit. Sans témoignage publié, la section n&apos;apparaît pas.</CardDescription>
          </div>
          <QuickFormDialog title="Nouveau témoignage" triggerLabel="Ajouter un témoignage" action={saveTestimonial} fields={testimonialFields()} />
        </CardHeader>
        {testimonials?.length ? (
          <Table data-testid="testimonial-list">
            <THead>
              <tr>
                <TH>Personne</TH>
                <TH>Témoignage</TH>
                <TH>État</TH>
                <TH className="text-right">Modifier</TH>
              </tr>
            </THead>
            <tbody>
              {testimonials.map((q) => (
                <TR key={q.id}>
                  <TD className="font-semibold">
                    {q.author_name}
                    <span className="block text-xs font-normal text-muted-foreground">{[q.author_role, q.organization].filter(Boolean).join(", ")}</span>
                  </TD>
                  <TD className="max-w-md text-sm">
                    <span className="line-clamp-2">{q.quote}</span>
                  </TD>
                  <TD>{q.is_published ? <Badge tone="success">Publié</Badge> : q.consent_confirmed ? <Badge tone="info">Accord reçu</Badge> : <Badge tone="warning">Accord à obtenir</Badge>}</TD>
                  <TD className="text-right">
                    <QuickFormDialog title={`Modifier : ${q.author_name}`} action={saveTestimonial} fields={testimonialFields(q)} hidden={{ id: q.id }} trigger={editButton(`Modifier le témoignage de ${q.author_name}`)} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <CardContent className="text-sm text-muted-foreground">Aucun témoignage : la section reste masquée sur le site.</CardContent>
        )}
      </Card>
    </div>
  );
}
