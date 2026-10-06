import { Download } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/shared/status-badge";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { InlineForm } from "@/features/ecosystem/components/inline-form";
import { APPLICATION_STATUSES } from "@/features/ecosystem/constants";
import type { OpportunityAuthor } from "@/features/ecosystem/discover";
import { updateApplication } from "@/features/ecosystem/public-actions";

export type ApplicationThreadData = {
  id: string;
  status: string;
  message: string;
  created_at: string;
  manager: boolean;
  opportunity_id: string;
  title: string;
  author: OpportunityAuthor;
  applicant_name: string | null;
  applicant_email: string | null;
  cv_file_id: string | null;
  cv_name: string | null;
  events: { kind: "status" | "message"; body: string; created_at: string; mine: boolean }[];
};

const label = (key: string) => APPLICATION_STATUSES[key]?.label ?? key;
/** « received → reviewing : note » devient « Reçue → En cours d'étude : note ». */
const statusText = (body: string) => body.replace(/^(\w+) → (\w+)/, (_, a: string, b: string) => `${label(a)} → ${label(b)}`);
const when = (d: string) => new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

/** Fil d'une candidature : message initial, CV, échanges, changements de statut. */
export function ApplicationThread({ data }: { data: ApplicationThreadData }) {
  const closed = data.status === "rejected" || data.status === "withdrawn";
  return (
    <div className="grid gap-4" data-testid="application-thread">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid">
          <Link href={`/opportunites/${data.opportunity_id}`} className="font-semibold hover:underline">
            {data.title}
          </Link>
          <span className="text-sm text-muted-foreground">{data.manager ? `${data.applicant_name || "Candidat"} · ${data.applicant_email ?? ""}` : data.author.name}</span>
        </div>
        <StatusBadge value={data.status} map={APPLICATION_STATUSES} />
      </div>
      <div className="grid gap-1 rounded-xl border border-border bg-white p-4">
        <p className="text-xs text-muted-foreground">Réponse envoyée le {when(data.created_at)}</p>
        <p className="whitespace-pre-line">{data.message}</p>
        {data.cv_file_id ? (
          <a href={`/espace/cv/${data.cv_file_id}`} className="mt-2 inline-flex w-fit items-center gap-1 text-sm font-semibold text-primary hover:underline" data-testid="cv-download">
            <Download className="size-4" aria-hidden /> {data.cv_name ?? "Document joint"}
          </a>
        ) : null}
      </div>
      <ol className="grid gap-2">
        {data.events.map((e, i) => (
          <li key={i} className={e.kind === "status" ? "text-center text-xs text-muted-foreground" : e.mine ? "ml-auto max-w-[80%] rounded-xl bg-primary/10 p-3 text-sm" : "mr-auto max-w-[80%] rounded-xl border border-border bg-white p-3 text-sm"}>
            {e.kind === "status" ? `Statut : ${statusText(e.body)} — ${when(e.created_at)}` : (
              <>
                <p className="whitespace-pre-line">{e.body}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{when(e.created_at)}</p>
              </>
            )}
          </li>
        ))}
      </ol>
      {closed ? (
        <p className="text-sm text-muted-foreground">Échange clos.</p>
      ) : (
        <InlineForm action={updateApplication} hidden={{ application_id: data.id }} submit="Envoyer le message" reset testId="thread-reply">
          <Textarea name="body" rows={3} maxLength={3000} required aria-label="Votre message" placeholder="Votre message…" />
        </InlineForm>
      )}
      {data.manager && data.status !== "withdrawn" ? (
        <InlineForm action={updateApplication} hidden={{ application_id: data.id }} submit="Mettre à jour le statut" variant="secondary" className="grid gap-2 rounded-xl border border-border bg-white p-4 sm:grid-cols-[200px_1fr_auto] sm:items-end" testId="status-form">
          <Select name="status" defaultValue={data.status} aria-label="Statut">
            {Object.entries(APPLICATION_STATUSES)
              .filter(([k]) => k !== "withdrawn")
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
          </Select>
          <input name="note" maxLength={300} placeholder="Note pour le candidat (facultatif)" className="h-10 rounded-lg border border-border px-3 text-sm" aria-label="Note" />
        </InlineForm>
      ) : null}
      {!data.manager && !closed ? (
        <InlineForm action={updateApplication} hidden={{ application_id: data.id, status: "withdrawn" }} submit="Retirer ma candidature" variant="ghost" />
      ) : null}
    </div>
  );
}
