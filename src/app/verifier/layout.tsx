import { Logo } from "@/components/shared/logo";

/** Pages publiques de vérification des documents (QR Code). */
export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-lg content-center gap-6 px-4 py-10">
      <Logo tagline />
      {children}
      <p className="text-center text-xs text-muted-foreground">
        Service public de vérification NéoScol : seules les informations strictement nécessaires sont affichées.
      </p>
    </main>
  );
}
