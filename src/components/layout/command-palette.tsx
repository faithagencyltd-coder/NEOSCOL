"use client";

import { Command } from "cmdk";
import { Loader2, Search } from "lucide-react";
import { Dialog } from "radix-ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { NavIcon } from "@/components/layout/nav-icon";
import type { NavSection } from "@/config/navigation";
import { globalSearch, type SearchResult } from "@/features/search/actions";
import { normalizeSearch } from "@/lib/utils/search-params";

/** Centre de commande (Ctrl/⌘ + K) : modules autorisés + recherche globale (RLS appliquée). */
export function CommandPalette({ sections }: { sections: NavSection[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(href);
  };

  const onQueryChange = (value: string) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => startTransition(async () => setResults(await globalSearch(value))), 250);
  };

  const needle = normalizeSearch(query.trim());
  const navMatches = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !needle || normalizeSearch(`${item.label} ${item.keywords ?? ""}`).includes(needle)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-full max-w-xl items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 text-sm text-muted-foreground transition-colors hover:border-input"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 truncate text-left">
          <span className="sm:hidden">Rechercher…</span>
          <span className="hidden sm:inline">Rechercher un élève, un parent, une classe…</span>
        </span>
        <kbd className="hidden rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] font-semibold sm:inline">Ctrl K</kbd>
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-[10vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
            <Dialog.Title className="sr-only">Centre de commande</Dialog.Title>
            <Dialog.Description className="sr-only">
              Tapez pour rechercher un élève, un parent, une classe, une inscription ou un module.
            </Dialog.Description>
            <Command label="Centre de commande" shouldFilter={false} className="flex flex-col">
              <div className="flex items-center gap-2 border-b border-border px-3">
                <Search className="size-4 text-muted-foreground" aria-hidden />
                <Command.Input
                  autoFocus
                  value={query}
                  onValueChange={onQueryChange}
                  placeholder="Nom, matricule, classe, référence ou module…"
                  className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Recherche en cours" /> : null}
              </div>
              <Command.List className="max-h-[60vh] overflow-y-auto p-2">
                {results.length === 0 && navMatches.length === 0 && !pending ? (
                  <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">Aucun résultat.</Command.Empty>
                ) : null}
                {results.length > 0 ? (
                  <Command.Group
                    heading="Résultats"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {results.map((result) => (
                      <Command.Item
                        key={`${result.type}-${result.id}`}
                        value={`${result.type}-${result.id}`}
                        onSelect={() => go(result.href)}
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-surface-muted"
                      >
                        <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-primary">{result.label}</span>
                        <span className="grid min-w-0">
                          <span className="truncate font-medium">{result.title}</span>
                          {result.subtitle ? <span className="truncate text-xs text-muted-foreground">{result.subtitle}</span> : null}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                ) : null}
                {navMatches.map((section) => (
                  <Command.Group
                    key={section.label}
                    heading={section.label}
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {section.items.map((item) => (
                      <Command.Item
                        key={item.href}
                        value={item.href}
                        onSelect={() => go(item.href)}
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-surface-muted"
                      >
                        <NavIcon name={item.icon} className="size-4 text-muted-foreground" />
                        {item.label}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
              </Command.List>
            </Command>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
