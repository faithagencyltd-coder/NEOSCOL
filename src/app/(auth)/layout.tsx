import { Building2, CheckCircle2, GraduationCap, Landmark, School, ShieldCheck, Wallet, Wrench } from "lucide-react";

import { LogoMark } from "@/components/shared/logo";

const SECTORS = [
  { label: "Écoles", icon: School },
  { label: "Collèges", icon: Building2 },
  { label: "Lycées", icon: GraduationCap },
  { label: "Universités", icon: Landmark },
  { label: "Formations professionnelles", icon: Wrench },
];

/** Aperçus flottants du produit (illustration, sans données réelles). */
const PREVIEWS = [
  { title: "Appel validé", detail: "Présences enregistrées", icon: CheckCircle2, tone: "text-emerald-400", pos: "left-[10%] top-[18%]", delay: "0s" },
  { title: "Paiement reçu", detail: "Accès famille rétabli", icon: Wallet, tone: "text-amber-300", pos: "right-[7%] top-[22%]", delay: "-4s" },
  { title: "Bulletin publié", detail: "QR de vérification", icon: ShieldCheck, tone: "text-sky-300", pos: "left-[26%] top-[29%]", delay: "-8s" },
];

/**
 * Écrans d'authentification (référence visuelle du client) : panneau de marque
 * bleu nuit animé à gauche, carte en verre dépoli à droite. Animations douces,
 * coupées si l'utilisateur demande moins de mouvement.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-dvh overflow-hidden bg-[#eef3fb] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] dark:bg-[#07142b]">
      {/* Fond clair animé (côté formulaire) */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -right-24 -top-24 size-[30rem] rounded-full bg-sky-300/30 blur-3xl [animation:blob_22s_ease-in-out_infinite]" />
        <div className="absolute -bottom-32 right-1/4 size-[26rem] rounded-full bg-amber-200/40 blur-3xl [animation:blob_26s_ease-in-out_infinite_reverse]" />
      </div>

      {/* Panneau de marque */}
      <aside className="relative hidden overflow-hidden rounded-r-[3rem] bg-[#07142b] text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between lg:self-start lg:px-14 lg:py-12">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,#1b4fb3_0%,transparent_55%),radial-gradient(ellipse_at_bottom_right,#0e4a9a_0%,transparent_55%)]" />
          <div className="absolute -left-24 top-10 size-[26rem] rounded-full bg-cyan-400/20 blur-3xl [animation:blob_18s_ease-in-out_infinite]" />
          <div className="absolute bottom-[-8rem] right-[-6rem] size-[30rem] rounded-full bg-blue-600/30 blur-3xl [animation:blob_24s_ease-in-out_infinite_reverse]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />
        </div>

        <div className="anim-fade-up relative flex items-center gap-5">
          <span className="flex size-24 items-center justify-center rounded-3xl bg-white/10 shadow-[0_0_60px_rgba(56,189,248,0.25)] ring-1 ring-white/15 backdrop-blur">
            <LogoMark inverted className="size-16" />
          </span>
          <span className="grid gap-1">
            <span className="font-display text-5xl font-bold tracking-tight">
              Néo<span className="bg-gradient-to-r from-sky-300 to-cyan-300 bg-clip-text text-transparent">Scol</span>
            </span>
            <span className="text-base text-sky-100/85">
              Plus qu&apos;un logiciel, une <strong className="text-white">vision</strong> pour{" "}
              <span className="relative text-sky-300">
                l&apos;éducation
                <span aria-hidden className="absolute -bottom-1.5 left-1/4 h-1 w-1/2 origin-left rounded-full bg-amber-400 [animation:grow-width_700ms_var(--ease-out)_400ms_both]" />
              </span>
            </span>
          </span>
        </div>

        <div className="relative grid max-w-xl gap-6">
          <h1 className="anim-fade-up text-4xl font-semibold leading-tight [--delay:120ms] xl:text-5xl">
            Gérez aujourd&apos;hui
            <br />
            l&apos;éducation de <span className="bg-gradient-to-r from-sky-300 to-cyan-300 bg-clip-text text-transparent">demain</span>
          </h1>
          <ul className="stagger flex flex-wrap gap-2.5 text-sm">
            {SECTORS.map(({ label, icon: Icon }) => (
              <li key={label} className="flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 ring-1 ring-white/10 backdrop-blur transition-colors hover:bg-white/15">
                <Icon className="size-4 text-sky-300" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
          <p className="anim-fade-up max-w-md text-base italic text-sky-100/80 [--delay:300ms]">
            Ensemble pour une éducation de qualité
            <span aria-hidden className="mt-1 block h-0.5 w-24 rounded-full bg-amber-400" />
          </p>
        </div>

        {PREVIEWS.map(({ title, detail, icon: Icon, tone, pos, delay }) => (
          <div
            key={title}
            aria-hidden
            className={`pointer-events-none absolute ${pos} hidden items-center xl:[@media(min-height:840px)]:flex gap-3 rounded-2xl bg-white/10 px-4 py-3 shadow-2xl ring-1 ring-white/15 backdrop-blur-md`}
            style={{ animation: `float 12s ease-in-out ${delay} infinite` }}
          >
            <Icon className={`size-6 ${tone}`} />
            <span className="grid text-left">
              <span className="text-sm font-semibold">{title}</span>
              <span className="text-xs text-sky-100/70">{detail}</span>
            </span>
          </div>
        ))}

        <ul className="relative grid grid-cols-3 gap-3 rounded-2xl bg-white/[0.06] p-4 text-xs ring-1 ring-white/10 backdrop-blur">
          {[
            ["De l'école à l'université", "un seul logiciel, vocabulaire adapté"],
            ["Multi-établissements", "données isolées par établissement"],
            ["Plateforme sécurisée", "droits contrôlés côté serveur"],
          ].map(([t, d]) => (
            <li key={t} className="grid gap-0.5">
              <span className="font-semibold text-white">{t}</span>
              <span className="text-sky-100/70">{d}</span>
            </li>
          ))}
        </ul>
      </aside>

      {/* Formulaire */}
      <main className="relative flex flex-col items-center justify-center px-4 py-8 sm:px-8">
        <div className="mb-6 flex w-full max-w-lg items-center justify-between">
          <span className="flex items-center gap-2.5 lg:hidden">
            <LogoMark className="size-10" />
            <span className="font-display text-xl font-bold text-[#0b1f4d] dark:text-white">NéoScol</span>
          </span>
          <span className="ml-auto hidden items-center gap-3 text-sm sm:flex">
            <span className="font-display font-semibold text-primary">NéoScol</span>
            <span className="h-4 w-px bg-border" aria-hidden />
            <span className="text-muted-foreground">Votre réussite, notre priorité</span>
            <span aria-hidden className="h-0.5 w-8 rounded-full bg-amber-400" />
          </span>
        </div>
        <div className="glass anim-fade-up w-full max-w-lg rounded-[2rem] p-6 shadow-[0_30px_80px_-30px_rgba(11,31,77,0.45)] sm:p-9 dark:border-white/10">
          {children}
        </div>
      </main>
    </div>
  );
}
