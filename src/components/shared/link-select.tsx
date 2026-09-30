"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Select } from "@/components/ui/select";
import { useWording } from "@/components/shared/wording";

/** Liste déroulante de navigation : chaque option mène à une URL (état dans l'URL). */
export function LinkSelect({
  label,
  value,
  options,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; href: string }[];
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const word = useWording();
  return (
    <label className={className}>
      <span className="sr-only">{word(label)}</span>
      <Select
        value={value}
        aria-label={word(label)}
        disabled={pending}
        onChange={(event) => {
          const target = options.find((o) => o.value === event.target.value);
          if (target) startTransition(() => router.push(target.href));
        }}
        className="h-11"
      >
        {placeholder ? <option value="">{word(placeholder)}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {/* Seule l'option générale (« Toutes les classes ») suit le module ; les noms saisis restent intacts. */}
            {option.value === "" ? word(option.label) : option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
