"use client";

import { Bell, BellOff, BellRing } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { Button } from "@/components/ui/button";
import {
  registerPushDevice,
  unregisterPushDevice,
} from "@/features/notifications/actions";

type State = "loading" | "unsupported" | "denied" | "off" | "on";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(sub: PushSubscription, publicKey: string) {
  const current = sub.options.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current);
  const b = keyBytes(publicKey);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function registration() {
  return (
    (await navigator.serviceWorker.getRegistration("/")) ??
    (await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    }))
  );
}

async function save(sub: PushSubscription) {
  const json = sub.toJSON();
  return registerPushDevice({
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
  });
}

/**
 * Active / désactive les notifications push sur cet appareil. La clé publique
 * VAPID vient du serveur ; si elle a changé, l'appareil se réabonne seul.
 */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (
        !publicKey ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      )
        return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration("/");
      let sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub && !sameKey(sub, publicKey)) {
        // Clés régénérées par la plateforme : réabonnement transparent.
        await sub.unsubscribe().catch(() => undefined);
        sub =
          Notification.permission === "granted" && reg
            ? await reg.pushManager
                .subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: keyBytes(publicKey),
                })
                .catch(() => null)
            : null;
      }
      if (sub) await save(sub);
      if (!cancelled) setState(sub ? "on" : "off");
    })().catch(() => !cancelled && setState("off"));
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  if (state === "loading") return null;
  if (state === "unsupported") {
    return (
      <p
        className="flex items-center gap-2 text-sm text-muted-foreground"
        data-testid="push-toggle"
        data-state="unsupported"
      >
        <BellOff className="size-4" aria-hidden />
        {publicKey
          ? "Ce navigateur ne reçoit pas les notifications push (sur iPhone : installez d'abord l'application)."
          : "Notifications push non activées par la plateforme."}
      </p>
    );
  }
  if (state === "denied") {
    return (
      <p
        className="flex items-center gap-2 text-sm text-warning"
        data-testid="push-toggle"
        data-state="denied"
      >
        <BellOff className="size-4" aria-hidden /> Notifications bloquées dans
        le navigateur : autorisez-les dans les réglages du site.
      </p>
    );
  }

  const enable = () =>
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = await registration();
        await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: keyBytes(publicKey!),
          }));
        const result = await save(sub);
        notifyResult(result);
        if (result.ok) setState("on");
        else await sub.unsubscribe().catch(() => undefined);
      } catch {
        notifyResult({
          ok: false,
          message: "Activation impossible sur ce navigateur.",
        });
      }
    });

  const disable = () =>
    startTransition(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await unregisterPushDevice(sub.endpoint);
        await sub.unsubscribe().catch(() => undefined);
      }
      notifyResult({
        ok: true,
        message: "Notifications désactivées sur cet appareil.",
      });
      setState("off");
    });

  return state === "on" ? (
    <div
      className="flex flex-wrap items-center gap-3"
      data-testid="push-toggle"
      data-state="on"
    >
      <span className="flex items-center gap-2 text-sm text-success">
        <BellRing className="size-4" aria-hidden /> Notifications activées sur
        cet appareil
      </span>
      <Button variant="ghost" size="sm" onClick={disable} disabled={pending}>
        Désactiver
      </Button>
    </div>
  ) : (
    <Button
      variant="secondary"
      size="sm"
      onClick={enable}
      disabled={pending}
      data-testid="push-toggle"
      data-state="off"
    >
      <Bell aria-hidden /> Activer les notifications sur cet appareil
    </Button>
  );
}
