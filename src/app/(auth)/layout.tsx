import { Logo, LogoMark } from "@/components/shared/logo";

const AUDIENCES = ["Écoles", "Collèges et lycées", "Universités", "Formations professionnelles"];

/**
 * Pages d'authentification : fond bleu nuit animé (orbes cyan et bleues en
 * dérive lente) et carte en verre dépoli. Les animations sont coupées si
 * l'utilisateur a demandé moins de mouvement.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-dvh overflow-hidden bg-[#07142b] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,#123a86_0%,transparent_55%),radial-gradient(ellipse_at_bottom_right,#0e4a9a_0%,transparent_50%)]" />
        <div className="absolute -left-24 top-10 size-[28rem] rounded-full bg-cyan-400/25 blur-3xl [animation:float_16s_ease-in-out_infinite]" />
        <div className="absolute bottom-[-8rem] right-[-6rem] size-[32rem] rounded-full bg-blue-600/30 blur-3xl [animation:float_20s_ease-in-out_infinite_reverse]" />
        <div className="absolute right-1/3 top-1/3 size-72 rounded-full bg-sky-300/10 blur-3xl [animation:float_24s_ease-in-out_infinite]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>
      <aside className="relative hidden flex-col justify-between px-14 py-12 text-white lg:flex">
        <span className="flex items-center gap-4">
          <LogoMark inverted className="size-14" />
          <span className="flex flex-col">
            <span className="font-display text-3xl font-bold">NéoScol</span>
            <span className="text-sm text-sky-200/80">Plus qu&apos;un logiciel, une vision pour l&apos;éducation</span>
          </span>
        </span>
        <div className="grid max-w-lg gap-6">
          <h1 className="text-4xl font-semibold leading-tight xl:text-5xl">
            Gérez aujourd&apos;hui
            <br />
            <span className="bg-gradient-to-r from-cyan-300 to-sky-400 bg-clip-text text-transparent">l&apos;éducation de demain</span>
          </h1>
          <p className="text-base text-sky-100/80">
            Scolarité, pédagogie, finances, pointage par badge QR et documents officiels réunis dans une plateforme sécurisée.
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2.5 text-sm text-white/90">
            {AUDIENCES.map((audience) => (
              <li key={audience} className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.9)]" aria-hidden />
                {audience}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-sky-200/70">© NéoScol · Éduquer aujourd&apos;hui, bâtir demain</p>
      </aside>
      <main className="relative flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 lg:hidden">
          <Logo inverted tagline />
        </div>
        <div className="rise w-full max-w-md rounded-3xl border border-white/40 bg-white/85 p-6 shadow-[0_30px_80px_rgba(2,8,23,0.45)] backdrop-blur-xl sm:p-9 dark:border-white/10 dark:bg-slate-900/80">
          {children}
        </div>
      </main>
    </div>
  );
}
