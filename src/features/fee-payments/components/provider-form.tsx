"use client";

import { FlaskConical, KeyRound, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveFeeProvider } from "@/features/fee-payments/actions";
import { SCHOOL_CURRENCIES, SCHOOL_CUSTOM_TEMPLATE, SCHOOL_METHODS, type SchoolAdapter } from "@/lib/payments/school-adapters";
import type { ActionResult } from "@/lib/utils/action-result";

export type ProviderInitial = {
  id: string;
  adapter: string;
  label: string;
  country: string | null;
  currency: string;
  methods: string[];
  mode: string;
  config: Record<string, string>;
  custom_definition: unknown;
  secret_hint: string | null;
};

const SELECT = "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm";

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-4 rounded-2xl border border-border p-4">
      <legend className="px-1 text-sm font-semibold">
        {n}. {title}
      </legend>
      {hint ? <p className="-mt-2 text-xs text-muted-foreground">{hint}</p> : null}
      {children}
    </fieldset>
  );
}

/**
 * Ajout / modification d'un fournisseur de paiement de l'établissement. Les clés
 * saisies partent au serveur qui les chiffre ; elles ne sont jamais réaffichées
 * (seul un indice « ••••1234 » rappelle qu'une clé est enregistrée).
 */
export function ProviderForm({ adapters, initial, defaultCurrency }: { adapters: SchoolAdapter[]; initial?: ProviderInitial; defaultCurrency: string }) {
  const router = useRouter();
  const [adapterCode, setAdapterCode] = useState(initial?.adapter ?? adapters[0]?.code ?? "");
  const adapter = useMemo(() => adapters.find((a) => a.code === adapterCode), [adapters, adapterCode]);
  const [label, setLabel] = useState(initial?.label ?? adapter?.name ?? "");
  const [methods, setMethods] = useState<string[]>(initial?.methods ?? adapter?.defaultMethods ?? ["mobile_money"]);
  const [mode, setMode] = useState(initial?.mode ?? "test");
  const config = initial?.config ?? {};
  const known = new Set([...(adapter?.publicFields.map((f) => f.key) ?? []), "api_url_test", "api_url_live"]);
  const extra = Object.entries(config)
    .filter(([k]) => !known.has(k))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const [state, dispatch, pending] = useActionState(async (prev: ActionResult<{ id: string }> | null, formData: FormData) => {
    const result = await saveFeeProvider(prev, formData);
    notifyResult(result);
    if (result.ok && !initial && result.data?.id) router.push(`/parametres/paiements/fournisseurs/${result.data.id}`);
    return result;
  }, null);

  const pick = (code: string) => {
    const next = adapters.find((a) => a.code === code);
    setAdapterCode(code);
    if (next) {
      setLabel(next.name);
      setMethods(next.defaultMethods);
      if (next.kind === "mock") setMode("test");
    }
  };

  return (
    <ActionForm dispatch={dispatch} pending={pending} className="grid gap-5" data-testid="fee-provider-form">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="adapter" value={adapterCode} />

      <Section n={1} title="Fournisseur">
        {initial ? (
          <p className="text-sm">
            Type : <strong>{adapter?.name ?? initial.adapter}</strong>
            <span className="block text-xs text-muted-foreground">Pour changer de type, ajoutez un autre fournisseur (l&apos;historique de celui-ci reste attaché à lui).</span>
          </p>
        ) : (
          <FormField id="fp-adapter" label="Type de fournisseur *" hint={adapter?.description}>
            <select id="fp-adapter" className={SELECT} value={adapterCode} onChange={(e) => pick(e.target.value)}>
              {adapters.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.name}
                </option>
              ))}
            </select>
          </FormField>
        )}
        {adapter?.kind === "mock" ? (
          <Alert tone="warning" title="Fournisseur de test — aucun argent réel">
            Réservé aux essais : il fonctionne uniquement en mode TEST et chaque paiement est marqué « MODE TEST » en comptabilité.
          </Alert>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="fp-label" label="Nom affiché aux familles *">
            <Input id="fp-label" name="label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} required />
          </FormField>
          <FormField id="fp-country" label="Pays" hint="Code à deux lettres (CI, SN, BJ…).">
            <Input id="fp-country" name="country" defaultValue={initial?.country ?? ""} maxLength={2} className="uppercase" />
          </FormField>
          <FormField id="fp-currency" label="Devise *" hint="Les factures dans une autre devise ne lui sont pas proposées.">
            <select id="fp-currency" name="currency" className={SELECT} defaultValue={initial?.currency ?? defaultCurrency}>
              {Array.from(new Set([defaultCurrency, ...SCHOOL_CURRENCIES])).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </Section>

      <Section n={2} title="Environnement" hint={adapter?.testNote}>
        <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Environnement">
          {(
            [
              ["test", "TEST (sandbox, aucun argent réel)"],
              ["live", "PRODUCTION (paiements réels)"],
            ] as const
          ).map(([value, text]) => (
            <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${mode === value ? "border-primary bg-primary-soft/50" : "border-border"} ${adapter?.kind === "mock" && value === "live" ? "pointer-events-none opacity-50" : ""}`}>
              <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} disabled={adapter?.kind === "mock" && value === "live"} className="accent-[var(--primary)]" />
              {text}
            </label>
          ))}
        </div>
      </Section>

      <Section n={3} title="Moyens de paiement proposés">
        <div className="flex flex-wrap gap-3">
          {SCHOOL_METHODS.map((m) => (
            <label key={m.value} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
              <input
                type="checkbox"
                name="methods"
                value={m.value}
                checked={methods.includes(m.value)}
                onChange={(e) => setMethods((x) => (e.target.checked ? [...x, m.value] : x.filter((v) => v !== m.value)))}
                className="size-4 accent-[var(--primary)]"
              />
              {m.label}
            </label>
          ))}
        </div>
      </Section>

      {adapter && adapter.kind !== "mock" ? (
        <Section n={4} title="Identifiants et clés" hint={adapter.where}>
          {adapter.kind === "custom" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="fp-api-test" label="API URL — mode test" hint="Laissez vide pour utiliser celle de la description technique.">
                <Input id="fp-api-test" name="api_url_test" defaultValue={config.api_url_test ?? ""} placeholder="https://sandbox.fournisseur.com/v1" className="font-mono text-xs" />
              </FormField>
              <FormField id="fp-api-live" label="API URL — production">
                <Input id="fp-api-live" name="api_url_live" defaultValue={config.api_url_live ?? ""} placeholder="https://api.fournisseur.com/v1" className="font-mono text-xs" />
              </FormField>
            </div>
          ) : null}
          {adapter.publicFields.length ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {adapter.publicFields.map((f) => (
                <FormField key={f.key} id={`fp-config-${f.key}`} label={`${f.label}${f.required ? " *" : ""}`} hint={f.hint}>
                  <Input id={`fp-config-${f.key}`} name={`config_${f.key}`} defaultValue={config[f.key] ?? ""} placeholder={f.placeholder} autoComplete="off" />
                </FormField>
              ))}
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-3">
            {adapter.secretFields.map((f) => (
              <FormField
                key={f.key}
                id={`fp-secret-${f.key}`}
                label={`${f.label}${f.required ? " *" : ""}`}
                hint={initial?.secret_hint ? `Clé enregistrée (${initial.secret_hint}) : laissez vide pour la conserver.` : (f.hint ?? "Chiffrée par le serveur, jamais réaffichée.")}
              >
                <Input id={`fp-secret-${f.key}`} name={`secret_${f.key}`} type="password" autoComplete="new-password" spellCheck={false} />
              </FormField>
            ))}
          </div>
          {initial?.secret_hint ? (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" name="clear_secret" className="size-4 accent-[var(--primary)]" /> Effacer les clés enregistrées
            </label>
          ) : null}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <KeyRound className="size-3.5" aria-hidden /> Clés chiffrées (AES-256-GCM) sur le serveur ; jamais envoyées au navigateur ni écrites dans les journaux.
          </p>
        </Section>
      ) : null}

      {adapter?.kind === "custom" ? (
        <Section n={5} title="Description technique de l'API" hint="Comment créer et vérifier un paiement chez ce fournisseur (modèles {{amount}}, {{reference}}, {{config.merchant_id}}, {{secret.api_key}}…). Un test réussi est obligatoire avant activation.">
          <Textarea
            aria-label="Description technique de l'API (JSON)"
            name="custom_definition"
            rows={14}
            spellCheck={false}
            className="font-mono text-xs"
            defaultValue={JSON.stringify(initial?.custom_definition ?? SCHOOL_CUSTOM_TEMPLATE, null, 2)}
          />
        </Section>
      ) : null}

      {adapter && adapter.kind !== "mock" ? (
        <Section n={adapter.kind === "custom" ? 6 : 5} title="Paramètres supplémentaires" hint="Facultatif : un paramètre par ligne, au format clé=valeur (ex. : account_id=12345, channel=WEB).">
          <Textarea aria-label="Paramètres supplémentaires" name="extra_params" rows={3} defaultValue={extra} className="font-mono text-xs" placeholder="account_id=12345" />
        </Section>
      ) : null}

      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {adapter?.kind === "mock" ? (
          <span className="flex items-center gap-1.5 text-xs text-warning">
            <FlaskConical className="size-4" aria-hidden /> Mode TEST uniquement
          </span>
        ) : null}
        <SubmitButton pendingLabel="Enregistrement…">
          <Save aria-hidden /> ENREGISTRER
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
