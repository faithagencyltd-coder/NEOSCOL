import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOut } from "@/features/auth/actions";
import { MfaLoginForm } from "@/features/auth/components/security-panels";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/utils/safe-redirect";

export const metadata: Metadata = { title: "Vérification en deux étapes" };

/** Connexion — 2e étape : le mot de passe est correct, le code TOTP est exigé. */
export default async function MfaVerificationPage({ searchParams }: PageProps<"/connexion/verification">) {
  const params = await searchParams;
  const next = safeRedirectPath(params.suite);
  const context = await getSessionContext();
  if (!context) redirect("/connexion");
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!(data?.nextLevel === "aal2" && data.currentLevel !== "aal2")) redirect(next);
  return (
    <div className="grid gap-6">
      <div className="anim-fade-up grid gap-2">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <ShieldCheck className="size-6" aria-hidden />
        </span>
        <h1 className="text-2xl font-bold text-[#0b1f4d] dark:text-white">Vérification en deux étapes</h1>
        <p className="text-sm text-muted-foreground">Saisissez le code à 6 chiffres affiché par votre application d&apos;authentification.</p>
      </div>
      <MfaLoginForm next={next} />
      <form action={signOut} className="text-sm">
        <button type="submit" className="font-medium text-primary hover:underline">
          Utiliser un autre compte
        </button>
      </form>
    </div>
  );
}
