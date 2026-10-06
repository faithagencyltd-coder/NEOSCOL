"use client";

import { Headset, MessageCircle, Send, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Bulle « Assistant NeoScool » (site public et portails). Réponses tirées de la
 * base de connaissances ; transfert vers l'équipe Support sur demande ou quand
 * l'assistant ne sait pas répondre. La conversation est gardée sur cet appareil
 * (identifiant + jeton dans le stockage local, aucun cookie).
 */
type Msg = { id: number; sender: "visitor" | "bot" | "agent" | "system"; body: string };
const STORE = "ns_support_chat";

const readStore = (): { conversation: string; token: string } | null => {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "null");
    return v && typeof v.conversation === "string" && typeof v.token === "string" ? v : null;
  } catch {
    return null;
  }
};

export function SupportChat({ welcome, handoffLabel, locale = "fr", placement = "site" }: { welcome: string; handoffLabel: string; locale?: "fr" | "en"; placement?: "site" | "app" }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<"hidden" | "offer" | "form" | "done">("hidden");
  const [signedIn, setSignedIn] = useState(false);
  const session = useRef<{ conversation: string; token: string } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef(0);
  const lastId = messages.length ? messages[messages.length - 1]!.id : 0;
  const en = locale === "en";

  // Reprise de la conversation enregistrée et récupération des réponses de l'équipe Support.
  useEffect(() => {
    if (!open) return;
    session.current = session.current ?? readStore();
    const poll = async () => {
      const s = session.current;
      if (!s) return;
      const res = await fetch(`/api/support/chat?conversation=${s.conversation}&jeton=${encodeURIComponent(s.token)}&apres=${lastIdRef.current}`, { cache: "no-store" }).catch(() => null);
      if (!res) return;
      if (res.status === 404) {
        session.current = null;
        try {
          localStorage.removeItem(STORE);
        } catch {}
        return;
      }
      const data = (await res.json().catch(() => null)) as { status?: string; messages?: Msg[] } | null;
      if (data?.messages?.length) setMessages((m) => [...m, ...data.messages!.filter((x) => !m.some((y) => y.id === x.id))]);
      if (data?.status === "waiting_agent" || data?.status === "agent") setHandoff("done");
    };
    void poll();
    const timer = window.setInterval(poll, 8000);
    return () => window.clearInterval(timer);
  }, [open]);
  useEffect(() => {
    lastIdRef.current = lastId;
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [lastId]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    setText("");
    const s = session.current;
    const res = await fetch("/api/support/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation: s?.conversation, token: s?.token, message, page: pathname, locale, after: s ? lastIdRef.current : 0 }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { conversation?: string; token?: string; messages?: Msg[]; handoff?: boolean; status?: string; signedIn?: boolean; error?: string } | null;
    setBusy(false);
    if (!res?.ok || !data?.conversation || !data.token) {
      setError(data?.error ?? (en ? "Unable to send. Try again." : "Envoi impossible. Réessayez."));
      setText(message);
      return;
    }
    if (!s || s.conversation !== data.conversation) {
      session.current = { conversation: data.conversation, token: data.token };
      try {
        localStorage.setItem(STORE, JSON.stringify(session.current));
      } catch {}
    }
    setSignedIn(Boolean(data.signedIn));
    setMessages((m) => [...m, ...(data.messages ?? []).filter((x) => !m.some((y) => y.id === x.id))]);
    if (data.status === "bot" && data.handoff && handoff === "hidden") setHandoff("offer");
  };

  const transfer = async (form: FormData) => {
    const s = session.current;
    if (!s) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/support/chat/transfert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation: s.conversation, token: s.token, name: form.get("name"), email: form.get("email"), phone: form.get("phone"), subject: form.get("subject") }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!res?.ok) {
      setError(data?.error ?? "Transfert impossible.");
      return;
    }
    setHandoff("done");
    const poll = await fetch(`/api/support/chat?conversation=${s.conversation}&jeton=${encodeURIComponent(s.token)}&apres=${lastIdRef.current}`, { cache: "no-store" }).catch(() => null);
    const more = (await poll?.json().catch(() => null)) as { messages?: Msg[] } | null;
    if (more?.messages?.length) setMessages((m) => [...m, ...more.messages!.filter((x) => !m.some((y) => y.id === x.id))]);
  };

  const position = placement === "site" ? "bottom-24 right-5" : "bottom-5 right-5";
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} data-analytics="Ouvrir l'assistant" data-testid="support-chat-open" className={`fixed ${position} z-[55] flex size-14 items-center justify-center rounded-full bg-[#1d63ed] text-white shadow-[0_12px_30px_-8px_rgba(29,99,237,0.7)] transition-transform hover:-translate-y-0.5`} aria-label={en ? "Open the NeoScool assistant" : "Ouvrir l'assistant NeoScool"}>
        <MessageCircle className="size-6" aria-hidden />
      </button>
    );
  }
  const bubble = (m: Msg) =>
    m.sender === "visitor"
      ? "ml-auto bg-[#1d63ed] text-white"
      : m.sender === "agent"
        ? "mr-auto border border-emerald-300 bg-emerald-50 text-emerald-950"
        : m.sender === "system"
          ? "mx-auto bg-slate-100 text-center text-xs text-slate-600"
          : "mr-auto bg-slate-100 text-slate-800";

  return (
    <section role="dialog" aria-label={en ? "NeoScool assistant" : "Assistant NeoScool"} data-testid="support-chat" data-analytics-ignore className={`fixed ${placement === "site" ? "bottom-24" : "bottom-5"} right-3 z-[75] flex max-h-[min(640px,calc(100dvh-7rem))] w-[min(380px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl sm:right-5`}>
      <header className="flex items-center justify-between gap-2 bg-[#0b2559] px-4 py-3 text-white">
        <span className="flex items-center gap-2 font-semibold">
          <MessageCircle className="size-5" aria-hidden /> {en ? "NeoScool assistant" : "Assistant NeoScool"}
        </span>
        <button type="button" onClick={() => setOpen(false)} aria-label={en ? "Close" : "Fermer"} className="rounded-lg p-1 hover:bg-white/10">
          <X className="size-5" aria-hidden />
        </button>
      </header>
      <div ref={list} className="grid flex-1 content-start gap-2 overflow-y-auto p-3 text-sm" aria-live="polite" data-testid="support-chat-messages">
        <p className="mr-auto max-w-[85%] whitespace-pre-line rounded-2xl bg-slate-100 px-3 py-2">{welcome}</p>
        {messages.map((m) => (
          <p key={m.id} className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 ${bubble(m)}`} data-sender={m.sender}>
            {m.sender === "agent" ? <strong className="mb-0.5 block text-xs">{en ? "NeoScool Support" : "Équipe Support NeoScool"}</strong> : null}
            {m.body}
          </p>
        ))}
        {busy ? <p className="mr-auto rounded-2xl bg-slate-100 px-3 py-2 text-slate-500">…</p> : null}
        {handoff === "offer" ? (
          <div className="mr-auto grid max-w-[90%] gap-2 rounded-2xl border border-slate-200 p-3" data-testid="support-handoff-offer">
            <p>{handoffLabel}</p>
            <button type="button" onClick={() => setHandoff("form")} className="flex items-center justify-center gap-2 rounded-xl bg-[#0b2559] px-3 py-2 font-semibold text-white">
              <Headset className="size-4" aria-hidden /> {en ? "Talk to the Support team" : "Parler à l'équipe Support"}
            </button>
          </div>
        ) : null}
        {handoff === "form" ? (
          <form
            className="grid gap-2 rounded-2xl border border-slate-200 p-3"
            data-testid="support-handoff-form"
            onSubmit={(e) => {
              e.preventDefault();
              void transfer(new FormData(e.currentTarget));
            }}
          >
            <p className="font-medium">{en ? "Our team will answer here." : "Notre équipe vous répondra ici."}</p>
            {!signedIn ? (
              <>
                <input name="name" placeholder={en ? "Your name" : "Votre nom"} maxLength={120} className="h-10 rounded-lg border border-slate-300 px-3" aria-label={en ? "Your name" : "Votre nom"} />
                <input name="email" type="email" placeholder="E-mail" maxLength={160} className="h-10 rounded-lg border border-slate-300 px-3" aria-label="E-mail" />
                <input name="phone" type="tel" placeholder={en ? "Phone (optional)" : "Téléphone (facultatif)"} maxLength={30} className="h-10 rounded-lg border border-slate-300 px-3" aria-label={en ? "Phone" : "Téléphone"} />
              </>
            ) : null}
            <input name="subject" placeholder={en ? "Subject (optional)" : "Objet (facultatif)"} maxLength={160} className="h-10 rounded-lg border border-slate-300 px-3" aria-label={en ? "Subject" : "Objet"} />
            <button type="submit" disabled={busy} className="rounded-xl bg-[#1d63ed] px-3 py-2 font-semibold text-white disabled:opacity-60">
              {en ? "Send to Support" : "Envoyer au Support"}
            </button>
          </form>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="px-3 pb-1 text-xs text-red-700">
          {error}
        </p>
      ) : null}
      <form onSubmit={send} className="flex items-center gap-2 border-t border-slate-200 p-2">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1500} placeholder={en ? "Ask your question…" : "Posez votre question…"} className="h-10 flex-1 rounded-xl border border-slate-300 px-3 text-sm" aria-label={en ? "Your message" : "Votre message"} data-testid="support-chat-input" />
        <button type="submit" disabled={busy || !text.trim()} aria-label={en ? "Send" : "Envoyer"} className="flex size-10 items-center justify-center rounded-xl bg-[#1d63ed] text-white disabled:opacity-50">
          <Send className="size-4" aria-hidden />
        </button>
      </form>
      {handoff === "hidden" ? (
        <button type="button" onClick={() => setHandoff(session.current ? "form" : "offer")} className="pb-2 text-xs text-slate-500 hover:underline">
          {en ? "Talk to a person" : "Parler à une personne"}
        </button>
      ) : null}
    </section>
  );
}
