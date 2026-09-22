import type { Metadata } from "next";

import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { requireSession } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default async function ResetPasswordPage() {
  await requireSession();
  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold">Nouveau mot de passe</h1>
        <p className="text-sm text-muted-foreground">Choisissez un mot de passe que vous n&apos;utilisez nulle part ailleurs.</p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
