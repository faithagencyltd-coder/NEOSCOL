"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Select } from "@/components/ui/select";

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
  return (
    <label className={className}>
      <span className="sr-only">{label}</span>
      <Select
        value={value}
        aria-label={label}
        disabled={pending}
        onChange={(event) => {
          const target = options.find((o) => o.value === event.target.value);
          if (target) startTransition(() => router.push(target.href));
        }}
        className="h-11"
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
