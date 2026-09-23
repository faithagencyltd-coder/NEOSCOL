"use client";

import { MessageSquarePlus, Search, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useMemo, useRef, useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { replyThread, startThread } from "@/features/communication/actions";

/** Réponse dans une conversation. */
export function ReplyForm({ threadId }: { threadId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof replyThread>> | null, formData: FormData) => {
    const result = await replyThread(prev, formData);
    if (result.ok) formRef.current?.reset();
    return result;
  }, null);
  return (
    <ActionForm ref={formRef} dispatch={action} pending={pending} className="grid gap-2">
      <input type="hidden" name="thread_id" value={threadId} />
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <div className="flex items-end gap-2">
        <label htmlFor="reply-body" className="sr-only">
          Votre réponse
        </label>
        <Textarea id="reply-body" name="body" rows={2} required maxLength={10000} placeholder="Écrire une réponse…" className="flex-1" />
        <SubmitButton aria-label="Envoyer la réponse" pendingLabel="…">
          <Send aria-hidden />
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

type Contact = { user_id: string; name: string; kind: string; detail: string };

/** Nouvelle conversation : choix des destinataires parmi les contacts autorisés. */
export function NewThreadDialog({ contacts }: { contacts: Contact[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof startThread>> | null, formData: FormData) => {
    const result = await startThread(prev, formData);
    if (result.ok && result.data) {
      setOpen(false);
      setSelected(new Set());
      router.push(`/messages?fil=${result.data.threadId}`);
    }
    return result;
  }, null);
  const filtered = useMemo(() => {
    const q = query.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return contacts.filter((c) => !q || `${c.name} ${c.kind} ${c.detail}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q)).slice(0, 60);
  }, [contacts, query]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <MessageSquarePlus aria-hidden /> Nouveau message
        </Button>
      </DialogTrigger>
      <DialogContent title="Nouveau message" description="Seuls les contacts autorisés pour votre rôle sont proposés." className="max-w-xl">
        <ActionForm dispatch={action} pending={pending} className="grid gap-3">
          {[...selected].map((id) => (
            <input key={id} type="hidden" name="recipients" value={id} />
          ))}
          {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Destinataires ({selected.size})</span>
            <label className="relative">
              <span className="sr-only">Rechercher un contact</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, rôle, élève…" className="pl-9" />
            </label>
            <ul className="grid max-h-52 gap-1 overflow-y-auto rounded-xl border border-border p-1.5">
              {filtered.length === 0 ? <li className="px-2 py-3 text-sm text-muted-foreground">Aucun contact.</li> : null}
              {filtered.map((c) => (
                <li key={c.user_id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-muted">
                    <input
                      type="checkbox"
                      checked={selected.has(c.user_id)}
                      onChange={(e) =>
                        setSelected((cur) => {
                          const next = new Set(cur);
                          if (e.target.checked) next.add(c.user_id);
                          else next.delete(c.user_id);
                          return next;
                        })
                      }
                      className="size-4 accent-[var(--primary)]"
                    />
                    <span className="grid min-w-0">
                      <span className="truncate font-medium">{c.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {c.kind}
                        {c.detail ? ` · ${c.detail}` : ""}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <FormField id="thread-subject" label="Objet">
            <Input id="thread-subject" name="subject" required maxLength={200} />
          </FormField>
          <FormField id="thread-body" label="Message">
            <Textarea id="thread-body" name="body" rows={4} required maxLength={10000} />
          </FormField>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton disabled={selected.size === 0} pendingLabel="Envoi…">
              Envoyer
            </SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
