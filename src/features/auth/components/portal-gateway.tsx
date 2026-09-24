"use client";

import { ArrowLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { PasswordSignInForm } from "@/features/auth/components/password-sign-in-form";
import { PhoneSignInForm } from "@/features/auth/components/phone-sign-in-form";
import { StudentSignInForm } from "@/features/auth/components/student-sign-in-form";
import { PORTALS, type PortalKind } from "@/features/auth/portals";
import { cn } from "@/lib/utils/cn";

const MAIN: PortalKind[] = ["parent", "enseignant", "eleve"];

/**
 * Page du lien des portails : choix du portail puis formulaire de connexion
 * correspondant. Le portail choisi est reflété dans l'adresse (?portail=…)
 * pour pouvoir partager un lien direct ; l'établissement et le portail sont
 * revérifiés côté serveur à la connexion.
 */
export function PortalGateway({ code, initial, next, accent }: { code: string; initial: PortalKind | null; next?: string; accent: string }) {
  const [kind, setKind] = useState<PortalKind | null>(initial);

  const choose = (value: PortalKind | null) => {
    setKind(value);
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("portail", value);
    else url.searchParams.delete("portail");
    window.history.replaceState(null, "", url);
  };

  if (!kind) {
    return (
      <div className="grid gap-3">
        <p className="text-sm font-medium text-muted-foreground">Choisissez votre portail :</p>
        <ul className="stagger grid gap-2.5">
          {MAIN.map((id) => {
            const { label, sub, icon: Icon, method } = PORTALS[id];
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => choose(id)}
                  className="hover-lift group flex w-full items-center gap-4 rounded-2xl border border-[#e3eaf6] bg-white/80 p-4 text-left transition-colors hover:border-primary/60 dark:border-slate-700 dark:bg-slate-900/60"
                >
                  <span
                    className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-[0_10px_24px_-12px_var(--portal-accent)] transition-transform duration-300 ease-[var(--ease-spring)] group-hover:scale-110"
                    style={{ background: `linear-gradient(135deg, ${accent}, #0ea5e9)`, "--portal-accent": accent } as React.CSSProperties}
                  >
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="font-semibold text-[#0b1f4d] dark:text-white">{label}</span>
                    <span className="text-xs text-muted-foreground">{sub}</span>
                    <span className="text-[11px] text-muted-foreground/90">{method}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-primary" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => choose("personnel")}
          className="justify-self-center rounded-full px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft/70"
        >
          Direction ou personnel administratif ? {PORTALS.personnel.label}
        </button>
      </div>
    );
  }

  const { label, sub, icon: Icon } = PORTALS[kind];
  const portal = { code, kind };
  return (
    <div key={kind} className="anim-fade-up grid gap-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => choose(null)}
          className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-white/70 text-muted-foreground transition-colors hover:border-primary hover:text-primary dark:bg-slate-900/60"
          aria-label="Changer de portail"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </button>
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl text-white")} style={{ background: `linear-gradient(135deg, ${accent}, #0ea5e9)` }}>
          <Icon className="anim-pop size-5" aria-hidden />
        </span>
        <span className="grid min-w-0">
          <span className="font-semibold text-[#0b1f4d] dark:text-white">{label}</span>
          <span className="text-xs text-muted-foreground">{sub}</span>
        </span>
      </div>
      {kind === "parent" ? (
        <PhoneSignInForm next={next} portal={portal} />
      ) : kind === "eleve" ? (
        <StudentSignInForm next={next} portal={portal} />
      ) : (
        <PasswordSignInForm next={next} portal={portal} />
      )}
    </div>
  );
}
