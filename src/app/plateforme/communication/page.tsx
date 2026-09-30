import { Megaphone, Pencil, Send } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog, type QuickField } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { ANNOUNCEMENT_TONES, CAMPAIGN_STATUSES, moduleLabel, MODULES } from "@/features/platform/communication";
import { saveAnnouncement } from "@/features/platform/communication-actions";
import { CampaignForm } from "@/features/platform/components/campaign-form";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatNumber } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Communication — Plateforme" };

type Announcement = {
  id: string;
  title: string;
  body: string;
  tone: string;
  modules: string[];
  audience: string;
  link_url: string | null;
  link_label: string | null;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  dismissible: boolean;
  notified_count: number;
};

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/** État d'une annonce à l'instant présent. */
function announcementState(a: Announcement): { label: string; tone: "success" | "info" | "neutral" | "danger" } {
  const now = new Date().getTime();
  if (!a.is_active) return { label: "Désactivée", tone: "neutral" };
  if (a.ends_at && new Date(a.ends_at).getTime() <= now) return { label: "Terminée", tone: "neutral" };
  if (new Date(a.starts_at).getTime() > now) return { label: "Programmée", tone: "info" };
  return { label: "En cours", tone: "success" };
}

function announcementFields(a?: Announcement): QuickField[] {
  return [
    { name: "title", label: "Titre", required: true, wide: true, defaultValue: a?.title },
    { name: "body", label: "Message", type: "textarea", required: true, defaultValue: a?.body },
    { name: "tone", label: "Type", type: "select", required: true, options: [...ANNOUNCEMENT_TONES], defaultValue: a?.tone ?? "info" },
    {
      name: "audience",
      label: "Qui la voit ?",
      type: "select",
      required: true,
      options: [
        { value: "staff", label: "Tout le personnel des établissements" },
        { value: "direction", label: "La direction seulement" },
      ],
      defaultValue: a?.audience ?? "staff",
    },
    ...MODULES.map((m) => ({
      name: `module_${m.value}`,
      label: `${m.label} (aucun coché = tous les modules)`,
      type: "checkbox" as const,
      defaultValue: a?.modules.includes(m.value) ? "true" : "false",
    })),
    { name: "starts_on", label: "Début", type: "date", defaultValue: day(a?.starts_at ?? null), hint: "Vide = tout de suite" },
    { name: "ends_on", label: "Fin (incluse)", type: "date", defaultValue: day(a?.ends_at ?? null), hint: "Vide = jusqu'à désactivation" },
    { name: "link_url", label: "Lien (facultatif)", placeholder: "/abonnement ou https://…", defaultValue: a?.link_url ?? "" },
    { name: "link_label", label: "Texte du lien", placeholder: "En savoir plus", defaultValue: a?.link_label ?? "" },
    { name: "is_active", label: "Annonce active", type: "checkbox", defaultValue: a ? String(a.is_active) : "true" },
    { name: "dismissible", label: "Chacun peut la masquer", type: "checkbox", defaultValue: a ? String(a.dismissible) : "true" },
    { name: "notify", label: "Envoyer aussi une notification (et un push) aux personnes concernées", type: "checkbox", defaultValue: "false" },
  ];
}

/** Communication de la plateforme : annonces (bandeau) et envois groupés aux directions. */
export default async function PlatformCommunicationPage() {
  const supabase = await createClient();
  const [{ data: announcements }, { data: campaigns }, { data: email }] = await Promise.all([
    supabase.from("platform_announcements").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("platform_campaigns").select("*").order("created_at", { ascending: false }).limit(30),
    supabase.from("platform_integrations").select("enabled, secret_hint").eq("provider", "brevo_email").maybeSingle(),
  ]);
  const list = (announcements ?? []) as Announcement[];
  const emailConfigured = Boolean(email?.enabled && email?.secret_hint);

  return (
    <div className="grid gap-6 [&>*]:min-w-0">
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="size-5 text-primary" aria-hidden /> Annonces aux établissements
            </CardTitle>
            <CardDescription>
              Bandeau affiché en haut de l&apos;application des établissements visés (nouveautés, maintenance, offre, rappel…).
            </CardDescription>
          </div>
          <QuickFormDialog title="Nouvelle annonce" triggerLabel="Nouvelle annonce" action={saveAnnouncement} fields={announcementFields()} submitLabel="Publier" />
        </CardHeader>
        {list.length ? (
          <Table data-testid="announcement-list">
            <THead>
              <tr>
                <TH>Annonce</TH>
                <TH>Public</TH>
                <TH>Période</TH>
                <TH>État</TH>
                <TH className="text-right">Modifier</TH>
              </tr>
            </THead>
            <tbody>
              {list.map((a) => {
                const state = announcementState(a);
                return (
                  <TR key={a.id}>
                    <TD>
                      <span className="grid max-w-md">
                        <span className="font-semibold">{a.title}</span>
                        <span className="line-clamp-2 text-xs text-muted-foreground">{a.body}</span>
                      </span>
                    </TD>
                    <TD className="text-sm">
                      {a.audience === "direction" ? "Direction" : "Tout le personnel"}
                      <span className="block text-xs text-muted-foreground">{a.modules.length ? a.modules.map(moduleLabel).join(", ") : "Tous les modules"}</span>
                    </TD>
                    <TD className="text-sm">
                      {formatDate(a.starts_at)}
                      {a.ends_at ? ` → ${formatDate(a.ends_at)}` : ""}
                      {a.notified_count ? <span className="block text-xs text-muted-foreground">{formatNumber(a.notified_count)} notifiée(s)</span> : null}
                    </TD>
                    <TD>
                      <Badge tone={state.tone}>{state.label}</Badge>
                    </TD>
                    <TD className="text-right">
                      <QuickFormDialog
                        title="Modifier l'annonce"
                        action={saveAnnouncement}
                        fields={announcementFields(a)}
                        hidden={{ id: a.id }}
                        trigger={
                          <Button size="sm" variant="ghost" aria-label={`Modifier ${a.title}`}>
                            <Pencil aria-hidden />
                          </Button>
                        }
                      />
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <CardContent>
            <EmptyState icon={Megaphone} title="Aucune annonce" description="Publiez une annonce pour informer tous les établissements en un clic." />
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="size-5 text-primary" aria-hidden /> Envoi groupé aux directions
          </CardTitle>
          <CardDescription>
            Message aux administrateurs et à la direction des établissements choisis : notification dans l&apos;application et e-mail réel
            (si l&apos;envoi d&apos;e-mails est activé).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CampaignForm emailConfigured={emailConfigured} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Historique des envois</CardTitle>
        </CardHeader>
        {campaigns?.length ? (
          <Table data-testid="campaign-list">
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Objet</TH>
                <TH>Cible</TH>
                <TH>Résultat</TH>
              </tr>
            </THead>
            <tbody>
              {campaigns.map((c) => (
                <TR key={c.id}>
                  <TD className="whitespace-nowrap text-sm">{formatDateTime(c.created_at)}</TD>
                  <TD className="font-semibold">{c.subject}</TD>
                  <TD className="text-xs text-muted-foreground">
                    {c.modules.length ? c.modules.map(moduleLabel).join(", ") : "Tous les modules"}
                    {c.statuses.length ? ` · ${c.statuses.map((s) => CAMPAIGN_STATUSES.find((x) => x.value === s)?.label ?? s).join(", ")}` : ""}
                  </TD>
                  <TD className="text-sm">
                    {formatNumber(c.recipients_count)} destinataire(s) · {formatNumber(c.organizations_count)} établissement(s)
                    <span className="block text-xs text-muted-foreground">
                      {c.channels.includes("in_app") ? `${formatNumber(c.in_app_count)} notification(s)` : ""}
                      {c.channels.includes("email")
                        ? ` · ${formatNumber(c.email_sent)} e-mail(s)${c.email_failed ? `, ${c.email_failed} échec(s)` : ""}${c.email_not_configured ? ", e-mail non configuré" : ""}`
                        : ""}
                    </span>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <CardContent className="text-sm text-muted-foreground">Aucun envoi pour le moment.</CardContent>
        )}
      </Card>
    </div>
  );
}
