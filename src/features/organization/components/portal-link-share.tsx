"use client";

import { Check, Copy, Download, ExternalLink, Mail, MessageCircle, MessageSquareText, Share2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { notify } from "@/components/motion/animated-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Contexte non sécurisé (http sur le réseau local) : repli sur une zone de texte temporaire.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/** Bouton de copie avec retour visuel (coche animée). */
export function CopyLinkButton({ text, label = "Copier", className, size = "md" }: { text: string; label?: string; className?: string; size?: "md" | "sm" }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size={size}
      variant={copied ? "secondary" : "primary"}
      className={className}
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          notify.success("Lien copié", "Collez-le dans WhatsApp, un SMS, un e-mail ou sur votre site.");
          window.setTimeout(() => setCopied(false), 2000);
        } else {
          notify.error("Copie impossible", "Sélectionnez le lien et copiez-le manuellement.");
        }
      }}
    >
      {copied ? <Check className="anim-pop" aria-hidden /> : <Copy aria-hidden />} {copied ? "Copié" : label}
    </Button>
  );
}

const noopSubscribe = () => () => undefined;

/**
 * Partage du lien des portails : copie, WhatsApp, SMS, e-mail, partage natif
 * du téléphone, QR code téléchargeable.
 */
export function PortalLinkShare({ url, organizationName, qr, fileCode }: { url: string; organizationName: string; qr: string; fileCode: string }) {
  // Partage natif (téléphones) : détecté côté navigateur uniquement.
  const canShare = useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator.share === "function",
    () => false,
  );

  const message = `${organizationName} — Connectez-vous à votre portail (Parent, Enseignant / Formateur, Élève / Étudiant) avec vos identifiants personnels : ${url}`;
  const links = [
    { label: "WhatsApp", icon: MessageCircle, href: `https://wa.me/?text=${encodeURIComponent(message)}`, tone: "hover:border-[#25D366] hover:text-[#128C7E]" },
    { label: "SMS", icon: MessageSquareText, href: `sms:?&body=${encodeURIComponent(message)}`, tone: "hover:border-primary hover:text-primary" },
    {
      label: "E-mail",
      icon: Mail,
      href: `mailto:?subject=${encodeURIComponent(`Accès aux portails — ${organizationName}`)}&body=${encodeURIComponent(message)}`,
      tone: "hover:border-primary hover:text-primary",
    },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
      <div className="grid content-start gap-4">
        <div className="grid gap-2">
          <label htmlFor="portal-link" className="text-sm font-medium">
            Lien à partager
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="portal-link"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface-muted/60 px-3 font-mono text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
            <div className="flex gap-2">
              <CopyLinkButton text={url} label="Copier le lien" className="flex-1 sm:flex-none" />
              <Button asChild variant="secondary" size="icon" aria-label="Ouvrir le lien dans un nouvel onglet">
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden />
                </a>
              </Button>
            </div>
          </div>
        </div>
        <div className="grid gap-2">
          <p className="text-sm font-medium">Partager</p>
          <div className="stagger flex flex-wrap gap-2">
            {links.map(({ label, icon: Icon, href, tone }) => (
              <a
                key={label}
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer"
                className={cn("hover-lift inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-sm font-semibold transition-colors", tone)}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </a>
            ))}
            {canShare ? (
              <button
                type="button"
                onClick={() => navigator.share({ title: organizationName, text: message, url }).catch(() => undefined)}
                className="hover-lift inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-sm font-semibold transition-colors hover:border-primary hover:text-primary"
              >
                <Share2 className="size-4" aria-hidden /> Autres applications
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <figure className="anim-pop grid justify-items-center gap-2 self-start rounded-2xl border border-border bg-white p-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- QR généré côté serveur (data URL) */}
        <img src={qr} alt={`QR code du lien ${url}`} className="size-40" />
        <figcaption className="text-xs text-slate-600">Scanner pour ouvrir</figcaption>
        <a href={qr} download={`qr-portails-${fileCode}.png`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          <Download className="size-3.5" aria-hidden /> Télécharger le QR
        </a>
      </figure>
    </div>
  );
}
