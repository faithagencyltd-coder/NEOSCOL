import { CalendarDays, Mail, MessageSquareText, Phone } from "lucide-react";

import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { parentRequestAction, respondTutorRequest, saveTutorSession, sendTutorMessage } from "@/features/tutoring/actions";
import { REQUEST_STATUS, SESSION_STATUS, TUTOR_MODES } from "@/features/tutoring/constants";
import { InlineForm } from "@/features/ecosystem/components/inline-form";

export type TutorRequest = {
  id: string;
  tutor_id?: string;
  tutor?: string;
  parent?: string;
  status: keyof typeof REQUEST_STATUS;
  subject: string;
  level: string;
  mode: string;
  child_label: string | null;
  message: string;
  preferred_schedule: string | null;
  proposed_schedule: string | null;
  tutor_note: string | null;
  created_at: string;
  contact: { email: string | null; phone: string | null } | null;
  messages: { mine: boolean; body: string; at: string }[];
  sessions: { id: string; starts_at: string; duration: number; mode: string; note: string | null; status: keyof typeof SESSION_STATUS }[];
};

const when = (d: string) => new Date(d).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));

/** Demande de cours : échanges, coordonnées (selon l'étape), séances. Vue famille ou vue tuteur. */
export function RequestCard({ r, side }: { r: TutorRequest; side: "parent" | "tutor" }) {
  const open = !["declined", "cancelled", "closed"].includes(r.status);
  return (
    <li className="grid gap-2 rounded-xl border border-border bg-surface p-3 text-sm" data-testid={`tutor-request-${r.id}`}>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {side === "parent" ? r.tutor : r.parent} · {r.subject} ({r.level}) · {TUTOR_MODES[r.mode] ?? r.mode}
        </span>
        <StatusBadge value={r.status} map={REQUEST_STATUS} />
      </span>
      <span className="text-xs text-muted-foreground">
        {r.child_label ? `Pour : ${r.child_label} · ` : ""}envoyée le {when(r.created_at)}
        {r.preferred_schedule ? ` · disponibilités : ${r.preferred_schedule}` : ""}
      </span>
      <p className="whitespace-pre-line rounded-lg bg-surface-muted p-2">{r.message}</p>
      {r.proposed_schedule ? <p className="text-xs">Disponibilité proposée par le tuteur : <strong>{r.proposed_schedule}</strong></p> : null}
      {r.tutor_note ? <p className="text-xs">Message du tuteur : {r.tutor_note}</p> : null}
      {r.contact ? (
        <p className="flex flex-wrap items-center gap-3 rounded-lg bg-success-soft p-2 text-xs text-success" data-testid="tutor-contact">
          <span>Coordonnées {side === "parent" ? "du tuteur" : "de la famille"} :</span>
          {r.contact.email ? (
            <span className="flex items-center gap-1">
              <Mail className="size-3.5" aria-hidden /> {r.contact.email}
            </span>
          ) : null}
          {r.contact.phone ? (
            <span className="flex items-center gap-1">
              <Phone className="size-3.5" aria-hidden /> {r.contact.phone}
            </span>
          ) : null}
        </p>
      ) : open ? (
        <p className="text-xs text-muted-foreground">
          {side === "parent" ? "Les coordonnées du tuteur s'affichent quand il accepte votre demande." : "Les coordonnées de la famille s'affichent quand elle confirme les modalités."}
        </p>
      ) : null}

      {r.messages.length ? (
        <ul className="grid gap-1" aria-label="Échanges">
          {r.messages.map((m, i) => (
            <li key={i} className={`max-w-[85%] rounded-xl px-3 py-1.5 ${m.mine ? "ml-auto bg-primary text-white" : "mr-auto bg-surface-muted"}`}>
              {m.body} <span className="block text-[10px] opacity-70">{when(m.at)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <InlineForm action={sendTutorMessage} hidden={{ id: r.id }} submit="Envoyer" variant="secondary" reset className="flex items-start gap-2">
          <input name="body" required maxLength={2000} placeholder="Votre message…" aria-label="Votre message" className="h-9 flex-1 rounded-lg border border-border px-2" />
        </InlineForm>
      ) : null}

      {r.sessions.length ? (
        <ul className="grid gap-1" aria-label="Séances">
          {r.sessions.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-2 py-1 text-xs">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-3.5 text-primary" aria-hidden /> {when(x.starts_at)} · {x.duration} min · {TUTOR_MODES[x.mode] ?? x.mode}
                {x.note ? ` · ${x.note}` : ""}
              </span>
              <span className="flex items-center gap-1">
                <StatusBadge value={x.status} map={SESSION_STATUS} />
                {x.status === "planned" ? (
                  <>
                    <InlineForm action={saveTutorSession} hidden={{ request_id: r.id, session_id: x.id, status: "done" }} submit="Effectuée" variant="ghost" className="flex" />
                    <InlineForm action={saveTutorSession} hidden={{ request_id: r.id, session_id: x.id, status: "cancelled" }} submit="Annuler" variant="ghost" className="flex" />
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <span className="flex flex-wrap gap-2">
        {side === "tutor" && ["sent", "proposed", "accepted"].includes(r.status) ? (
          <>
            {r.status !== "accepted" ? <InlineForm action={respondTutorRequest} hidden={{ id: r.id, action: "accept" }} submit="Accepter" className="flex" /> : null}
            <QuickFormDialog
              title="Proposer une autre disponibilité"
              action={respondTutorRequest}
              hidden={{ id: r.id, action: "propose" }}
              trigger={
                <Button size="sm" variant="secondary">
                  Proposer un autre créneau
                </Button>
              }
              fields={[
                { name: "schedule", label: "Disponibilité proposée", required: true, wide: true, placeholder: "ex. mercredi et samedi, 15 h – 17 h" },
                { name: "note", label: "Message (facultatif)", type: "textarea", wide: true },
              ]}
            />
            <QuickFormDialog
              title="Refuser la demande"
              action={respondTutorRequest}
              hidden={{ id: r.id, action: "decline" }}
              trigger={
                <Button size="sm" variant="ghost">
                  Refuser
                </Button>
              }
              fields={[{ name: "note", label: "Message à la famille (facultatif)", type: "textarea", wide: true }]}
            />
          </>
        ) : null}
        {side === "parent" && ["accepted", "proposed"].includes(r.status) ? (
          <InlineForm action={parentRequestAction} hidden={{ id: r.id, action: "confirm" }} submit="Confirmer les modalités" className="flex" />
        ) : null}
        {r.status === "confirmed" ? (
          <QuickFormDialog
            title="Ajouter une séance"
            action={saveTutorSession}
            hidden={{ request_id: r.id }}
            trigger={
              <Button size="sm" variant="secondary">
                <MessageSquareText aria-hidden /> Ajouter une séance
              </Button>
            }
            fields={[
              { name: "date", label: "Date", type: "date", required: true },
              { name: "time", label: "Heure", type: "time", required: true },
              { name: "duration", label: "Durée (minutes)", type: "number", defaultValue: "60", min: 15, max: 480 },
              { name: "mode", label: "Mode", type: "select", options: opts(TUTOR_MODES), defaultValue: r.mode },
              { name: "note", label: "Note (facultatif)", wide: true },
            ]}
          />
        ) : null}
        {side === "parent" && open ? (
          <QuickFormDialog
            title={r.status === "confirmed" ? "Terminer l'accompagnement" : "Annuler la demande"}
            action={parentRequestAction}
            hidden={{ id: r.id, action: r.status === "confirmed" ? "close" : "cancel" }}
            trigger={
              <Button size="sm" variant="ghost">
                {r.status === "confirmed" ? "Terminer" : "Annuler la demande"}
              </Button>
            }
            fields={[{ name: "reason", label: "Motif (facultatif)", wide: true }]}
          />
        ) : null}
      </span>
    </li>
  );
}
