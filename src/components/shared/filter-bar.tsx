"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils/cn";

export type FilterOption = { value: string; label: string };
export type FilterDef = { name: string; label: string; options: FilterOption[] };

/** Recherche (avec délai) + filtres synchronisés dans l'URL ; revient à la page 1 à chaque changement. */
export function FilterBar({ placeholder, filters = [] }: { placeholder: string; filters?: FilterDef[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <div className={cn("flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:px-5", pending && "opacity-80")} role="search">
      <label className="relative flex-1">
        <span className="sr-only">Rechercher</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={query}
          placeholder={placeholder}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => update("q", value.trim()), 300);
          }}
          className="h-11 w-full rounded-xl border border-input bg-surface pl-10 pr-3 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        />
      </label>
      {filters.map((filter) => (
        <label key={filter.name} className="sm:w-48">
          <span className="sr-only">{filter.label}</span>
          <Select
            value={params.get(filter.name) ?? ""}
            onChange={(event) => update(filter.name, event.target.value)}
            className="h-11"
          >
            <option value="">{filter.label}</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
      ))}
    </div>
  );
}
