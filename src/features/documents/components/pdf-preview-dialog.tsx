"use client";

import { Download, Eye, ExternalLink } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

/**
 * Aperçu d'un PDF officiel dans une fenêtre modale (le document est réellement
 * généré par le serveur, avec contrôle des permissions et journalisation).
 */
export function PdfPreviewDialog({ href, title, disabled }: { href: string; title: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const separator = href.includes("?") ? "&" : "?";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" disabled={disabled} aria-label={`Aperçu — ${title}`}>
          <Eye aria-hidden /> Aperçu
        </Button>
      </DialogTrigger>
      <DialogContent title={title} description="Aperçu du document officiel (PDF avec QR de vérification)." className="max-w-4xl">
        {open ? <iframe src={href} title={`Aperçu — ${title}`} className="h-[70vh] w-full rounded-xl border border-border bg-surface-muted" /> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild variant="secondary">
            <a href={href} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden /> Ouvrir dans un onglet
            </a>
          </Button>
          <Button asChild>
            <a href={`${href}${separator}telecharger=1`} download>
              <Download aria-hidden /> Télécharger
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
