"use client";

import { Building2, GraduationCap, Presentation, Users, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { PasswordSignInForm } from "@/features/auth/components/password-sign-in-form";
import { PhoneSignInForm } from "@/features/auth/components/phone-sign-in-form";
import { StudentSignInForm } from "@/features/auth/components/student-sign-in-form";
import { cn } from "@/lib/utils/cn";

type Profile = "parent" | "student" | "teacher" | "staff";

const PROFILES: { id: Profile; label: string; icon: LucideIcon }[] = [
  { id: "parent", label: "Parent / Tuteur", icon: Users },
  { id: "student", label: "Élève / Apprenant", icon: GraduationCap },
  { id: "teacher", label: "Enseignant", icon: Presentation },
  { id: "staff", label: "Administration", icon: Building2 },
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
      <fieldset className="grid gap-2.5">
        <legend className="mb-2.5 text-sm font-semibold">Je suis</legend>
        <div className="grid grid-cols-2 gap-2.5">
          {PROFILES.map(({ id, label, icon: Icon }) => {
            const selected = profile === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                onClick={() => setProfile(id)}
                className={cn(
                  "flex min-h-12 items-center gap-2.5 rounded-xl px-3 text-left text-sm font-semibold transition-colors",
                  selected
                    ? "border-2 border-primary bg-primary-soft text-primary"
                    : "border border-input bg-surface text-foreground/80 hover:border-primary/50",
                )}
              >
                <Icon className="size-[18px] shrink-0" aria-hidden />
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div key={profile} className="animate-[fade-in_0.25s_ease-out]">
        {profile === "parent" ? (
          <PhoneSignInForm next={next} />
        ) : profile === "student" ? (
          <StudentSignInForm next={next} />
        ) : (
          <PasswordSignInForm next={next} />
        )}
      </div>
    </div>
  );
}
