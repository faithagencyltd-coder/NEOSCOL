import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TurnstileWidget } from "@/features/auth/components/turnstile-widget";
import { InlineForm } from "@/features/ecosystem/components/inline-form";
import { PUBLIC_ACCOUNT_TYPES } from "@/features/ecosystem/constants";
import { completePublicAccount, registerPublicAccount } from "@/features/ecosystem/public-actions";
import { getSessionContext } from "@/lib/auth/session";
import { turnstileSettings } from "@/lib/messaging/server";
import { createClient } from "@/lib/supabase/server";
import { param } from "@/lib/utils/search-params";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Créer mon compte — NeoScool Opportunities", robots: { index: false } };

const field = "h-10 w-full rounded-lg border border-border px-3 text-sm";

/** Compte gratuit d'un particulier (candidat, parent, enseignant, formateur) : répondre aux annonces, publier, suivre. */
export default async function PublicSignupPage({ searchParams }: PageProps<"/espace/inscription">) {
  const sp = await searchParams;
  const suite = param(sp, "suite") ?? "";
  const next = suite.startsWith("/") && !suite.startsWith("//") ? suite : "/espace";
  const context = await getSessionContext();
  const supabase = await createClient();
  const [{ data: countries }, captcha] = await Promise.all([supabase.from("countries").select("code, name").order("name"), turnstileSettings()]);
  if (context) {
    const { data: account } = await supabase.from("public_accounts").select("user_id").eq("user_id", context.user.id).maybeSingle();
    if (account) redirect(next);
  }
  const typeSelect = (
    <label className="grid gap-1 text-sm">
      Vous êtes
      <Select name="account_type" required defaultValue="">
        <option value="">—</option>
        {Object.entries(PUBLIC_ACCOUNT_TYPES).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </Select>
    </label>
  );
  const place = (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">
        Pays
        <Select name="country" required defaultValue="">
          <option value="">—</option>
          {(countries ?? []).map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="grid gap-1 text-sm">
        Ville
        <Input name="city" maxLength={80} />
      </label>
    </div>
  );

  return (
    <div className="mx-auto grid w-full max-w-lg gap-5">
      <div className="grid gap-1">
        <h1 className="text-2xl font-bold">{context ? "Compléter mon profil" : "Créer mon compte NeoScool"}</h1>
        <p className="text-sm text-muted-foreground">Gratuit. Pour répondre aux annonces, publier une annonce et suivre vos échanges. Aucune donnée n&apos;est rendue publique.</p>
      </div>
      <div className="rounded-2xl border border-border bg-white p-5">
        {context ? (
          <InlineForm action={completePublicAccount} submit="Enregistrer" redirectTo={next} testId="complete-account">
            {typeSelect}
            {place}
          </InlineForm>
        ) : (
          <InlineForm action={registerPublicAccount} hidden={{ next }} submit="Créer mon compte" testId="public-signup">
            <div aria-hidden className="absolute left-[-9999px] h-px w-px overflow-hidden">
              <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                Prénom
                <input name="first_name" required maxLength={80} autoComplete="given-name" className={field} />
              </label>
              <label className="grid gap-1 text-sm">
                Nom
                <input name="last_name" required maxLength={80} autoComplete="family-name" className={field} />
              </label>
            </div>
            <label className="grid gap-1 text-sm">
              E-mail
              <input name="email" type="email" required maxLength={120} autoComplete="email" className={field} />
            </label>
            {typeSelect}
            {place}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                Mot de passe
                <input name="password" type="password" required minLength={10} autoComplete="new-password" className={field} />
              </label>
              <label className="grid gap-1 text-sm">
                Confirmation
                <input name="confirmation" type="password" required minLength={10} autoComplete="new-password" className={field} />
              </label>
            </div>
            {captcha?.siteKey ? <TurnstileWidget siteKey={captcha.siteKey} /> : null}
            <p className="text-xs text-muted-foreground">
              En créant un compte, vous acceptez les{" "}
              <Link href="/conditions" className="underline">
                conditions d&apos;utilisation
              </Link>{" "}
              et la{" "}
              <Link href="/confidentialite" className="underline">
                politique de confidentialité
              </Link>
              .
            </p>
          </InlineForm>
        )}
      </div>
      {!context ? (
        <p className="text-center text-sm">
          Déjà un compte ?{" "}
          <Link href={`/connexion?suite=${encodeURIComponent(next)}`} className="font-semibold text-primary hover:underline">
            Se connecter
          </Link>
        </p>
      ) : null}
    </div>
  );
}
