import { ChevronDown, Lock, PlayCircle, ShieldCheck, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { SignInTabs } from "@/features/auth/components/sign-in-tabs";
import { DemoRolePicker } from "@/features/demo/components/demo-role-picker";
import { isDemoMode } from "@/lib/demo";

export const metadata: Metadata = { title: "Connexion" };

export default async function SignInPage({ searchParams }: PageProps<"/connexion">) {
  const params = await searchParams;
  const next = typeof params.suite === "string" ? params.suite : undefined;
  const expired = params.erreur === "lien-expire";
  const demo = isDemoMode();

  return (
    <div className="grid gap-6">
      <div className="anim-fade-up grid gap-1.5">
        <h1 className="text-[1.75rem] font-bold leading-tight text-[#0b1f4d] sm:text-3xl dark:text-white">
          Connexion à votre <span className="bg-gradient-to-r from-[#1d63ed] to-[#0ea5e9] bg-clip-text text-transparent">espace</span>
        </h1>
        <p className="text-sm text-muted-foreground">Accédez à votre portail NéoScol</p>
      </div>
      {expired ? (
        <Alert tone="warning" title="Lien expiré">
          Ce lien n&apos;est plus valide. Demandez un nouveau lien de réinitialisation.
        </Alert>
      ) : null}
      {params.erreur === "demo" ? <Alert tone="danger">Connexion de démonstration impossible : rechargez les données de démonstration.</Alert> : null}
      <SignInTabs next={next} />

      <details className="group rounded-2xl border border-border/70 bg-white/60 text-sm dark:bg-slate-900/50">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium text-primary">
          <UserPlus className="size-4" aria-hidden />
          Première connexion ou pas encore de compte ?
          <ChevronDown className="ml-auto size-4 transition-transform duration-300 group-open:rotate-180" aria-hidden />
        </summary>
        <p className="anim-fade-up px-4 pb-4 text-muted-foreground">
          Les comptes sont créés par votre établissement : le secrétariat active l&apos;accès des familles (téléphone), des élèves (matricule) et
          du personnel (e-mail). Contactez-le pour recevoir vos identifiants.
        </p>
      </details>

      {demo ? (
        <details open className="group rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50/90 to-blue-50/90 dark:border-cyan-900 dark:from-slate-900 dark:to-slate-900">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold">
            <PlayCircle className="size-4 text-primary" aria-hidden /> Accès rapide — démonstration
            <Link href="/demo" className="ml-auto text-xs font-semibold text-primary hover:underline">
              Scénarios guidés
            </Link>
            <ChevronDown className="size-4 text-primary transition-transform duration-300 group-open:rotate-180" aria-hidden />
          </summary>
          <div className="px-4 pb-4">
            <DemoRolePicker variant="compact" next={next} />
          </div>
        </details>
      ) : null}

      <div className="grid grid-cols-2 gap-3 border-t border-border/70 pt-5 text-xs">
        <p className="flex items-start gap-2.5">
          <ShieldCheck className="size-7 shrink-0 text-primary" aria-hidden />
          <span className="grid">
            <span className="font-semibold text-[#0b1f4d] dark:text-white">Connexion sécurisée</span>
            <span className="text-muted-foreground">Vos données sont protégées</span>
          </span>
        </p>
        <p className="flex items-start gap-2.5">
          <Lock className="size-7 shrink-0 text-primary" aria-hidden />
          <span className="grid">
            <span className="font-semibold text-[#0b1f4d] dark:text-white">Accès contrôlé</span>
            <span className="text-muted-foreground">Droits vérifiés par l&apos;établissement</span>
          </span>
        </p>
      </div>
    </div>
  );
}
