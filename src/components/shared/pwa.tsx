"use client";

import { Download, Share } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Enregistre le service worker (production uniquement : pas d'interférence avec le rechargement à chaud). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  }, []);
  return null;
}

/** « Installer l'application » : invite native (Chromium) ou instructions (iOS). */
export function InstallAppButton() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [accepted, setAccepted] = useState(false);
  const standalone = useSyncExternalStore(
    () => () => undefined,
    () => window.matchMedia("(display-mode: standalone)").matches,
    () => false,
  );
  const ios = useSyncExternalStore(
    () => () => undefined,
    () => /iphone|ipad|ipod/i.test(navigator.userAgent),
    () => false,
  );
  const installed = standalone || accepted;
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (installed) return <p className="text-sm text-success">Application installée sur cet appareil.</p>;
  if (event) {
    return (
      <Button
        variant="secondary"
        onClick={async () => {
          await event.prompt();
          const choice = await event.userChoice;
          if (choice.outcome === "accepted") setAccepted(true);
          setEvent(null);
        }}
      >
        <Download aria-hidden /> Installer l&apos;application
      </Button>
    );
  }
  if (ios) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Share className="size-4" aria-hidden /> Pour installer NéoScol : bouton Partager, puis « Sur l&apos;écran d&apos;accueil ».
      </p>
    );
  }
  return <p className="text-sm text-muted-foreground">NéoScol s&apos;installe depuis le menu du navigateur (« Installer l&apos;application »).</p>;
}
