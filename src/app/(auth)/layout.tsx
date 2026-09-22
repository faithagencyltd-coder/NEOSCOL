import { Logo, LogoMark } from "@/components/shared/logo";

const AUDIENCES = ["Écoles", "Collèges et lycées", "Universités", "Formations professionnelles"];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-sidebar px-14 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <span className="relative z-10 flex items-center gap-4">
          <LogoMark inverted className="size-14" />
          <span className="flex flex-col">
            <span className="font-display text-3xl font-bold">NéoScol</span>
            <span className="text-sm text-sidebar-foreground">Plus qu&apos;un logiciel, une vision pour l&apos;éducation</span>
          </span>
        </span>
        <div className="relative z-10 grid max-w-lg gap-6">
          <h1 className="text-4xl font-semibold leading-tight xl:text-5xl">
            Gérez aujourd&apos;hui
            <br />
            l&apos;éducation de demain
          </h1>
          <p className="text-base text-sidebar-foreground">
            Scolarité, pédagogie, finances et documents officiels réunis dans une plateforme sécurisée.
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2.5 text-sm text-white/90">
            {AUDIENCES.map((audience) => (
              <li key={audience} className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-accent" aria-hidden />
                {audience}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-xs text-sidebar-foreground/80">© NéoScol · Éduquer aujourd&apos;hui, bâtir demain</p>
        <div aria-hidden className="pointer-events-none absolute -right-36 -top-36 size-[26rem] rounded-full border-[56px] border-sidebar-muted" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 size-[22rem] rounded-full border-[40px] border-sidebar-muted/70" />
      </aside>
      <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 lg:hidden">
          <Logo tagline />
        </div>
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-[0_20px_50px_rgba(11,37,89,0.08)] sm:p-9">
          {children}
        </div>
      </main>
    </div>
  );
}
