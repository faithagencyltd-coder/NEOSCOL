"use client";

import { useTransition } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { resendVerificationEmail } from "@/features/auth/security-actions";

export function ResendVerificationButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => notifyResult(await resendVerificationEmail()))}
      className="font-semibold underline-offset-4 hover:underline disabled:opacity-60"
    >
      {pending ? "Envoi…" : "Renvoyer le lien"}
    </button>
  );
}
