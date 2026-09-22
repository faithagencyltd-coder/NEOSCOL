import { Logo } from "@/components/shared/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo inverted />
        <div className="grid max-w-md gap-4">
          <p className="text-3xl font-semibold leading-tight">Plus qu&apos;un logiciel, une vision pour l&apos;éducation.</p>
          <p className="text-sidebar-foreground">
            Scolarité, pédagogie, finances et documents officiels réunis dans une plateforme sécurisée pour les
            écoles, universités et centres de formation.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground">© NéoScol</p>
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/5" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 right-16 size-72 rounded-full bg-white/5" />
      </aside>
      <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 lg:hidden">
          <Logo />
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
