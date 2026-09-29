"use client";

import { Volume2 } from "lucide-react";
import { useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { useFeedbackAction } from "@/components/motion/use-feedback-action";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { saveVoiceSettings } from "../actions";
import { DEFAULT_VOICE_MESSAGES, renderVoice, VOICE_EVENTS, VOICE_VARIABLES, type VoiceConfig, type VoiceEvent, type VoiceLanguage } from "../messages";
import { speak } from "../speak";

/** Exemple fictif clairement présenté comme tel pour l'écoute (aucune donnée réelle). */
const SAMPLE: Record<string, string> = { prenom: "Awa", nom: "Awa KONÉ", retard: "7", cours: "Mathématiques", classe: "6e A", salle: "Salle 101", heure: "07:52" };

/**
 * Réglages Voice Check-in : activation, langue, débit, volume, annonce des noms
 * et message par événement (vide = message par défaut), avec écoute.
 */
export function VoiceSettingsForm({ config }: { config: VoiceConfig }) {
  const [state, formAction, pending] = useFeedbackAction(saveVoiceSettings);
  const [language, setLanguage] = useState<VoiceLanguage>(config.language);
  const [rate, setRate] = useState(String(config.rate));
  const [volume, setVolume] = useState(String(config.volume));
  const [names, setNames] = useState(config.announce_names);
  const [messages, setMessages] = useState<Record<string, string>>(() => ({ ...config.messages }));

  const listen = (event: VoiceEvent) => {
    const template = messages[event]?.trim() || DEFAULT_VOICE_MESSAGES[language][event];
    speak(renderVoice(template, { ...SAMPLE, etablissement: config.organization }, names), { language, rate: Number(rate), volume: Number(volume) });
  };

  return (
    <ActionForm dispatch={formAction} pending={pending} className="grid gap-5">
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      {!config.available ? (
        <Alert tone="warning" title="Indisponible dans votre pays">
          L&apos;administration de la plateforme a désactivé les messages vocaux pour ce pays. Vos réglages sont conservés.
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Général</CardTitle>
          <CardDescription>La tablette de pointage prononce le message à chaque scan. Synthèse vocale de l&apos;appareil : aucun son enregistré, aucun service externe.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked={config.enabled} /> Activer les messages vocaux à l&apos;arrivée
          </label>
          <div className="grid gap-2">
            <Label htmlFor="voice-language">Langue</Label>
            <Select id="voice-language" name="language" value={language} onChange={(e) => setLanguage(e.target.value as VoiceLanguage)}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </Select>
          </div>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" name="announce_names" checked={names} onChange={(e) => setNames(e.target.checked)} /> Annoncer le prénom (sinon message anonyme)
          </label>
          <div className="grid gap-2">
            <Label htmlFor="voice-rate">Débit ({rate})</Label>
            <Input id="voice-rate" name="rate" type="range" min="0.5" max="1.5" step="0.1" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="voice-volume">Volume ({Math.round(Number(volume) * 100)} %)</Label>
            <Input id="voice-volume" name="volume" type="range" min="0" max="1" step="0.1" value={volume} onChange={(e) => setVolume(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
          <CardDescription>
            Laissez vide pour le message par défaut. Variables : {VOICE_VARIABLES.map((v) => `{${v.key}}`).join(" ")}. Un badge refusé n&apos;annonce jamais de nom.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {VOICE_EVENTS.map((e) => (
            <div key={e.key} className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={`msg-${e.key}`}>{e.label}</Label>
                <Button type="button" size="sm" variant="ghost" onClick={() => listen(e.key)} aria-label={`Écouter : ${e.label}`}>
                  <Volume2 aria-hidden /> Écouter
                </Button>
              </div>
              <Textarea
                id={`msg-${e.key}`}
                name={`msg_${e.key}`}
                rows={2}
                maxLength={200}
                value={messages[e.key] ?? ""}
                placeholder={DEFAULT_VOICE_MESSAGES[language][e.key]}
                onChange={(ev) => setMessages((m) => ({ ...m, [e.key]: ev.target.value }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer les messages vocaux</SubmitButton>
      </div>
    </ActionForm>
  );
}
