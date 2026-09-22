import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Mot de passe oublié</h1>
        <p className="text-sm text-muted-foreground">Recevez un lien sécurisé pour définir un nouveau mot de passe.</p>
      </div>
      <ForgotPasswordForm />
      <Link href="/connexion" className="text-center text-sm font-medium text-primary hover:underline">
        Retour à la connexion
      </Link>
    </div>
  );
}
