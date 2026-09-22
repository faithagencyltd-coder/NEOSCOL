"use client";

import { Building2, GraduationCap, Presentation, Users, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { PasswordSignInForm } from "@/features/auth/components/password-sign-in-form";
import { PhoneSignInForm } from "@/features/auth/components/phone-sign-in-form";
import { cn } from "@/lib/utils/cn";

type Profile = "parent" | "student" | "teacher" | "staff";
type Method = "email" | "phone";

const PROFILES: { id: Profile; label: string; icon: LucideIcon; method: Method }[] = [
  { id: "parent", label: "Parent / Tuteur", icon: Users, method: "phone" },
  { id: "student", label: "Élève / Apprenant", icon: GraduationCap, method: "email" },
  { id: "teacher", label: "Enseignant", icon: Presentation, method: "email" },
  { id: "staff", label: "Administration", icon: Building2, method: "email" },
];

/**
 * Le profil ne donne aucun droit : il choisit seulement la méthode de connexion
 * par défaut (téléphone + SMS pour les parents, e-mail pour les autres).
 * Les droits viennent des rôles attribués par l'établissement.
 */
export function SignInTabs({ next }: { next?: string }) {
  const [profile, setProfile] = useState<Profile>("staff");
  const [override, setOverride] = useState<Method | null>(null);
  const method = override ?? PROFILES.find((p) => p.id === profile)?.method ?? "email";

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
                onClick={() => {
                  setProfile(id);
                  setOverride(null);
                }}
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

      {method === "phone" ? <PhoneSignInForm next={next} /> : <PasswordSignInForm next={next} />}

      <button
        type="button"
        onClick={() => setOverride(method === "phone" ? "email" : "phone")}
        className="justify-self-center text-sm font-medium text-primary hover:underline"
      >
        {method === "phone" ? "Se connecter avec une adresse e-mail" : "Se connecter avec un numéro de téléphone"}
      </button>
    </div>
  );
}
