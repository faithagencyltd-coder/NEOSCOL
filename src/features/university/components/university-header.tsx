import { GraduationCap } from "lucide-react";
import type { ReactNode } from "react";

/**
 * En-tête des pages du Module 3 : identifie clairement le contexte
 * « UNIVERSITÉ / ENSEIGNEMENT SUPÉRIEUR » (identité visuelle propre, distincte
 * des modules Scolaire et Formation professionnelle).
 */
export function UniversityHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="anim-fade-up relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#0e7490] px-5 py-6 text-white shadow-lg sm:px-8">
      <svg aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-64 opacity-[0.12]" viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="90" stroke="currentColor" strokeWidth="2" />
        <circle cx="100" cy="100" r="62" stroke="currentColor" strokeWidth="2" />
        <circle cx="100" cy="100" r="34" stroke="currentColor" strokeWidth="2" />
      </svg>
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid min-w-0 gap-1.5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
            <GraduationCap className="size-4" aria-hidden />
            {eyebrow ?? "Université / Enseignement supérieur"}
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {description ? <p className="max-w-3xl text-sm text-indigo-100">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2 [&_a]:shadow-sm">{actions}</div> : null}
      </div>
    </header>
  );
}
