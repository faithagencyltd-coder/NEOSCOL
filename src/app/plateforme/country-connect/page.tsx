import { FileSpreadsheet, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { saveMapping } from "@/features/country-connect/actions";
import { mappingFields } from "@/features/country-connect/mapping-fields";
import { CC_FIELDS, type CcMapping } from "@/features/country-connect/types";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Country Connect — Plateforme" };

const FIELD_LABEL = new Map<string, string>(CC_FIELDS.map((f) => [f.key, f.label]));

/**
 * Modèles Country Connect par pays (Super Admin) : formats des fichiers
 * officiels, proposés à tous les établissements du pays. Aucune API nationale
 * n'est simulée : uniquement des imports / exports configurables.
 */
export default async function PlatformCountryConnectPage({ searchParams }: PageProps<"/plateforme/country-connect">) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: countries } = await supabase.from("countries").select("code, name, settings").eq("is_active", true).order("sort_order");
  const country = typeof params.pays === "string" && /^[A-Z]{2}$/.test(params.pays) ? params.pays : (countries?.[0]?.code ?? "BJ");
  const current = countries?.find((c) => c.code === country);
  const settings = (current?.settings ?? {}) as { national_id_label?: string | null; national_id_pattern?: string | null };
  const { data: rows } = await supabase.from("country_connect_mappings").select("*").eq("country_code", country).order("direction").order("name");
  const mappings = (rows ?? []) as unknown as CcMapping[];

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-2xl font-bold">Country Connect</h2>
          <p className="text-sm text-muted-foreground">
            Formats des fichiers officiels par pays (import et export), proposés à tous les établissements du pays. Aucune connexion directe n&apos;est simulée.
          </p>
        </div>
        <QuickFormDialog
          title={`Nouveau modèle — ${current?.name ?? country}`}
          triggerLabel="Nouveau modèle"
          action={saveMapping}
          fields={mappingFields(null)}
          hidden={{ scope: "country", country }}
        />
      </div>
      <nav aria-label="Pays" className="flex flex-wrap gap-2">
        {(countries ?? []).map((c) => (
          <Link
            key={c.code}
            href={`/plateforme/country-connect?pays=${c.code}`}
            aria-current={c.code === country ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1.5 text-sm font-medium", c.code === country ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface hover:border-primary/40")}
          >
            {c.name}
          </Link>
        ))}
      </nav>
      <p className="text-sm text-muted-foreground">
        Identifiant national : <span className="font-medium text-foreground">{settings.national_id_label || "Identifiant national"}</span>
        {settings.national_id_pattern ? <> — format <code className="font-mono text-xs">{settings.national_id_pattern}</code></> : " — format libre"}.{" "}
        <Link href="/plateforme/pays" className="text-primary hover:underline">Modifier dans Pays</Link>
      </p>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Modèles — {current?.name ?? country}</CardTitle>
          <CardDescription>Les établissements les utilisent tels quels ou créent leurs propres formats.</CardDescription>
        </CardHeader>
        {mappings.length === 0 ? (
          <CardContent>
            <EmptyState icon={FileSpreadsheet} title="Aucun modèle pour ce pays" description="Ajoutez le format des fichiers demandés par l'administration de ce pays." />
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <tr className="border-t border-border">
                  <TH>Nom</TH>
                  <TH>Sens</TH>
                  <TH className="hidden md:table-cell">Colonnes</TH>
                  <TH />
                </tr>
              </THead>
              <tbody>
                {mappings.map((m) => (
                  <TR key={m.id}>
                    <TD>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{m.name}</span>
                        {!m.is_active ? <Badge>Inactif</Badge> : null}
                      </span>
                      {m.description ? <span className="block text-xs text-muted-foreground">{m.description}</span> : null}
                    </TD>
                    <TD>{m.direction === "import" ? "Import" : "Export"}</TD>
                    <TD className="hidden text-xs text-muted-foreground md:table-cell">{m.columns.map((c) => `${c.header} → ${FIELD_LABEL.get(c.field) ?? c.field}`).join(" · ")}</TD>
                    <TD>
                      <QuickFormDialog
                        title={`Modifier — ${m.name}`}
                        trigger={
                          <Button size="sm" variant="ghost" aria-label={`Modifier ${m.name}`}>
                            <Pencil aria-hidden />
                          </Button>
                        }
                        action={saveMapping}
                        fields={mappingFields(m)}
                        hidden={{ scope: "country", country, id: m.id }}
                      />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
