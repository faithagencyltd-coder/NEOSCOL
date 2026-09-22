"use client";

import { Command } from "cmdk";
import { Search } from "lucide-react";
import { Dialog } from "radix-ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { NavIcon } from "@/components/layout/nav-icon";
import type { NavSection } from "@/config/navigation";

/** Centre de commande (Ctrl/⌘ + K) : accès rapide aux modules autorisés. */
export function CommandPalette({ sections }: { sections: NavSection[] }) {
  const [open, setOpen] = useState(false);
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-full max-w-md items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 text-sm text-muted-foreground transition-colors hover:border-input"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 truncate text-left">
          <span className="sm:hidden">Rechercher…</span>
          <span className="hidden sm:inline">Rechercher un module…</span>
        </span>
        <kbd className="hidden rounded border border-border bg-surface px-1.5 text-[11px] font-medium sm:inline">Ctrl K</kbd>
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
            <Dialog.Title className="sr-only">Centre de commande</Dialog.Title>
            <Dialog.Description className="sr-only">Tapez pour filtrer les modules, puis Entrée pour ouvrir.</Dialog.Description>
            <Command label="Centre de commande" className="flex flex-col">
              <div className="flex items-center gap-2 border-b border-border px-3">
                <Search className="size-4 text-muted-foreground" aria-hidden />
                <Command.Input autoFocus placeholder="Aller à…" className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              </div>
              <Command.List className="max-h-80 overflow-y-auto p-2">
                <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">Aucun résultat.</Command.Empty>
                {sections.map((section) => (
                  <Command.Group
                    key={section.label}
                    heading={section.label}
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {section.items.map((item) => (
                      <Command.Item
                        key={item.href}
                        value={`${item.label} ${item.keywords ?? ""}`}
                        onSelect={() => {
                          setOpen(false);
                          router.push(item.href);
                        }}
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
