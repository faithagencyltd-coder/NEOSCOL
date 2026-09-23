import {
  ArrowRight,
  CalendarCheck,
  FileStack,
  LogIn,
  NotebookPen,
  PlayCircle,
  ScanLine,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Logo } from "@/components/shared/logo";
import { SubmitButton } from "@/components/shared/submit-button";
import { DEMO_ACCOUNTS, type DemoAccountKey } from "@/features/demo/accounts";
import { demoSignIn } from "@/features/demo/actions";
import { DemoRolePicker } from "@/features/demo/components/demo-role-picker";
import { getSessionContext } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo";

export const metadata: Metadata = { title: "Mode démonstration" };

type Step = { account: DemoAccountKey; path: string; label: string; detail: string };
type Scenario = { title: string; icon: LucideIcon; summary: string; steps: Step[] };

const SCENARIOS: Scenario[] = [
  {
    title: "Pointage par badge QR et cours déverrouillé",
    icon: ScanLine,
    summary: "Le professeur ne peut faire l'appel qu'après avoir scanné son badge à la tablette de l'administration.",
    steps: [
      { account: "enseignant", path: "/mes-cours", label: "Voir le cours verrouillé", detail: "Professeur : « Appel verrouillé » tant que le badge n'est pas scanné." },
      { account: "pointage", path: "/pointage", label: "Scanner le badge", detail: "Tablette : « Simuler un scan » → Ibrahim OUATTARA." },
      { account: "enseignant", path: "/mes-cours", label: "Faire l'appel", detail: "Le cours est déverrouillé : Présent / Retard / Absent / Justifiée, puis validation." },
    ],
  },
  {
    title: "Impayé, restriction et accès restauré",
    icon: Wallet,
    summary: "Kofi a une échéance dépassée : notes et bulletins sont suspendus, les présences restent visibles.",
    steps: [
      { account: "parent", path: "/portail", label: "Portail du parent", detail: "« Paiement en retard » et fonctionnalités restreintes." },
      { account: "comptable", path: "/finances?onglet=factures", label: "Enregistrer le paiement", detail: "Factures → facture de Kofi BAMBA → « Enregistrer un paiement »." },
      { account: "parent", path: "/portail", label: "Constater le déverrouillage", detail: "« Paiement régularisé — accès restauré immédiatement »." },
    ],
  },
  {
    title: "Notes, bulletins et éditeur",
    icon: NotebookPen,
    summary: "Grille de notes avec moyennes recalculées en direct, aperçu du bulletin, modèle configurable.",
    steps: [
      { account: "enseignant", path: "/notes", label: "Saisir les notes", detail: "Grille Interro 1 · Interro 2 · Devoir · Examen · Moyenne." },
      { account: "enseignant", path: "/bulletins/apercu", label: "Aperçu (professeur)", detail: "Aperçu seulement : aucun PDF, aucun document officiel." },
      { account: "admin", path: "/bulletins/configuration", label: "Éditeur de bulletin", detail: "Colonnes, coefficients, ordre des matières, aperçu en temps réel." },
    ],
  },
  {
    title: "Documents officiels et dossier complet",
    icon: FileStack,
    summary: "Fiche d'inscription, reçus, certificats, bulletins, cartes, badges… fusionnés en un seul PDF.",
    steps: [
      { account: "admin", path: "/documents", label: "Bibliothèque de documents", detail: "Aperçu et génération PDF selon les permissions." },
      { account: "admin", path: "/personnel/badges", label: "Badges du personnel", detail: "Badges QR professionnels, aperçu et impression." },
      { account: "enseignant", path: "/documents", label: "Vérifier les droits", detail: "Le professeur n'a pas accès aux documents officiels." },
    ],
  },
  {
    title: "Présences et justificatifs",
    icon: CalendarCheck,
    summary: "Trois semaines d'appels validés, justificatifs déposés par les familles, décision de l'administration.",
    steps: [
      { account: "secretariat", path: "/presences?onglet=justificatifs", label: "Examiner les justificatifs", detail: "Accepter, refuser ou demander une correction." },
      { account: "parent", path: "/portail/presences", label: "Côté parent", detail: "Absences, retards et dépôt d'un justificatif." },
    ],
  },
];

function StepButton({ step, index }: { step: Step; index: number }) {
  const account = DEMO_ACCOUNTS.find((a) => a.key === step.account)!;
  return (
    <li className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</span>
      <div className="grid min-w-0 flex-1 gap-1.5">
        <p className="text-sm">
          <span className="font-semibold">{account.role}</span> — {step.detail}
        </p>
        <form action={demoSignIn}>
          <input type="hidden" name="account" value={step.account} />
          <input type="hidden" name="suite" value={step.path} />
          <SubmitButton size="sm" variant="secondary" pendingLabel="Connexion…">
            {step.label} <ArrowRight aria-hidden />
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}

/** Centre de démonstration : changer de rôle et suivre des scénarios guidés. */
export default async function DemoPage() {
  if (!isDemoMode()) notFound();
  const context = await getSessionContext();
  const current = context?.user.email ?? null;
  const currentAccount = DEMO_ACCOUNTS.find((a) => a.email === current);

  return (
    <div className="min-h-dvh bg-background">
      <header className="relative overflow-hidden bg-gradient-to-br from-[#07142b] via-[#0b2559] to-[#0e4a9a] text-white">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-cyan-400/20 blur-3xl [animation:float_14s_ease-in-out_infinite]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-10 size-96 rounded-full bg-blue-500/25 blur-3xl [animation:float_18s_ease-in-out_infinite_reverse]" />
        <div className="relative mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Logo inverted tagline />
            {context ? (
              <Link
                href={currentAccount?.key === "parent" || currentAccount?.key === "eleve" ? "/portail" : "/tableau-de-bord"}
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur hover:bg-white/20"
              >
                <LogIn className="size-4" aria-hidden /> Revenir à mon espace
              </Link>
            ) : null}
          </div>
          <div className="grid max-w-3xl gap-2">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-cyan-300">
              <PlayCircle className="size-4" aria-hidden /> Mode démonstration
            </p>
            <h1 className="text-3xl font-bold sm:text-4xl">Explorez NéoScol avec chaque rôle</h1>
            <p className="text-white/80">
              Chaque bouton ouvre une vraie session : vous voyez exactement ce que ce rôle a le droit de voir et de faire. Les données sont
              fictives ({currentAccount ? `connecté : ${currentAccount.role} — ${currentAccount.name}` : "non connecté"}).
            </p>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-8">
        <section className="grid gap-3" aria-labelledby="roles-title">
          <h2 id="roles-title" className="text-lg font-semibold">
            Changer de rôle
          </h2>
          <DemoRolePicker current={current} />
        </section>
        <section className="grid gap-3" aria-labelledby="scenarios-title">
          <h2 id="scenarios-title" className="text-lg font-semibold">
            Scénarios guidés
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {SCENARIOS.map((scenario, i) => (
              <article
                key={scenario.title}
                className="rise grid content-start gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm"
                style={{ "--delay": `${i * 60}ms` } as React.CSSProperties}
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0b2559] to-[#1d63ed] text-white">
                    <scenario.icon className="size-5" aria-hidden />
                  </span>
                  <div className="grid gap-0.5">
                    <h3 className="font-semibold">{scenario.title}</h3>
                    <p className="text-sm text-muted-foreground">{scenario.summary}</p>
                  </div>
                </div>
                <ol className="grid gap-3">
                  {scenario.steps.map((step, index) => (
                    <StepButton key={index} step={step} index={index} />
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
