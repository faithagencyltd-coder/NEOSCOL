import { BadgeCheck, CircleSlash, Clock, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DOCUMENT_KIND_LABELS } from "@/features/documents/types";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Vérification d'un document", robots: { index: false } };

const STATES = {
  valid: { icon: BadgeCheck, title: "Document authentique", tone: "bg-success-soft text-success" },
  revoked: { icon: CircleSlash, title: "Document révoqué", tone: "bg-danger-soft text-danger" },
  expired: { icon: Clock, title: "Document expiré", tone: "bg-warning-soft text-warning" },
  not_found: { icon: SearchX, title: "Document inconnu", tone: "bg-danger-soft text-danger" },
} as const;

/** Vérification publique (QR) : aucune donnée personnelle au-delà de l'identité masquée. */
export default async function VerifyPage({ params }: PageProps<"/verifier/[code]">) {
  const { code } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("verify_document", { p_code: decodeURIComponent(code).toUpperCase() });
  const result = data?.[0];
  const status = (result?.status ?? "not_found") as keyof typeof STATES;
  const state = STATES[status] ?? STATES.not_found;
  const Icon = state.icon;
  return (
    <Card className="grid gap-5 p-6">
      <div className="flex items-center gap-3">
        <span className={`flex size-12 shrink-0 items-center justify-center rounded-full ${state.tone}`}>
          <Icon className="size-6" aria-hidden />
        </span>
        <div className="grid">
          <h1 className="text-lg font-semibold">{state.title}</h1>
          <p className="text-sm text-muted-foreground">
            {status === "valid"
              ? "Ce document a bien été émis par l'établissement ci-dessous."
              : status === "revoked"
                ? "Ce document a été annulé par l'établissement : il n'a plus de valeur."
                : status === "expired"
                  ? "La validité de ce document est dépassée."
                  : "Aucun document ne correspond à ce code."}
          </p>
        </div>
      </div>
      {result && status !== "not_found" ? (
        <dl className="grid gap-2 rounded-xl bg-muted/50 p-4 text-sm">
          {[
            ["Type", result.kind ? (DOCUMENT_KIND_LABELS[result.kind] ?? result.kind) : "—"],
            ["Numéro", result.number],
            ["Intitulé", result.title],
            ["Titulaire", result.holder],
            ["Établissement", [result.organization_name, result.organization_city].filter(Boolean).join(" — ")],
            ["Émis le", result.issued_at ? formatDate(result.issued_at, "fr-FR", { dateStyle: "long" }) : "—"],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <Button asChild variant="secondary">
        <Link href="/verifier">Vérifier un autre document</Link>
      </Button>
    </Card>
  );
}
