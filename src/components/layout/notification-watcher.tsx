"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { pollNotifications } from "@/features/notifications/actions";

const INTERVAL_MS = 45_000;

/** Ton du toast selon le type de notification (absence, paiement, bulletin…). */
function tone(type: string): "success" | "warning" | "error" | "info" {
  if (/payment|paid|unlock|validated|published/.test(type)) return "success";
  if (/absence|late|overdue|reminder|restrict/.test(type)) return "warning";
  if (/denied|rejected|cancel/.test(type)) return "error";
  return "info";
}

/**
 * Notifications en direct : interroge le serveur toutes les 45 s (onglet
 * visible uniquement), affiche un toast pour chaque nouveauté et met à jour
 * le compteur de la cloche.
 */
export function NotificationWatcher() {
  const router = useRouter();
  const since = useRef<string | null>(null);

  useEffect(() => {
    since.current = new Date().toISOString();
    let busy = false;
    const tick = async () => {
      if (busy || document.visibilityState !== "visible" || !since.current) return;
      busy = true;
      try {
        const items = await pollNotifications(since.current);
        if (items.length) {
          since.current = items[0]!.created_at;
          for (const item of items.slice().reverse()) {
            toast[tone(item.type)](item.title, {
              description: item.body ?? undefined,
              action: item.link ? { label: "Voir", onClick: () => router.push(item.link!) } : undefined,
            });
          }
          router.refresh();
        }
      } catch {
        // Réseau indisponible : nouvel essai au prochain intervalle.
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(tick, INTERVAL_MS);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
