"use client";

import { ChevronDown, CreditCard, FileBadge, FileSpreadsheet, FileStack, FileText, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";

/** « Documents ▾ » : documents les plus demandés, en un clic (même PDF que l'onglet Documents). */
export function DocumentsMenu({
  studentId,
  university,
  transcript,
  generate,
}: {
  studentId: string;
  university: boolean;
  transcript: boolean;
  generate: boolean;
}) {
  const pdf = (href: string, label: string, Icon: typeof FileText) => (
    <DropdownMenuItem asChild>
      <a href={href} target="_blank" rel="noopener">
        <Icon aria-hidden /> {label}
      </a>
    </DropdownMenuItem>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" data-testid="documents-menu">
          <FileText aria-hidden /> Documents <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {generate ? (
          <>
            {pdf(`/api/documents/certificats/${studentId}`, "Certificat de scolarité", FileBadge)}
            {university ? pdf(`/api/documents/certificats/${studentId}?type=enrollment_certificate`, "Attestation d'inscription", FileBadge) : null}
            {pdf(`/api/documents/cartes/${studentId}`, university ? "Carte étudiant" : "Carte scolaire", CreditCard)}
            {transcript && !university ? pdf(`/api/documents/releves/${studentId}`, "Relevé de notes", FileSpreadsheet) : null}
          </>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="?onglet=documents" scroll={false}>
            <FileStack aria-hidden /> Tous les documents (attestations, dossier complet…)
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * « ⋯ » : actions du dossier (inscrire, modifier, photo, statut, archiver…).
 * Le panneau reste monté quand il se ferme : les fenêtres qu'il ouvre
 * (photo, statut, archivage) restent affichées.
 */
export function MoreActions({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (box.current?.contains(target) || target.closest("[role=dialog]")) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <Button variant="secondary" size="icon" aria-label="Plus d'actions" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="more-actions">
        <MoreHorizontal aria-hidden />
      </Button>
      <div
        role="menu"
        aria-label="Actions du dossier"
        onClickCapture={() => setTimeout(() => setOpen(false), 0)}
        className={cn(
          "menu-anim absolute right-0 top-full z-30 mt-2 grid min-w-56 gap-0.5 rounded-xl border border-border bg-surface p-1.5 shadow-lg",
          "[&_a]:w-full [&_a]:justify-start [&_a]:border-0 [&_a]:bg-transparent [&_a]:shadow-none [&_a:hover]:bg-surface-muted",
          "[&_button]:w-full [&_button]:justify-start [&_button]:border-0 [&_button]:bg-transparent [&_button]:shadow-none [&_button:hover]:bg-surface-muted",
          !open && "hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}
