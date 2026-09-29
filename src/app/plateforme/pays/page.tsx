import { Coins, Globe2, Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { QuickFormDialog, type QuickField } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { saveCountry, saveCurrency } from "@/features/platform/country-actions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pays et devises — Plateforme" };

type Country = {
  code: string;
  name: string;
  name_en: string | null;
  dial_code: string;
  default_currency: string;
  currencies: string[];
  languages: string[];
  default_language: string;
  timezone: string;
  phone_pattern: string;
  date_format: string;
  settings: { grading_scale?: number; school_periods?: string; national_id_label?: string | null };
  is_active: boolean;
  sort_order: number;
};

function countryFields(c: Country | null, currencies: { value: string; label: string }[]): QuickField[] {
  return [
    { name: "code", label: "Code ISO (2 lettres)", required: true, defaultValue: c?.code, placeholder: "MA" },
    { name: "name", label: "Nom", required: true, defaultValue: c?.name, placeholder: "Maroc" },
    { name: "name_en", label: "Nom en anglais", defaultValue: c?.name_en ?? "", placeholder: "Morocco" },
    { name: "dial_code", label: "Indicatif téléphonique", required: true, defaultValue: c?.dial_code, placeholder: "+212" },
    { name: "default_currency", label: "Devise principale", type: "select", required: true, options: currencies, defaultValue: c?.default_currency ?? "XOF" },
    { name: "currencies", label: "Devises acceptées (codes séparés par des virgules)", defaultValue: c?.currencies.join(", ") ?? "" },
    { name: "timezone", label: "Fuseau horaire", required: true, defaultValue: c?.timezone ?? "", placeholder: "Africa/Porto-Novo" },
    { name: "phone_pattern", label: "Format du numéro national (expression régulière)", defaultValue: c?.phone_pattern ?? "^[0-9]{8,10}$" },
    { name: "date_format", label: "Format de date", type: "select", options: [{ value: "dd/MM/yyyy", label: "31/12/2026" }, { value: "MM/dd/yyyy", label: "12/31/2026" }, { value: "yyyy-MM-dd", label: "2026-12-31" }], defaultValue: c?.date_format ?? "dd/MM/yyyy" },
    { name: "default_language", label: "Langue par défaut", type: "select", options: [{ value: "fr", label: "Français" }, { value: "en", label: "English" }], defaultValue: c?.default_language ?? "fr" },
    { name: "lang_fr", label: "Français disponible", type: "checkbox", defaultValue: !c || c.languages.includes("fr") ? "true" : "false" },
    { name: "lang_en", label: "English available", type: "checkbox", defaultValue: !c || c.languages.includes("en") ? "true" : "false" },
    { name: "grading_scale", label: "Barème des notes (sur)", type: "number", min: 5, max: 100, defaultValue: String(c?.settings.grading_scale ?? 20) },
    { name: "school_periods", label: "Périodes scolaires", type: "select", options: [{ value: "trimester", label: "Trimestres" }, { value: "semester", label: "Semestres" }], defaultValue: c?.settings.school_periods ?? "trimester" },
    { name: "national_id_label", label: "Libellé de l'identifiant national de l'élève (facultatif)", defaultValue: c?.settings.national_id_label ?? "", wide: true },
    { name: "sort_order", label: "Ordre d'affichage", type: "number", min: 0, defaultValue: String(c?.sort_order ?? 100) },
    { name: "is_active", label: "Actif (proposé aux établissements)", type: "checkbox", defaultValue: !c || c.is_active ? "true" : "false" },
  ];
}

/**
 * Pays et devises : ajoutés et modifiés ici, sans modifier le code. Chaque
 * établissement hérite de la devise, du fuseau et de la langue de son pays.
 */
export default async function PlatformCountriesPage() {
  const supabase = await createClient();
  const [{ data: countries }, { data: currencies }, { data: overview }] = await Promise.all([
    supabase.from("countries").select("*").order("sort_order").order("name"),
    supabase.from("currencies").select("*").order("code"),
    supabase.rpc("platform_country_overview"),
  ]);
  const currencyOptions = (currencies ?? []).filter((c) => c.is_active).map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }));
  const stats = new Map((overview ?? []).map((o) => [o.code, o]));

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-2xl font-bold">Pays et devises</h2>
          <p className="text-sm text-muted-foreground">Un seul NéoScol pour tous les pays : un nouveau pays s&apos;ajoute ici, sans nouvelle version du logiciel.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href="/plateforme/regles">Modèles académiques par pays</Link>
          </Button>
          <QuickFormDialog
            title="Ajouter un pays"
            description="Le pays devient immédiatement disponible (inscription, établissements, règles)."
            trigger={
              <Button>
                <Plus aria-hidden /> Ajouter un pays
              </Button>
            }
            action={saveCountry}
            fields={countryFields(null, currencyOptions)}
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe2 className="size-5 text-primary" aria-hidden /> Pays ({countries?.length ?? 0})
          </CardTitle>
          <CardDescription>Établissements et abonnements réels par pays (hors démonstration).</CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <tr className="border-t border-border">
                <TH>Pays</TH>
                <TH>Indicatif</TH>
                <TH>Devise</TH>
                <TH>Langues</TH>
                <TH>Fuseau</TH>
                <TH className="text-right">Établissements</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {((countries ?? []) as unknown as Country[]).map((c) => (
                <TR key={c.code}>
                  <TD>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold">{c.code}</span>
                      <span className="font-medium">{c.name}</span>
                      {!c.is_active ? <Badge>Inactif</Badge> : null}
                    </span>
                  </TD>
                  <TD className="tabular-nums">{c.dial_code}</TD>
                  <TD>
                    <span className="font-semibold">{c.default_currency}</span>
                    {c.currencies.length > 1 ? <span className="text-xs text-muted-foreground"> · {c.currencies.filter((x) => x !== c.default_currency).join(", ")}</span> : null}
                  </TD>
                  <TD className="uppercase">{c.languages.join(" · ")}</TD>
                  <TD className="text-xs">{c.timezone}</TD>
                  <TD className="text-right tabular-nums">
                    {Number(stats.get(c.code)?.organizations ?? 0)}
                    <span className="block text-xs text-muted-foreground">{Number(stats.get(c.code)?.active_subscriptions ?? 0)} abonnement(s)</span>
                  </TD>
                  <TD>
                    <QuickFormDialog
                      title={`Modifier — ${c.name}`}
                      trigger={
                        <Button size="sm" variant="ghost" aria-label={`Modifier ${c.name}`}>
                          <Pencil aria-hidden />
                        </Button>
                      }
                      action={saveCountry}
                      fields={countryFields(c, currencyOptions)}
                    />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle className="flex items-center gap-2">
              <Coins className="size-5 text-primary" aria-hidden /> Devises
            </CardTitle>
            <CardDescription>Les montants passés gardent toujours la devise de leur transaction.</CardDescription>
          </div>
          <QuickFormDialog
            title="Ajouter une devise"
            triggerLabel="Ajouter une devise"
            action={saveCurrency}
            fields={[
              { name: "code", label: "Code ISO (3 lettres)", required: true, placeholder: "MAD" },
              { name: "name", label: "Nom", required: true, placeholder: "Dirham marocain" },
              { name: "symbol", label: "Symbole", required: true, placeholder: "DH" },
              { name: "decimals", label: "Décimales", type: "number", min: 0, max: 4, defaultValue: "2" },
              { name: "is_active", label: "Active", type: "checkbox", defaultValue: "true" },
            ]}
          />
        </CardHeader>
        <Table>
          <THead>
            <tr className="border-t border-border">
              <TH>Code</TH>
              <TH>Nom</TH>
              <TH>Symbole</TH>
              <TH className="text-right">Décimales</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {(currencies ?? []).map((c) => (
              <TR key={c.code}>
                <TD className="font-mono font-bold">{c.code}</TD>
                <TD>
                  {c.name} {!c.is_active ? <Badge>Inactive</Badge> : null}
                </TD>
                <TD>{c.symbol}</TD>
                <TD className="text-right tabular-nums">{c.decimals}</TD>
                <TD>
                  <QuickFormDialog
                    title={`Modifier — ${c.code}`}
                    trigger={
                      <Button size="sm" variant="ghost" aria-label={`Modifier ${c.code}`}>
                        <Pencil aria-hidden />
                      </Button>
                    }
                    action={saveCurrency}
                    fields={[
                      { name: "code", label: "Code", required: true, defaultValue: c.code },
                      { name: "name", label: "Nom", required: true, defaultValue: c.name },
                      { name: "symbol", label: "Symbole", required: true, defaultValue: c.symbol },
                      { name: "decimals", label: "Décimales", type: "number", min: 0, max: 4, defaultValue: String(c.decimals) },
                      { name: "is_active", label: "Active", type: "checkbox", defaultValue: c.is_active ? "true" : "false" },
                    ]}
                  />
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
