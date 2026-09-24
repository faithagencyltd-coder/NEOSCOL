"use client";

import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import { useState, type ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Champ des écrans de connexion : icône à gauche (s'anime au focus), halo de
 * focus, affichage / masquage du mot de passe. Le libellé reste accessible.
 */
export function AuthInput({
  icon: Icon,
  label,
  error,
  hint,
  className,
  type = "text",
  ...props
}: Omit<ComponentProps<"input">, "id"> & { id: string; icon: LucideIcon; label: string; error?: string; hint?: string }) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  const describedBy = error ? `${props.id}-error` : hint ? `${props.id}-hint` : undefined;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={props.id} className="sr-only">
        {label}
      </label>
      <div
        className={cn(
          "group relative flex h-14 items-center rounded-2xl border bg-white/90 shadow-sm transition-[border-color,box-shadow,transform] duration-200 dark:bg-slate-900/70",
          "focus-within:-translate-y-px focus-within:border-primary focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--primary)_14%,transparent)]",
          error ? "border-danger anim-shake" : "border-[#dbe4f3] hover:border-primary/40 dark:border-slate-700",
        )}
      >
        <span className="flex h-full w-14 shrink-0 items-center justify-center text-primary">
          <Icon className="size-5 transition-transform duration-300 ease-[var(--ease-spring)] group-focus-within:scale-110 group-focus-within:-rotate-6" aria-hidden />
        </span>
        <span aria-hidden className="h-7 w-px bg-border" />
        <input
          {...props}
          type={isPassword && visible ? "text" : type}
          placeholder={props.placeholder ?? label}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn("h-full min-w-0 flex-1 bg-transparent px-4 text-[15px] text-foreground outline-none placeholder:text-muted-foreground/80", className)}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="mr-2 flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-muted hover:text-primary"
            aria-pressed={visible}
            title={visible ? "Masquer" : "Afficher"}
          >
            <span className="sr-only">{visible ? "Masquer la saisie" : "Afficher la saisie"}</span>
            {visible ? <EyeOff className="anim-pop size-5" aria-hidden /> : <Eye className="anim-pop size-5" aria-hidden />}
          </button>
        ) : null}
      </div>
      {error ? (
        <p id={`${props.id}-error`} role="alert" className="anim-fade-up px-1 text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${props.id}-hint`} className="px-1 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Bouton principal des écrans de connexion : dégradé, flèche animée, chargement réel. */
export function AuthSubmit({ children, pending, pendingLabel }: { children: React.ReactNode; pending: boolean; pendingLabel: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn(
        "group relative flex h-14 w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-[#1d63ed] via-[#1a73f0] to-[#0ea5e9] px-6 text-base font-semibold text-white shadow-[0_14px_30px_-12px_rgba(29,99,237,0.8)]",
        "transition-[transform,box-shadow,filter] duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-12px_rgba(29,99,237,0.9)] active:scale-[0.98] disabled:cursor-wait disabled:opacity-90",
      )}
    >
      <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      {pending ? (
        <span aria-hidden className="size-5 rounded-full border-2 border-white/40 border-t-white [animation:spin-slow_0.8s_linear_infinite]" />
      ) : null}
      <span>{pending ? pendingLabel : children}</span>
      {!pending ? (
        <span aria-hidden className="absolute right-3 flex size-9 items-center justify-center rounded-full bg-white/20 transition-transform duration-300 group-hover:translate-x-1">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      ) : null}
    </button>
  );
}
