"use client";

import { Megaphone } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveAnnouncement } from "@/features/communication/actions";
import { notifyResult } from "@/components/motion/animated-toast";

export const AUDIENCE_LABELS = { staff: "Personnel", teacher: "Enseignants", parent: "Parents", student: "Élèves" } as const;

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  audience: unknown;
  is_pinned: boolean;
  published_at: string | null;
  expires_at: string | null;
};

function audienceOf(a?: AnnouncementRow): { personas: string[]; class_ids: string[] } {
  const raw = (a?.audience ?? {}) as { personas?: unknown; class_ids?: unknown };
  return {
    personas: Array.isArray(raw.personas) ? raw.personas.map(String) : Object.keys(AUDIENCE_LABELS),
    class_ids: Array.isArray(raw.class_ids) ? raw.class_ids.map(String) : [],
  };
}

/** Création / modification d'une annonce ciblée (public, classes, publication immédiate, programmée ou brouillon). */
export function AnnouncementDialog({ classes, announcement, trigger, today }: { classes: { id: string; name: string }[]; announcement?: AnnouncementRow; trigger?: ReactNode; today: string }) {
  const [open, setOpen] = useState(false);
  const audience = audienceOf(announcement);
  const initialMode = !announcement ? "now" : !announcement.published_at ? "draft" : announcement.published_at > new Date().toISOString() ? "scheduled" : "now";
  const [mode, setMode] = useState(initialMode);
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof saveAnnouncement>> | null, formData: FormData) => {
    const result = await saveAnnouncement(prev, formData);
    notifyResult(result);
    if (result.ok) setOpen(false);
    return result;
  }, null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Megaphone aria-hidden /> Nouvelle annonce
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={announcement ? "Modifier l'annonce" : "Nouvelle annonce"} description="Les destinataires sont notifiés dès la publication." className="max-w-xl">
        <ActionForm dispatch={action} pending={pending} className="grid gap-4">
          {announcement ? <input type="hidden" name="id" value={announcement.id} /> : null}
          {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
          <FormField id="a-title" label="Titre *">
            <Input id="a-title" name="title" required maxLength={200} defaultValue={announcement?.title} />
          </FormField>
          <FormField id="a-body" label="Message *">
            <Textarea id="a-body" name="body" rows={5} required maxLength={5000} defaultValue={announcement?.body} />
          </FormField>
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-sm font-medium">Public *</legend>
            <div className="grid grid-cols-2 gap-x-4">
              {Object.entries(AUDIENCE_LABELS).map(([value, label]) => (
                <Checkbox key={value} name="personas" value={value} label={label} defaultChecked={audience.personas.includes(value)} />
              ))}
            </div>
          </fieldset>
          {classes.length ? (
            <FormField id="a-classes" label="Limiter à certaines classes (facultatif)" hint="Sans sélection, tout l'établissement est concerné. Ctrl/Cmd + clic pour plusieurs classes.">
              <select
                id="a-classes"
                name="class_ids"
                multiple
                defaultValue={audience.class_ids}
                className="min-h-24 rounded-xl border border-input bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FormField>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="a-pub" label="Publication">
              <Select id="a-pub" name="publication" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="now">Publier maintenant</option>
                <option value="scheduled">Programmer</option>
                <option value="draft">Brouillon (non visible)</option>
              </Select>
            </FormField>
            {mode === "scheduled" ? (
              <FormField id="a-on" label="Date de publication *">
                <Input id="a-on" name="publish_on" type="date" min={today} required defaultValue={announcement?.published_at?.slice(0, 10)} />
              </FormField>
            ) : null}
            <FormField id="a-exp" label="Retirer après le (facultatif)">
              <Input id="a-exp" name="expires_on" type="date" min={today} defaultValue={announcement?.expires_at?.slice(0, 10)} />
            </FormField>
          </div>
          <Checkbox name="is_pinned" label="Épingler en tête des annonces" defaultChecked={announcement?.is_pinned} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton pendingLabel="Enregistrement…">{announcement ? "Enregistrer" : "Publier"}</SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
