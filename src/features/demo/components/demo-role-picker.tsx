import {
  BadgeCheck,
  Building2,
  Calculator,
  ClipboardList,
  GraduationCap,
  Landmark,
  Presentation,
  ScanLine,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { SubmitButton } from "@/components/shared/submit-button";
import { DEMO_ACCOUNTS, type DemoAccountKey } from "@/features/demo/accounts";
import { demoSignIn } from "@/features/demo/actions";
import { cn } from "@/lib/utils/cn";

const ICONS: Record<DemoAccountKey, LucideIcon> = {
  admin: ShieldCheck,
  direction: Building2,
  secretariat: ClipboardList,
  comptable: Calculator,
  enseignant: Presentation,
  parent: Users,
  eleve: GraduationCap,
  pointage: ScanLine,
  universite: Landmark,
  formation: Wrench,
};

/**
 * Choix d'un compte de démonstration : une vraie connexion (RLS et permissions
 * du rôle), sans saisir d'identifiants. Affiché uniquement en mode démonstration.
 */
export function DemoRolePicker({ current, variant = "cards", next }: { current?: string | null; variant?: "cards" | "compact"; next?: string }) {
  return (
    <ul className={cn("grid gap-2.5", variant === "cards" ? "sm:grid-cols-2 xl:grid-cols-4" : "grid-cols-2")}>
      {DEMO_ACCOUNTS.map((account, index) => {
        const Icon = ICONS[account.key];
        const active = current === account.email;
        return (
          <li key={account.key} className="rise" style={{ "--delay": `${index * 40}ms` } as React.CSSProperties}>
            <form action={demoSignIn} className="h-full">
              <input type="hidden" name="account" value={account.key} />
              {next ? <input type="hidden" name="suite" value={next} /> : null}
              <SubmitButton
                variant="secondary"
                disabled={active}
                pendingLabel="Connexion…"
                aria-label={`Se connecter en tant que ${account.role} (${account.name})`}
                className={cn(
                  "h-full w-full flex-col items-start justify-start gap-1 whitespace-normal rounded-2xl p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg",
                  variant === "compact" && "p-3",
                  active && "border-primary bg-primary-soft",
                )}
              >
                <span className="flex w-full items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="grid min-w-0 leading-tight">
                    <span className="truncate text-sm font-semibold">{account.role}</span>
                    <span className="truncate text-xs font-normal text-muted-foreground">{account.name}</span>
                  </span>
                  {active ? <BadgeCheck className="ml-auto size-4 text-primary" aria-label="Compte actuel" /> : null}
                </span>
                {variant === "cards" ? (
                  <span className="grid gap-0.5 text-xs font-normal text-muted-foreground">
                    <span>{account.description}</span>
                    {account.sees.map((line) => (
                      <span key={line} className="flex items-start gap-1.5">
                        <span className="mt-1.5 size-1 shrink-0 rounded-full bg-cyan-500" aria-hidden />
                        {line}
                      </span>
                    ))}
                  </span>
                ) : null}
              </SubmitButton>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
