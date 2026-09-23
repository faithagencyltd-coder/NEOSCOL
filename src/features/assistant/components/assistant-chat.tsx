"use client";

import { Bot, Loader2, Send, ShieldCheck, User } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { askAssistant } from "@/features/assistant/actions";
import type { AssistantAnswer, AssistantTurn } from "@/features/assistant/engine";
import { cn } from "@/lib/utils/cn";

const SUGGESTIONS = [
  "Quelles anomalies dois-tu me signaler ?",
  "Liste les impayés",
  "Absences d'aujourd'hui",
  "Effectifs par classe",
  "Résultats et moyennes par matière",
  "Cherche BAMBA",
];

const TOOL_LABELS: Record<string, string> = {
  rechercher: "Recherche",
  statistiques: "Statistiques",
  impayes: "Impayés",
  absences: "Présences",
  anomalies: "Anomalies",
};

type Message = AssistantTurn & { meta?: Pick<AssistantAnswer, "tools" | "provider"> };

/** Conversation avec l'assistant : chaque réponse indique les outils consultés (avec vos droits). */
export function AssistantChat({ llm }: { llm: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const send = (text: string) => {
    const question = text.trim();
    if (!question || pending) return;
    const next: Message[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setError(null);
    startTransition(async () => {
      const result = await askAssistant(next.map(({ role, content }) => ({ role, content })).slice(-20));
      if (result.ok) setMessages((current) => [...current, { role: "assistant", content: result.data.answer, meta: { tools: result.data.tools, provider: result.data.provider } }]);
      else setError(result.message);
    });
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-sm text-info">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          L&apos;assistant consulte les données avec VOS droits (mêmes règles de sécurité que l&apos;application) et ne modifie rien.{" "}
          {llm ? "Moteur : Claude (Anthropic)." : "Moteur local : questions guidées (configurez ANTHROPIC_API_KEY pour le langage naturel complet)."}
        </span>
      </div>
      <div className="grid min-h-80 content-start gap-3 rounded-2xl border border-border bg-surface p-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="grid justify-items-center gap-3 py-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0b2559] to-[#1d63ed] text-white">
              <Bot className="size-6" aria-hidden />
            </span>
            <p className="font-semibold">Posez une question sur votre établissement</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-border px-3 py-1.5 text-sm hover:border-primary hover:text-primary">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cn("rise flex gap-3", m.role === "user" && "flex-row-reverse")}>
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", m.role === "user" ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary")}>
                {m.role === "user" ? <User className="size-4" aria-hidden /> : <Bot className="size-4" aria-hidden />}
              </span>
              <div className={cn("grid max-w-[85%] gap-1 rounded-2xl px-3.5 py-2.5 text-sm", m.role === "user" ? "bg-primary text-primary-foreground" : "bg-surface-muted")}>
                <p className="whitespace-pre-line">{m.content}</p>
                {m.meta?.tools.length ? (
                  <p className="text-[11px] text-muted-foreground">Sources : {[...new Set(m.meta.tools)].map((t) => TOOL_LABELS[t] ?? t).join(", ")}</p>
                ) : null}
              </div>
            </div>
          ))
        )}
        {pending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Analyse en cours…
          </p>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
      >
        <label htmlFor="assistant-question" className="sr-only">
          Votre question
        </label>
        <input
          id="assistant-question"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={2000}
          placeholder="Ex. : qui a des impayés ? absences d'aujourd'hui ?"
          className="h-12 flex-1 rounded-xl border border-input bg-surface px-4 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        <Button type="submit" size="lg" disabled={pending || !input.trim()} aria-label="Envoyer la question">
          <Send aria-hidden />
        </Button>
      </form>
    </div>
  );
}
