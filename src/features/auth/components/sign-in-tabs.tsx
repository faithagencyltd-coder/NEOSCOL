"use client";

import { GraduationCap, Presentation, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { PasswordSignInForm } from "@/features/auth/components/password-sign-in-form";
import { PhoneSignInForm } from "@/features/auth/components/phone-sign-in-form";
import { StudentSignInForm } from "@/features/auth/components/student-sign-in-form";
import { cn } from "@/lib/utils/cn";

type Profile = "parent" | "student" | "teacher" | "staff";

const PROFILES: { id: Profile; label: string; short?: string; sub?: string; icon: LucideIcon }[] = [
  { id: "parent", label: "Parent / Tuteur", icon: Users },
  { id: "student", label: "Élève / Apprenant", sub: "Étudiant", icon: GraduationCap },
  { id: "teacher", label: "Enseignant", sub: "Formateur", icon: Presentation },
  { id: "staff", label: "Administrateur", short: "Admin.", sub: "Personnel", icon: ShieldCheck },
];

/**
 * Le profil ne donne aucun droit : il choisit seulement la méthode de connexion
 * (parent : téléphone + nom + prénom + code SMS ; élève : matricule + date de
 * naissance + mot de passe ; personnel : e-mail ou matricule + mot de passe).
 * Les droits viennent des rôles attribués par l'établissement.
 */
export function SignInTabs({ next }: { next?: string }) {
  const [profile, setProfile] = useState<Profile>("staff");

  return (
    <div className="grid gap-6">
      <div role="group" aria-label="Je suis" className="grid grid-cols-4 gap-1.5 rounded-2xl border border-[#e3eaf6] bg-white/70 p-1.5 dark:border-slate-700 dark:bg-slate-900/60">
        {PROFILES.map(({ id, label, short, sub, icon: Icon }) => {
          const selected = profile === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              onClick={() => setProfile(id)}
              className={cn(
                "group relative flex min-h-[4.75rem] flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-[11px] font-semibold leading-tight transition-all duration-300 ease-[var(--ease-out)] sm:text-xs",
                selected
                  ? "bg-gradient-to-br from-[#1d63ed] to-[#0ea5e9] text-white shadow-[0_10px_24px_-10px_rgba(29,99,237,0.9)]"
                  : "text-foreground/75 hover:-translate-y-0.5 hover:bg-primary-soft/60 hover:text-primary",
              )}
            >
              <Icon
                className={cn("size-6 transition-transform duration-300 ease-[var(--ease-spring)]", selected ? "anim-pop scale-110" : "group-hover:scale-110")}
                aria-hidden
              />
              {short ? (
                <>
                  <span className="sm:hidden">{short}</span>
                  <span className="hidden sm:inline">{label}</span>
                </>
              ) : (
                <span>{label}</span>
              )}
              {sub ? <span className={cn("text-[10px] font-medium", selected ? "text-white/80" : "text-muted-foreground")}>{sub}</span> : null}
            </button>
          );
        })}
      </div>

      <div key={profile} className="anim-fade-up">
        {profile === "parent" ? <PhoneSignInForm next={next} /> : profile === "student" ? <StudentSignInForm next={next} /> : <PasswordSignInForm next={next} />}
      </div>
    </div>
  );
}
