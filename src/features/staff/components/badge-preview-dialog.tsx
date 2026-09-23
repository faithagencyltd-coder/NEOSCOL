"use client";

import { Eye } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

/** Aperçu agrandi d'un badge (le badge est rendu côté serveur et passé en enfant). */
export function BadgePreviewDialog({ name, children, printHref }: { name: string; children: ReactNode; printHref?: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" aria-label={`Aperçu du badge de ${name}`}>
          <Eye aria-hidden /> Aperçu
        </Button>
      </DialogTrigger>
      <DialogContent title={`Badge — ${name}`} description="Aperçu au format carte (54 × 86 mm), tel qu'il sera imprimé.">
        <div className="flex justify-center py-2 [&>div]:max-w-[320px]">{children}</div>
        {printHref ? (
          <Button asChild>
            <a href={printHref} target="_blank" rel="noreferrer">
              Imprimer ce badge (PDF)
            </a>
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
