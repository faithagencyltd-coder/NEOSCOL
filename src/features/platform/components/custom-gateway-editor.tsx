"use client";

import { Plus, Sparkles, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition, type ReactNode } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prefillFromDocumentation, saveCustomGateway } from "@/features/platform/gateway-actions";
import { customDefinitionSchema, definitionError, EMPTY_DEFINITION, type CustomDefinition } from "@/lib/payments/custom-definition";
import type { ActionResult } from "@/lib/utils/action-result";

type Field = CustomDefinition["secret_fields"][number];
type Req = { method: "GET" | "POST"; path: string; body_format?: "json" | "form" | "none"; body?: Record<string, unknown> };

const SELECT = "h-10 rounded-xl border border-border bg-surface px-3 text-sm";
const PLACEHOLDERS = "{{amount}} {{currency}} {{reference}} {{description}} {{item_name}} {{return_url}} {{cancel_url}} {{callback_url}} {{customer_email}} {{customer_name}} {{customer_phone}} {{transaction_id}} {{config.clé}} {{secret.clé}}";

const json = (value: unknown) => JSON.stringify(value ?? {}, null, 2);
const list = (values: string[]) => values.join(", ");
const split = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
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

/** Corps JSON modifiable : le texte est gardé tel quel, l'objet n'est mis à jour que s'il est valide. */
function JsonArea({ id, label, value, onChange, hint }: { id: string; label: string; value: unknown; onChange: (v: Record<string, unknown> | undefined) => void; hint?: string }) {
  const [text, setText] = useState(() => json(value));
  const [error, setError] = useState<string | null>(null);
  return (
    <FormField id={id} label={label} hint={error ?? hint}>
      <Textarea
        id={id}
        rows={6}
        className="font-mono text-xs"
        spellCheck={false}
        value={text}
        aria-invalid={Boolean(error)}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const parsed = JSON.parse(e.target.value || "{}") as unknown;
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
            setError(null);
            onChange(Object.keys(parsed).length ? (parsed as Record<string, unknown>) : undefined);
          } catch {
            setError("JSON invalide : corrigez avant d'enregistrer.");
          }
        }}
      />
    </FormField>
  );
}

function FieldRows({ id, title, fields, onChange }: { id: string; title: string; fields: Field[]; onChange: (f: Field[]) => void }) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{title}</span>
      {fields.map((f, i) => (
        <div key={i} className="grid grid-cols-[1fr_1.5fr_auto] gap-2">
          <Input aria-label={`${title} ${i + 1} : clé`} value={f.key} placeholder="secret_key" onChange={(e) => onChange(fields.map((x, j) => (j === i ? { ...x, key: e.target.value.trim() } : x)))} />
          <Input aria-label={`${title} ${i + 1} : libellé`} value={f.label} placeholder="Clé secrète" onChange={(e) => onChange(fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <Button type="button" variant="ghost" size="icon" aria-label={`Retirer ${f.label || f.key}`} onClick={() => onChange(fields.filter((_, j) => j !== i))}>
            <Trash2 aria-hidden />
          </Button>
        </div>
      ))}
      {fields.length < 5 ? (
        <Button type="button" variant="secondary" size="sm" className="justify-self-start" id={id} onClick={() => onChange([...fields, { key: "", label: "", required: true }])}>
          <Plus aria-hidden /> Ajouter
        </Button>
      ) : null}
    </div>
  );
}

function RequestFields({ id, value, onChange }: { id: string; value: Req; onChange: (r: Req) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[8rem_1fr_10rem]">
      <FormField id={`${id}-method`} label="Méthode">
        <select id={`${id}-method`} className={SELECT} value={value.method} onChange={(e) => onChange({ ...value, method: e.target.value as Req["method"] })}>
          <option value="POST">POST</option>
          <option value="GET">GET</option>
        </select>
      </FormField>
      <FormField id={`${id}-path`} label="Chemin" hint="Ajouté à l'adresse de l'API.">
        <Input id={`${id}-path`} value={value.path} className="font-mono text-xs" onChange={(e) => onChange({ ...value, path: e.target.value })} />
      </FormField>
      <FormField id={`${id}-format`} label="Format du corps">
        <select id={`${id}-format`} className={SELECT} value={value.body_format ?? "json"} onChange={(e) => onChange({ ...value, body_format: e.target.value as Req["body_format"] })}>
          <option value="json">JSON</option>
          <option value="form">Formulaire</option>
          <option value="none">Aucun</option>
        </select>
      </FormField>
    </div>
  );
}

/**
 * Ajout / modification d'un agrégateur de paiement inconnu de NeoScool : le
 * Super Admin décrit l'API (ou la fait pré-remplir par l'assistant IA à partir
 * de la documentation), enregistre, saisit les clés puis teste avant activation.
 */
export function CustomGatewayEditor({ code, initialName = "", initialDescription = "", initial = EMPTY_DEFINITION, aiReady }: { code?: string; initialName?: string; initialDescription?: string; initial?: CustomDefinition; aiReady: boolean }) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [d, setD] = useState<CustomDefinition>(initial);
  const [version, setVersion] = useState(0);
  const [doc, setDoc] = useState("");
  const [ai, setAi] = useState<{ ok: boolean; message: string; notes?: string } | null>(null);
  const [analyzing, startAnalyze] = useTransition();
  const [state, save, saving] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await saveCustomGateway(prev, formData);
    notifyResult(result);
    return result;
  }, null);
  const set = <K extends keyof CustomDefinition>(key: K, value: CustomDefinition[K]) => setD((x) => ({ ...x, [key]: value }));
  const check = customDefinitionSchema.safeParse(d);
  const secretKeys = d.secret_fields.map((f) => f.key).filter(Boolean);

  const analyze = () =>
    startAnalyze(async () => {
      const r = await prefillFromDocumentation(doc);
      if (r.ok) {
        setD(r.definition);
        if (!name && r.name) setName(r.name);
        setVersion((v) => v + 1); // recrée les zones JSON avec les nouvelles valeurs
      }
      setAi(r.ok ? { ok: true, message: r.message, notes: r.notes } : { ok: false, message: r.message });
    });

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 rounded-3xl border border-primary/30 bg-primary-soft/40 p-5" data-testid="custom-gateway-ai">
        <h3 className="flex items-center gap-2 font-bold">
          <Sparkles className="size-5 text-primary" aria-hidden /> Pré-remplir avec l&apos;assistant IA
        </h3>
        <p className="text-sm text-muted-foreground">
          Collez la documentation de l&apos;API de l&apos;agrégateur (créer un paiement, vérifier un paiement, notifications). L&apos;assistant remplit le formulaire ;
          vous relisez, enregistrez, puis le test obligatoire confirme que tout fonctionne. Ne collez jamais de clé.
        </p>
        <Textarea aria-label="Documentation de l'agrégateur" rows={6} value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="Collez ici la documentation (texte)…" />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={analyze} disabled={analyzing || doc.trim().length < 200}>
            <Sparkles aria-hidden /> {analyzing ? "Analyse en cours…" : "Analyser la documentation"}
          </Button>
          {!aiReady ? <span className="text-xs text-muted-foreground">Assistant non configuré (clé Claude dans Intégrations) : remplissez le formulaire vous-même.</span> : null}
        </div>
        {ai ? (
          <Alert tone={ai.ok ? "success" : "warning"} title={ai.message}>
            {ai.notes ? <span className="whitespace-pre-line">{ai.notes}</span> : null}
          </Alert>
        ) : null}
      </section>

      <ActionForm dispatch={save} pending={saving} className="grid gap-5" data-testid="custom-gateway-form">
        {code ? <input type="hidden" name="code" value={code} /> : null}
        <input type="hidden" name="definition" value={JSON.stringify(d)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="cg-name" label="Nom de l'agrégateur *">
            <Input id="cg-name" name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
          </FormField>
          <FormField id="cg-description" label="Description (moyens de paiement, pays)">
            <Input id="cg-description" name="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
          </FormField>
        </div>

        <Section n={1} title="Adresses de l'API">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="cg-url-test" label="Adresse en mode test (sandbox)">
              <Input id="cg-url-test" value={d.base_url.test} className="font-mono text-xs" onChange={(e) => set("base_url", { ...d.base_url, test: e.target.value.trim() })} />
            </FormField>
            <FormField id="cg-url-live" label="Adresse en mode réel">
              <Input id="cg-url-live" value={d.base_url.live} className="font-mono text-xs" onChange={(e) => set("base_url", { ...d.base_url, live: e.target.value.trim() })} />
            </FormField>
          </div>
        </Section>

        <Section n={2} title="Clés et identifiants" hint="Seulement les noms des champs : les valeurs se saisissent ensuite, chiffrées, sur la fiche de la passerelle.">
          <FieldRows id="cg-add-secret" title="Clés secrètes" fields={d.secret_fields} onChange={(f) => set("secret_fields", f)} />
          <FieldRows id="cg-add-public" title="Identifiants non secrets" fields={d.public_fields} onChange={(f) => set("public_fields", f)} />
        </Section>

        <Section n={3} title="Authentification">
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField id="cg-auth" label="Type">
              <select id="cg-auth" className={SELECT} value={d.auth.type} onChange={(e) => set("auth", { ...d.auth, type: e.target.value as CustomDefinition["auth"]["type"] })}>
                <option value="bearer">Bearer (Authorization: Bearer …)</option>
                <option value="header">En-tête nommé</option>
                <option value="basic">Basic (identifiant + mot de passe)</option>
                <option value="query">Paramètre dans l&apos;adresse</option>
                <option value="none">Aucune (clés dans le corps)</option>
              </select>
            </FormField>
            {d.auth.type === "header" || d.auth.type === "query" ? (
              <FormField id="cg-auth-name" label={d.auth.type === "header" ? "Nom de l'en-tête" : "Nom du paramètre"}>
                <Input id="cg-auth-name" value={d.auth.name ?? ""} onChange={(e) => set("auth", { ...d.auth, name: e.target.value.trim() })} placeholder="X-API-KEY" />
              </FormField>
            ) : null}
            {d.auth.type !== "none" ? (
              <FormField id="cg-auth-secret" label={d.auth.type === "basic" ? "Identifiant" : "Clé utilisée"}>
                <select id="cg-auth-secret" className={SELECT} value={d.auth.secret_field ?? ""} onChange={(e) => set("auth", { ...d.auth, secret_field: e.target.value })}>
                  <option value="">—</option>
                  {secretKeys.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : null}
            {d.auth.type === "basic" ? (
              <FormField id="cg-auth-password" label="Mot de passe">
                <select id="cg-auth-password" className={SELECT} value={d.auth.password_field ?? ""} onChange={(e) => set("auth", { ...d.auth, password_field: e.target.value })}>
                  <option value="">(aucun)</option>
                  {secretKeys.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : null}
          </div>
          <JsonArea key={`h${version}`} id="cg-headers" label="En-têtes supplémentaires (JSON)" value={d.headers} onChange={(v) => set("headers", v as Record<string, string> | undefined)} hint='Ex. : { "X-Merchant": "{{config.merchant_id}}" }' />
        </Section>

        <Section n={4} title="Créer un paiement" hint={`Modèles disponibles : ${PLACEHOLDERS}`}>
          <RequestFields id="cg-create" value={d.create} onChange={(r) => set("create", { ...d.create, ...r })} />
          <JsonArea key={`c${version}`} id="cg-create-body" label="Corps de la requête (JSON)" value={d.create.body} onChange={(v) => set("create", { ...d.create, body: v })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="cg-create-url" label="Chemin du lien de paiement dans la réponse" hint="Ex. : data.payment_url">
              <Input id="cg-create-url" value={d.create.response.checkout_url} className="font-mono text-xs" onChange={(e) => set("create", { ...d.create, response: { ...d.create.response, checkout_url: e.target.value.trim() } })} />
            </FormField>
            <FormField id="cg-create-source" label="Identifiant du paiement">
              <select id="cg-create-source" className={SELECT} value={d.create.transaction_id_source} onChange={(e) => set("create", { ...d.create, transaction_id_source: e.target.value as "response" | "reference" })}>
                <option value="response">Lu dans la réponse</option>
                <option value="reference">Notre référence NeoScool</option>
              </select>
            </FormField>
            {d.create.transaction_id_source === "response" ? (
              <FormField id="cg-create-id" label="Chemin de l'identifiant dans la réponse" hint="Ex. : data.id">
                <Input id="cg-create-id" value={d.create.response.transaction_id ?? ""} className="font-mono text-xs" onChange={(e) => set("create", { ...d.create, response: { ...d.create.response, transaction_id: e.target.value.trim() } })} />
              </FormField>
            ) : null}
            <FormField id="cg-amount-unit" label="Montant envoyé">
              <select id="cg-amount-unit" className={SELECT} value={d.amount_unit} onChange={(e) => set("amount_unit", e.target.value as "unit" | "cents")}>
                <option value="unit">Tel quel (ex. 15000 F)</option>
                <option value="cents">En centimes (× 100)</option>
              </select>
            </FormField>
            <FormField id="cg-currency" label="Devise par défaut">
              <Input id="cg-currency" value={d.currency} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
            </FormField>
          </div>
        </Section>

        <Section n={5} title="Vérifier un paiement" hint="Appel serveur qui fait foi : aucun paiement n'est validé sans lui.">
          <RequestFields id="cg-verify" value={d.verify} onChange={(r) => set("verify", { ...d.verify, ...r })} />
          {d.verify.method === "POST" ? <JsonArea key={`v${version}`} id="cg-verify-body" label="Corps de la requête (JSON)" value={d.verify.body} onChange={(v) => set("verify", { ...d.verify, body: v })} /> : null}
          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["status", "Chemin du statut *", "data.status"],
                ["amount", "Chemin du montant", "data.amount"],
                ["currency", "Chemin de la devise", "data.currency"],
                ["reference", "Chemin de notre référence", "data.reference"],
                ["method", "Chemin du moyen de paiement", "data.channel"],
              ] as const
            ).map(([k, label, ph]) => (
              <FormField key={k} id={`cg-verify-res-${k}`} label={label}>
                <Input id={`cg-verify-res-${k}`} value={d.verify.response[k] ?? ""} placeholder={ph} className="font-mono text-xs" onChange={(e) => set("verify", { ...d.verify, response: { ...d.verify.response, [k]: e.target.value.trim() } })} />
              </FormField>
            ))}
          </div>
        </Section>

        <Section n={6} title="Signification des statuts" hint="Valeurs exactes renvoyées par l'agrégateur, séparées par des virgules. Tout autre statut = en attente.">
          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["paid", "Payé *"],
                ["failed", "Échoué"],
                ["cancelled", "Annulé / expiré"],
              ] as const
            ).map(([k, label]) => (
              <FormField key={`${k}${version}`} id={`cg-status-${k}`} label={label}>
                <Input id={`cg-status-${k}`} defaultValue={list(d.statuses[k])} onChange={(e) => set("statuses", { ...d.statuses, [k]: split(e.target.value) })} />
              </FormField>
            ))}
          </div>
        </Section>

        <Section n={7} title="Notification (webhook)" hint="Où lire l'identifiant dans la notification : il est ensuite revérifié auprès de l'agrégateur.">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="cg-hook-id" label="Chemin de l'identifiant du paiement">
              <Input id="cg-hook-id" value={d.webhook.transaction_id ?? ""} placeholder="data.id" className="font-mono text-xs" onChange={(e) => set("webhook", { ...d.webhook, transaction_id: e.target.value.trim() })} />
            </FormField>
            <FormField id="cg-hook-ref" label="Chemin de notre référence">
              <Input id="cg-hook-ref" value={d.webhook.reference ?? ""} placeholder="data.reference" className="font-mono text-xs" onChange={(e) => set("webhook", { ...d.webhook, reference: e.target.value.trim() })} />
            </FormField>
          </div>
        </Section>

        <Section n={8} title="Vérification des clés (facultatif)" hint="Appel sans paiement (ex. solde, profil) utilisé au début du test.">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={Boolean(d.check)} onChange={(e) => set("check", e.target.checked ? { method: "GET", path: "/balance", body_format: "none" } : undefined)} /> Définir un appel de vérification
          </label>
          {d.check ? <RequestFields id="cg-check" value={d.check} onChange={(r) => set("check", { ...d.check!, ...r })} /> : null}
        </Section>

        {!check.success ? <Alert tone="warning" title="À compléter avant d'enregistrer">{definitionError(check.error)}</Alert> : null}
        {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="text-xs text-muted-foreground">Après l&apos;enregistrement : saisissez les clés sur la fiche, cliquez « Tester », puis proposez-le aux clients.</p>
          <SubmitButton pendingLabel="Enregistrement…" disabled={!check.success || !name.trim()}>
            Enregistrer l&apos;agrégateur
          </SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
