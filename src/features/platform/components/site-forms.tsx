"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { contrastRatio, HEX, mix } from "@/features/platform/brand";
import {
  saveSiteBrand,
  saveSiteContacts,
  saveSiteFaq,
  saveSiteLegal,
} from "@/features/platform/site-actions";
import type { ActionResult } from "@/lib/utils/action-result";

type Action = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

function useSiteAction(action: Action) {
  return useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await action(prev, formData);
      notifyResult(result);
      return result;
    },
    null,
  );
}

const ErrorAlert = ({ state }: { state: ActionResult | null }) =>
  state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null;

export type SiteValues = {
  contact_email: string | null;
  contact_phone: string | null;
  whatsapp: string | null;
  address: string | null;
  support_hours: string | null;
  faq: { q: string; a: string }[];
  terms: string | null;
  privacy: string | null;
  primary_color: string | null;
  logo_url: string | null;
};

export function ContactsForm({ site }: { site: SiteValues }) {
  const [state, action, pending] = useSiteAction(saveSiteContacts);
  return (
    <ActionForm
      dispatch={action}
      pending={pending}
      className="grid gap-4 sm:grid-cols-2"
      data-testid="contacts-form"
    >
      <div className="sm:col-span-2">
        <ErrorAlert state={state} />
      </div>
      <FormField
        id="site-whatsapp"
        label="WhatsApp"
        hint="Indicatif du pays puis numéro (ex. 229 01 90 00 00 00)."
      >
        <Input
          id="site-whatsapp"
          name="whatsapp"
          inputMode="tel"
          defaultValue={site.whatsapp ?? ""}
        />
      </FormField>
      <FormField id="site-email" label="E-mail de contact">
        <Input
          id="site-email"
          name="contact_email"
          type="email"
          defaultValue={site.contact_email ?? ""}
        />
      </FormField>
      <FormField id="site-phone" label="Téléphone">
        <Input
          id="site-phone"
          name="contact_phone"
          inputMode="tel"
          defaultValue={site.contact_phone ?? ""}
        />
      </FormField>
      <FormField
        id="site-hours"
        label="Horaires du support"
        hint="Ex. du lundi au vendredi, 8 h – 18 h"
      >
        <Input
          id="site-hours"
          name="support_hours"
          defaultValue={site.support_hours ?? ""}
          maxLength={150}
        />
      </FormField>
      <FormField id="site-address" label="Adresse" className="sm:col-span-2">
        <Input
          id="site-address"
          name="address"
          defaultValue={site.address ?? ""}
          maxLength={300}
        />
      </FormField>
      <div className="flex justify-end sm:col-span-2">
        <SubmitButton>Enregistrer les coordonnées</SubmitButton>
      </div>
    </ActionForm>
  );
}

/** Questions fréquentes : ajout, suppression et ordre. Liste vide = questions d'origine. */
export function FaqEditor({
  site,
  defaults,
}: {
  site: SiteValues;
  defaults: { q: string; a: string }[];
}) {
  const [items, setItems] = useState(() =>
    (site.faq.length ? site.faq : defaults).map((x, i) => ({ ...x, key: i })),
  );
  const [next, setNext] = useState(items.length);
  const [state, action, pending] = useSiteAction(saveSiteFaq);
  const move = (i: number, d: number) =>
    setItems((list) => {
      const copy = [...list];
      const [item] = copy.splice(i, 1);
      copy.splice(i + d, 0, item!);
      return copy;
    });
  return (
    <ActionForm
      dispatch={action}
      pending={pending}
      className="grid gap-3"
      data-testid="faq-form"
    >
      <ErrorAlert state={state} />
      {items.map((item, i) => (
        <fieldset
          key={item.key}
          className="grid gap-2 rounded-xl border border-border p-3"
        >
          <legend className="px-1 text-xs font-medium text-muted-foreground">
            Question {i + 1}
          </legend>
          <Input
            name="q"
            aria-label={`Question ${i + 1}`}
            value={item.q}
            maxLength={200}
            onChange={(e) =>
              setItems((l) =>
                l.map((x) =>
                  x.key === item.key ? { ...x, q: e.target.value } : x,
                ),
              )
            }
          />
          <Textarea
            name="a"
            aria-label={`Réponse ${i + 1}`}
            value={item.a}
            maxLength={2000}
            rows={3}
            onChange={(e) =>
              setItems((l) =>
                l.map((x) =>
                  x.key === item.key ? { ...x, a: e.target.value } : x,
                ),
              )
            }
          />
          <span className="flex justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label={`Monter la question ${i + 1}`}
            >
              <ArrowUp aria-hidden />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={i === items.length - 1}
              onClick={() => move(i, 1)}
              aria-label={`Descendre la question ${i + 1}`}
            >
              <ArrowDown aria-hidden />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-danger"
              onClick={() =>
                setItems((l) => l.filter((x) => x.key !== item.key))
              }
              aria-label={`Retirer la question ${i + 1}`}
            >
              <Trash2 aria-hidden />
            </Button>
          </span>
        </fieldset>
      ))}
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={items.length >= 30}
          onClick={() => {
            setItems((l) => [...l, { q: "", a: "", key: next }]);
            setNext((n) => n + 1);
          }}
        >
          <Plus aria-hidden /> Ajouter une question
        </Button>
        <SubmitButton>Publier les questions</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function LegalForm({ site }: { site: SiteValues }) {
  const [state, action, pending] = useSiteAction(saveSiteLegal);
  return (
    <ActionForm
      dispatch={action}
      pending={pending}
      className="grid gap-4"
      data-testid="legal-form"
    >
      <ErrorAlert state={state} />
      <FormField
        id="site-terms"
        label="Conditions générales d'utilisation"
        hint="Une ligne commençant par « ## » devient un intertitre ; une ligne vide sépare les paragraphes."
      >
        <Textarea
          id="site-terms"
          name="terms"
          defaultValue={site.terms ?? ""}
          maxLength={60000}
          rows={10}
        />
      </FormField>
      <FormField id="site-privacy" label="Politique de confidentialité">
        <Textarea
          id="site-privacy"
          name="privacy"
          defaultValue={site.privacy ?? ""}
          maxLength={60000}
          rows={10}
        />
      </FormField>
      <div className="flex justify-end">
        <SubmitButton>Publier les textes</SubmitButton>
      </div>
    </ActionForm>
  );
}

const DEFAULT_PRIMARY = "#1d63ed";

/** Couleur principale (contraste vérifié en direct) et logo. */
export function BrandForm({ site }: { site: SiteValues }) {
  const [color, setColor] = useState(site.primary_color ?? DEFAULT_PRIMARY);
  const [state, action, pending] = useSiteAction(saveSiteBrand);
  const valid = HEX.test(color.toLowerCase());
  const ratio = valid ? contrastRatio(color.toLowerCase(), "#ffffff") : 0;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ActionForm
        dispatch={action}
        pending={pending}
        className="grid gap-4"
        data-testid="color-form"
      >
        <ErrorAlert state={state} />
        <FormField
          id="site-color"
          label="Couleur principale (boutons, liens, onglets actifs)"
        >
          <span className="flex items-center gap-3">
            <input
              type="color"
              aria-label="Choisir la couleur"
              value={valid ? color : DEFAULT_PRIMARY}
              onChange={(e) => setColor(e.target.value)}
              className="h-12 w-16 cursor-pointer rounded-xl border border-input bg-surface"
            />
            <Input
              id="site-color"
              name="primary_color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-36 font-mono"
              maxLength={7}
            />
          </span>
        </FormField>
        <div
          className="grid gap-2 rounded-xl border border-border p-3"
          data-testid="color-preview"
        >
          <span className="text-xs text-muted-foreground">Aperçu</span>
          <span className="flex flex-wrap items-center gap-3">
            <span
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
              style={{ background: valid ? color : DEFAULT_PRIMARY }}
            >
              Bouton principal
            </span>
            <span
              className="rounded-lg px-2 py-1 text-xs font-semibold"
              style={
                valid
                  ? { background: mix(color.toLowerCase(), -0.9), color }
                  : undefined
              }
            >
              Badge
            </span>
            <span
              className="text-sm font-semibold underline"
              style={{ color: valid ? color : DEFAULT_PRIMARY }}
            >
              Lien
            </span>
          </span>
          <span
            className={
              ratio >= 4.5 ? "text-xs text-success" : "text-xs text-danger"
            }
          >
            {valid
              ? `Contraste du texte blanc : ${ratio} : 1 ${ratio >= 4.5 ? "— lisible" : "— trop clair (minimum 4,5 : 1)"}`
              : "Format attendu : #RRGGBB"}
          </span>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {site.primary_color ? (
            <SubmitButton variant="ghost" name="intent" value="reset_color">
              Couleur d&apos;origine
            </SubmitButton>
          ) : null}
          <SubmitButton
            name="intent"
            value="save"
            disabled={!valid || ratio < 4.5}
          >
            Appliquer la couleur
          </SubmitButton>
        </div>
      </ActionForm>
      <ActionForm
        dispatch={action}
        pending={pending}
        className="grid content-start gap-4"
        data-testid="logo-form"
      >
        <span className="text-sm font-medium">Logo (emblème)</span>
        <span className="flex items-center gap-4">
          <span className="flex size-20 items-center justify-center rounded-2xl border border-border bg-surface-muted">
            <span
              className="block size-14 bg-contain bg-center bg-no-repeat [background-image:var(--brand-logo)]"
              aria-hidden
            />
          </span>
          <span className="text-xs text-muted-foreground">
            {site.logo_url
              ? "Logo personnalisé en ligne."
              : "Logo d'origine NeoScool."}{" "}
            PNG, JPEG ou WebP carré, 1 Mo au maximum.
          </span>
        </span>
        <Input
          type="file"
          name="logo"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Nouveau logo"
          className="h-auto py-2"
        />
        <div className="flex flex-wrap justify-end gap-2">
          {site.logo_url ? (
            <SubmitButton variant="ghost" name="intent" value="reset_logo">
              Logo d&apos;origine
            </SubmitButton>
          ) : null}
          <SubmitButton name="intent" value="logo">
            Mettre en ligne le logo
          </SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
