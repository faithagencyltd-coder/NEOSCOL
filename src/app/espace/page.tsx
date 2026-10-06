import { Heart, Plus, Send, Megaphone } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/shared/status-badge";
import { InlineForm } from "@/features/ecosystem/components/inline-form";
import { APPLICATION_STATUSES, OPPORTUNITY_STATUSES, PUBLIC_ACCOUNT_TYPES } from "@/features/ecosystem/constants";
import type { OpportunityAuthor } from "@/features/ecosystem/discover";
import { resendPublicAccountEmail } from "@/features/ecosystem/public-actions";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Space = {
  account: { account_type: string; country: string | null; city: string | null } | null;
  posts: { id: string; title: string; status: string; expires_at: string; expired: boolean; moderation_note: string | null; applications: number; unread: number }[];
  applications: { id: string; status: string; unread: boolean; created_at: string; opportunity_id: string; title: string; author: OpportunityAuthor; author_email: string | null }[];
  favorites: { id: string; title: string; city: string | null; expires_at: string }[];
};

/** Mon espace : annonces publiées, candidatures envoyées, favoris. */
export default async function PersonalSpacePage({ searchParams }: PageProps<"/espace">) {
  const confirmed = (await searchParams).email === "confirme";
  const context = await getSessionContext();
  const supabase = await createClient();
  const [{ data }, { data: emailState }] = await Promise.all([supabase.rpc("my_opportunity_space"), supabase.rpc("my_public_account_email_state")]);
  const space = (data ?? { account: null, posts: [], applications: [], favorites: [] }) as unknown as Space;
  const name = [context?.profile?.first_name, context?.profile?.last_name].filter(Boolean).join(" ");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-bold" data-testid="space-title">
            Mon espace{name ? ` — ${name}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            {space.account ? `${PUBLIC_ACCOUNT_TYPES[space.account.account_type] ?? space.account.account_type}${space.account.city ? ` · ${space.account.city}` : ""}` : "Profil Opportunities non complété."}{" "}
            {context?.organizations.length ? (
              <Link href="/tableau-de-bord" className="text-primary hover:underline">
                Accéder à mon établissement →
              </Link>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/opportunites" className="rounded-xl border border-border px-3 py-2 text-sm font-semibold">
            Parcourir les annonces
          </Link>
          <Link href="/opportunites/publier" className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white">
            <Plus className="size-4" aria-hidden /> Publier
          </Link>
        </div>
      </div>
      {confirmed ? (
        <p className="rounded-xl bg-success-soft p-3 text-sm text-success" role="status">
          Adresse e-mail confirmée : vous pouvez répondre aux annonces et en publier.
        </p>
      ) : null}
      {emailState === "pending" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-warning-soft p-3 text-sm text-warning" data-testid="email-pending">
          <span>Confirmez votre adresse e-mail avec le lien reçu à l&apos;inscription : c&apos;est nécessaire pour répondre aux annonces et en publier.</span>
          <InlineForm action={resendPublicAccountEmail} submit="Renvoyer le lien" variant="secondary" className="flex" />
        </div>
      ) : null}
      {!space.account ? (
        <Link href="/espace/inscription" className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 text-sm">
          Complétez votre profil (type de compte, pays, ville) pour répondre aux annonces et en publier. →
        </Link>
      ) : null}

      <section className="grid gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Send className="size-5" aria-hidden /> Mes candidatures et réponses
        </h2>
        {space.applications.length === 0 ? (
          <p className="text-sm text-muted-foreground">Vous n&apos;avez encore répondu à aucune annonce.</p>
        ) : (
          <ul className="grid gap-2" data-testid="my-applications">
            {space.applications.map((a) => (
              <li key={a.id}>
                <Link href={`/espace/candidatures/${a.id}`} className="grid gap-1 rounded-xl border border-border bg-white p-3 hover:shadow sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="grid">
                    <span className="font-medium">
                      {a.title} {a.unread ? <span className="ml-1 rounded-full bg-primary px-1.5 text-[11px] text-white">nouveau</span> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {a.author.name} · envoyée le {new Date(a.created_at).toLocaleDateString("fr-FR")}
                      {a.author_email ? ` · contact : ${a.author_email}` : ""}
                    </span>
                  </div>
                  <StatusBadge value={a.status} map={APPLICATION_STATUSES} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Megaphone className="size-5" aria-hidden /> Mes annonces
        </h2>
        {space.posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune annonce publiée.</p>
        ) : (
          <ul className="grid gap-2" data-testid="my-posts">
            {space.posts.map((p) => (
              <li key={p.id}>
                <Link href={`/espace/annonces/${p.id}`} className="grid gap-1 rounded-xl border border-border bg-white p-3 hover:shadow sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="grid">
                    <span className="font-medium">{p.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.applications} réponse(s){p.unread ? ` dont ${p.unread} non lue(s)` : ""} · {p.expired ? "diffusion terminée" : `jusqu'au ${new Date(p.expires_at).toLocaleDateString("fr-FR")}`}
                    </span>
                    {p.moderation_note ? <span className="text-xs text-danger">Motif NeoScool : {p.moderation_note}</span> : null}
                  </div>
                  <StatusBadge value={p.status} map={OPPORTUNITY_STATUSES} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Heart className="size-5" aria-hidden /> Favoris
        </h2>
        {space.favorites.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun favori.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {space.favorites.map((f) => (
              <li key={f.id}>
                <Link href={`/opportunites/${f.id}`} className="block rounded-xl border border-border bg-white p-3 hover:shadow">
                  <span className="font-medium">{f.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {f.city ?? ""} · jusqu&apos;au {new Date(f.expires_at).toLocaleDateString("fr-FR")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
