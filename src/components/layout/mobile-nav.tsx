"use client";

import { Menu, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState } from "react";

import { SidebarNav } from "@/components/layout/sidebar-nav";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import type { NavSection } from "@/config/navigation";

export function MobileNav({ sections, organizationName }: { sections: NavSection[]; organizationName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Ouvrir le menu">
          <Menu />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[82vw] max-w-xs flex-col gap-6 bg-sidebar p-4 shadow-xl lg:hidden">
          <div className="flex items-center justify-between">
            <Logo inverted />
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-sidebar-active" aria-label="Fermer le menu">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Title className="px-3 text-sm font-medium text-white">{organizationName}</Dialog.Title>
          <Dialog.Description className="sr-only">Navigation principale de NéoScol</Dialog.Description>
          <SidebarNav sections={sections} onNavigate={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
