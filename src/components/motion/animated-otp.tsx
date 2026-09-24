"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Saisie d'un code à usage unique, case par case : focus animé, avance
 * automatique, collage du code complet, secousse en cas d'erreur, validation
 * verte en cas de succès. La valeur est transmise via un champ caché `name`.
 */
export function AnimatedOTP({
  length = 6,
  value,
  onChange,
  name,
  status = "idle",
  disabled,
  autoFocus,
  label = "Code reçu par SMS",
}: {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  name: string;
  status?: "idle" | "verifying" | "success" | "error";
  disabled?: boolean;
  autoFocus?: boolean;
  label?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");
  const focus = (i: number) => refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();

  const setAt = (i: number, digit: string) => {
    const next = digits.slice();
    next[i] = digit;
    onChange(next.join("").slice(0, length));
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      e.preventDefault();
      setAt(i - 1, "");
      focus(i - 1);
    } else if (e.key === "ArrowLeft") focus(i - 1);
    else if (e.key === "ArrowRight") focus(i + 1);
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const code = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!code) return;
    e.preventDefault();
    onChange(code);
    focus(code.length);
  };

  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <input type="hidden" name={name} value={value} />
      <div key={status === "error" ? `err-${value}` : "otp"} className={cn("flex justify-between gap-2", status === "error" && "anim-shake")}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            aria-label={`Chiffre ${i + 1} sur ${length}`}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            autoFocus={autoFocus && i === 0}
            value={d}
            onChange={(e) => {
              const digit = e.target.value.replace(/\D/g, "").slice(-1);
              setAt(i, digit);
              if (digit) focus(i + 1);
            }}
            onKeyDown={(e) => onKey(i, e)}
            onPaste={onPaste}
            onFocus={(e) => e.target.select()}
            className={cn(
              "h-14 w-full min-w-0 rounded-xl border-2 bg-surface text-center font-display text-2xl font-bold tabular-nums outline-none transition-all duration-200",
              "focus:-translate-y-0.5 focus:border-primary focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--primary)_18%,transparent)]",
              d ? "border-primary/60 anim-pop" : "border-input",
              status === "success" && "border-success bg-success-soft text-success",
              status === "error" && "border-danger bg-danger-soft text-danger",
              status === "verifying" && "animate-pulse",
            )}
            style={status === "success" ? { transitionDelay: `${i * 50}ms` } : undefined}
          />
        ))}
      </div>
    </fieldset>
  );
}
