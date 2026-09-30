"use client";

import { useMemo, useState } from "react";

import { useFeedbackAction } from "@/components/motion/use-feedback-action";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

import { saveCardDesign } from "../actions";
import { CARD_TEMPLATES, type CardData, type CardDesign, type CardTemplate } from "../design";
import { StudentCard3D } from "./student-card-3d";

const TEXTS: { key: keyof CardDesign; label: string; max: number; hint?: string }[] = [
  { key: "slogan", label: "Slogan (verso)", max: 120, hint: "Exemple : Bâtir vos rêves, façonner l'avenir." },
  { key: "address", label: "Adresse", max: 160 },
  { key: "phone", label: "Téléphone", max: 40 },
  { key: "email", label: "E-mail", max: 120 },
  { key: "website", label: "Site internet", max: 120 },
  { key: "administration", label: "Administration", max: 120, hint: "Exemple : Direction : M. KOUASSI" },
  { key: "lost_text", label: "Carte trouvée", max: 160, hint: "Exemple : Carte trouvée ? Appelez le +225 …" },
  { key: "notice", label: "Mention au verso", max: 240 },
];

const OPTIONS: { key: "show_photo" | "show_barcode" | "show_validity" | "show_enrolled_on"; label: string }[] = [
  { key: "show_photo", label: "Photo et matricule" },
  { key: "show_enrolled_on", label: "Date d'inscription" },
  { key: "show_validity", label: "Date de validité" },
  { key: "show_barcode", label: "Code-barres au verso" },
];

/** Réglage du design des cartes, avec aperçu 3D en direct (carte d'exemple). */
export function CardDesignForm({ design: initial, sample }: { design: CardDesign; sample: CardData }) {
  const [design, setDesign] = useState<CardDesign>(initial);
  const [state, formAction, pending] = useFeedbackAction(saveCardDesign);
  const set = <K extends keyof CardDesign>(key: K, value: CardDesign[K]) => setDesign((d) => ({ ...d, [key]: value }));
  const pickTemplate = (template: CardTemplate) =>
    setDesign((d) => ({ ...d, template, primary: CARD_TEMPLATES[template].primary, accent: CARD_TEMPLATES[template].accent }));
  const preview = useMemo(() => design, [design]);
  const error = state && !state.ok ? state.message : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <Card className="order-first grid content-start gap-4 bg-gradient-to-b from-amber-50/40 to-muted/40 p-4 sm:p-8 xl:order-last xl:sticky xl:top-4 dark:from-transparent">
        <p className="text-sm font-semibold">Aperçu (carte d&apos;exemple)</p>
        <StudentCard3D card={sample} design={preview} />
      </Card>

      <ActionForm dispatch={formAction} pending={pending} className="grid content-start gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Modèle</CardTitle>
            <CardDescription>Chaque établissement choisit le sien ; les couleurs restent modifiables.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <input type="hidden" name="template" value={design.template} />
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(CARD_TEMPLATES) as CardTemplate[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => pickTemplate(key)}
                  aria-pressed={design.template === key}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors",
                    design.template === key ? "border-primary bg-primary-soft font-semibold" : "border-border hover:border-primary/50",
                  )}
                >
                  <span className="flex h-8 w-12 shrink-0 overflow-hidden rounded-md border border-border" aria-hidden>
                    <span className="h-full w-2/3" style={{ background: CARD_TEMPLATES[key].primary }} />
                    <span className="h-full w-1/3" style={{ background: CARD_TEMPLATES[key].accent }} />
                  </span>
                  {CARD_TEMPLATES[key].label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(["primary", "accent"] as const).map((key) => (
                <label key={key} className="grid gap-1 text-sm font-medium">
                  {key === "primary" ? "Couleur principale" : "Couleur d'accent"}
                  <span className="flex items-center gap-2">
                    <input type="color" name={key} value={design[key]} onChange={(e) => set(key, e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-input bg-background" />
                    <span className="font-mono text-xs text-muted-foreground">{design[key]}</span>
                  </span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Textes du verso</CardTitle>
            <CardDescription>Vides : les coordonnées de Paramètres › Établissement sont utilisées.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {TEXTS.map((t) => (
              <label key={t.key} className="grid gap-1 text-sm font-medium">
                {t.label}
                {t.key === "notice" ? (
                  <textarea
                    name={t.key}
                    maxLength={t.max}
                    rows={3}
                    value={String(design[t.key] ?? "")}
                    onChange={(e) => set(t.key, e.target.value as never)}
                    className="rounded-xl border border-input bg-background px-3 py-2 text-sm font-normal"
                  />
                ) : (
                  <input
                    name={t.key}
                    maxLength={t.max}
                    value={String(design[t.key] ?? "")}
                    placeholder={t.hint}
                    onChange={(e) => set(t.key, (e.target.value || null) as never)}
                    className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-normal"
                  />
                )}
              </label>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informations affichées</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {OPTIONS.map((o) => (
              <label key={o.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={o.key} value="true" checked={design[o.key]} onChange={(e) => set(o.key, e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
                {o.label}
              </label>
            ))}
          </CardContent>
        </Card>

        {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer le design des cartes</SubmitButton>
      </ActionForm>
    </div>
  );
}
