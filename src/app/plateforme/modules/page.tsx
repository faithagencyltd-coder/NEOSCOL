import { Ban, CircleCheck, Layers, ToggleLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ORG_TYPE_LABELS } from "@/features/platform/org-types";
import { setFeatureRule } from "@/features/platform/team-actions";
import { canWritePlatform, getPlatformRole } from "@/lib/auth/platform";
import { FEATURE_FLAGS } from "@/lib/features";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contrôle des modules — Plateforme" };

/**
 * Contrôle des modules : arrêter ou rouvrir une fonctionnalité pour toute la
 * plateforme, un pays ou un type d'établissement. Le niveau le plus précis
 * l'emporte ; l'arrêt par établissement (fiche de l'établissement) prime.
 */
export default async function PlatformModulesPage() {
  const supabase = await createClient();
  const [role, { data: rules }, { data: impact }, { data: countries }] = await Promise.all([
    getPlatformRole(),
    supabase.from("platform_feature_rules").select("feature_key, scope, scope_value, enabled, reason, updated_at").order("updated_at", { ascending: false }),
    supabase.rpc("platform_feature_impact"),
    supabase.from("countries").select("code, name").order("name"),
  ]);
  const writable = canWritePlatform(role);
  const countryName = new Map((countries ?? []).map((c) => [c.code, c.name]));
  const targetLabel = (scope: string, value: string) =>
    scope === "country" ? `Pays : ${countryName.get(value) ?? value}` : scope === "org_type" ? `Type : ${ORG_TYPE_LABELS[value] ?? value}` : "Toute la plateforme";
  const targets = [
    ...(countries ?? []).map((c) => ({ value: `country:${c.code}`, label: `Pays — ${c.name}` })),
    ...Object.entries(ORG_TYPE_LABELS).map(([value, label]) => ({ value: `org_type:${value}`, label: `Type — ${label}` })),
  ];

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="grid gap-1">
        <h2 className="text-2xl font-bold">Contrôle des modules</h2>
        <p className="text-sm text-muted-foreground">
          Arrêtez ou rouvrez une fonctionnalité pour toute la plateforme, un pays ou un type d&apos;établissement — par exemple pour tester un module dans un seul pays avant de l&apos;ouvrir partout. Chaque changement est enregistré dans le journal avec son motif.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="size-5 text-primary" aria-hidden /> Ordre de priorité
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-1 text-sm sm:grid-cols-2">
            <li>1. Arrêt pour un établissement précis (fiche de l&apos;établissement) — prime sur tout.</li>
            <li>2. Règle pour un type d&apos;établissement.</li>
            <li>3. Règle pour un pays.</li>
            <li>4. Règle pour toute la plateforme (par défaut : ouvert).</li>
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">
            La formule d&apos;abonnement et le choix de l&apos;établissement s&apos;appliquent ensuite : une fonctionnalité ouverte ici reste désactivable par l&apos;établissement. Aucune donnée n&apos;est supprimée par un arrêt.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {FEATURE_FLAGS.map((f) => {
          const own = (rules ?? []).filter((r) => r.feature_key === f.key);
          const global = own.find((r) => r.scope === "global");
          const exceptions = own.filter((r) => r.scope !== "global");
          const stats = (impact ?? []).find((i) => i.feature_key === f.key);
          const globalOff = global?.enabled === false;
          return (
            <Card key={f.key} data-testid={`module-${f.key}`}>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {f.label}
                    {globalOff ? <Badge tone="danger">Arrêté sur la plateforme</Badge> : <Badge tone="success">Ouvert</Badge>}
                  </CardTitle>
                  <CardDescription>{f.hint}</CardDescription>
                  <p className="text-xs text-muted-foreground">
                    Arrêté par ces règles pour {Number(stats?.locked ?? 0)} établissement(s) sur {Number(stats?.organizations ?? 0)}.
                  </p>
                </div>
                {writable ? (
                  <div className="flex flex-wrap gap-2">
                    <ConfirmAction
                      trigger={
                        <Button size="sm" variant={globalOff ? "primary" : "secondary"} data-testid={`module-${f.key}-global`}>
                          {globalOff ? <CircleCheck aria-hidden /> : <Ban aria-hidden />} {globalOff ? "Rouvrir partout" : "Arrêter partout"}
                        </Button>
                      }
                      title={globalOff ? `Rouvrir « ${f.label} » sur toute la plateforme ?` : `Arrêter « ${f.label} » sur toute la plateforme ?`}
                      description={
                        globalOff
                          ? "Les exceptions par pays ou par type restent appliquées."
                          : "Les établissements perdent l'accès à cette fonctionnalité, sauf exception par pays ou par type. Leurs données sont conservées."
                      }
                      confirmLabel={globalOff ? "Rouvrir" : "Arrêter"}
                      tone={globalOff ? "primary" : "danger"}
                      action={setFeatureRule}
                      fields={{ feature: f.key, scope: "global", state: globalOff ? "remove" : "off" }}
                      reason={{ label: "Motif (conservé dans le journal)", required: true }}
                    />
                    <QuickFormDialog
                      title={`Exception — ${f.label}`}
                      description="Ouvre ou arrête la fonctionnalité pour un pays ou un type d'établissement, quel que soit le réglage de la plateforme."
                      trigger={
                        <Button size="sm" variant="secondary">
                          <ToggleLeft aria-hidden /> Exception
                        </Button>
                      }
                      action={setFeatureRule}
                      hidden={{ feature: f.key }}
                      fields={[
                        { name: "target", label: "Pour", type: "select", required: true, options: targets, wide: true },
                        {
                          name: "state",
                          label: "État",
                          type: "select",
                          required: true,
                          defaultValue: "on",
                          options: [
                            { value: "on", label: "Ouvert (pilote, test)" },
                            { value: "off", label: "Arrêté" },
                          ],
                        },
                        { name: "reason", label: "Motif (conservé dans le journal)", type: "text", required: true },
                      ]}
                    />
                  </div>
                ) : null}
              </CardHeader>
              {exceptions.length || global ? (
                <CardContent>
                  <ul className="grid gap-2">
                    {[...(global ? [global] : []), ...exceptions].map((r) => (
                      <li key={`${r.scope}:${r.scope_value}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                        <span className="grid">
                          <span className="flex flex-wrap items-center gap-2 font-medium">
                            {targetLabel(r.scope, r.scope_value)}
                            {r.enabled ? <Badge tone="success">Ouvert</Badge> : <Badge tone="danger">Arrêté</Badge>}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {r.reason} — {new Date(r.updated_at).toLocaleString("fr-FR")}
                          </span>
                        </span>
                        {writable && r.scope !== "global" ? (
                          <ConfirmAction
                            trigger={
                              <Button size="sm" variant="ghost">
                                Retirer
                              </Button>
                            }
                            title="Retirer cette exception ?"
                            description="Le réglage du niveau supérieur s'appliquera de nouveau."
                            confirmLabel="Retirer"
                            action={setFeatureRule}
                            fields={{ feature: f.key, scope: r.scope, value: r.scope_value, state: "remove" }}
                            reason={{ label: "Motif (conservé dans le journal)", required: true }}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              ) : null}
            </Card>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground">
        Pour arrêter une fonctionnalité dans un seul établissement, ouvrez sa fiche depuis{" "}
        <Link href="/plateforme" className="font-medium text-primary underline-offset-4 hover:underline">
          Établissements
        </Link>
        .
      </p>
    </div>
  );
}
