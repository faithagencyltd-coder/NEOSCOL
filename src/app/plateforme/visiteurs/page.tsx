import { Eye, MousePointerClick, Target, UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";

import { LinkSelect } from "@/components/shared/link-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils/format";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Visiteurs du site — Plateforme" };

type Stats = {
  views: number;
  visitors: number;
  pages_per_visitor: number | null;
  by_day: { day: string; views: number; visitors: number }[];
  pages: { path: string; views: number; visitors: number }[];
  referrers: { source: string; views: number }[];
  devices: Record<string, number>;
  countries: { country: string; visitors: number }[];
  locales: Record<string, number>;
  leads: number;
  demo_requests: number;
  signups: number;
};

const DEVICES: Record<string, string> = { mobile: "Téléphone", tablet: "Tablette", desktop: "Ordinateur" };

/** Liste à barres d'une seule série (couleur principale) ; la valeur est toujours écrite. */
function Ranked({ title, description, rows }: { title: string; description?: string; rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <ul className="grid gap-1.5">
            {rows.map((r) => (
              <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-2 text-xs" title={`${r.label} : ${r.value}`}>
                <span className="truncate text-muted-foreground">{r.label}</span>
                <span className="h-3 rounded-r-[4px] bg-primary" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} aria-hidden />
                <span className="tabular-nums">{formatNumber(r.value)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune visite sur la période.</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Audience du site public : visiteurs, pages, sources, appareils, pays et conversion (demandes, inscriptions). */
export default async function PlatformVisitorsPage({ searchParams }: PageProps<"/plateforme/visiteurs">) {
  const days = [7, 30, 90].includes(Number(param(await searchParams, "jours"))) ? Number(param(await searchParams, "jours")) : 30;
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86400000);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_visitor_stats", { p_from: from.toISOString().slice(0, 10), p_to: to.toISOString().slice(0, 10) });
  if (error || !data) {
    return (
      <Card>
        <CardContent className="pt-5 text-sm text-danger">Statistiques indisponibles.</CardContent>
      </Card>
    );
  }
  const s = data as unknown as Stats;
  const rate = (n: number) => (s.visitors ? `${((n / s.visitors) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "—");
  const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: "UTC" });

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-2xl font-bold">Visiteurs du site</h2>
          <p className="text-sm text-muted-foreground">
            Mesure sans cookie : aucune adresse IP ni identifiant n&apos;est conservé, les visiteurs « ne pas me suivre » et les robots ne sont pas comptés. Un visiteur unique est compté une fois par jour.
          </p>
        </div>
        <LinkSelect label="Période" className="w-44" value={String(days)} options={[7, 30, 90].map((d) => ({ value: String(d), label: `${d} derniers jours`, href: `/plateforme/visiteurs?jours=${d}` }))} />
      </div>

      <section className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Audience" data-testid="visitor-stats">
        <StatCard label="Visiteurs uniques" value={{ count: s.visitors }} hint={`${s.locales.en ?? 0} page(s) vue(s) en anglais`} icon={Users} />
        <StatCard label="Pages vues" value={{ count: s.views }} hint={s.pages_per_visitor ? `${s.pages_per_visitor} page(s) par visiteur` : undefined} icon={Eye} tone="info" />
        <StatCard label="Demandes reçues" value={{ count: s.leads }} hint={`${s.demo_requests} démo(s) · conversion ${rate(s.leads)}`} icon={MousePointerClick} tone="success" />
        <StatCard label="Inscriptions d'établissements" value={{ count: s.signups }} hint={`Conversion ${rate(s.signups)}`} icon={UserPlus} tone="primary" />
      </section>

      <Ranked title="Visiteurs uniques par jour" rows={s.by_day.slice(-31).map((d) => ({ label: dayLabel(d.day), value: d.visitors }))} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Ranked title="Pages les plus vues" rows={s.pages.map((p) => ({ label: p.path, value: p.views }))} />
        <Ranked title="D'où viennent les visiteurs" description="Site d'origine (moteur de recherche, réseau social…) ou accès direct." rows={s.referrers.map((r) => ({ label: r.source, value: r.views }))} />
        <Ranked title="Appareils" rows={Object.entries(s.devices).map(([k, v]) => ({ label: DEVICES[k] ?? k, value: v }))} />
        <Ranked title="Pays" description="Selon l'hébergeur (non disponible en local)." rows={s.countries.map((c) => ({ label: c.country, value: c.visitors }))} />
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Target className="size-4" aria-hidden /> Les visites de plus de 13 mois sont supprimées automatiquement.
      </p>
    </div>
  );
}
