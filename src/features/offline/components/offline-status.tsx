"use client";

import { CloudOff, CloudUpload, RefreshCw, Trash2, Wifi } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { notify } from "@/components/motion/animated-toast";
import { Button } from "@/components/ui/button";
import { isNetworkError, listOutbox, OUTBOX_EVENT, removeItem, updateItem, type OutboxItem, type OutboxKind } from "@/lib/offline/outbox";
import { cn } from "@/lib/utils/cn";

import { syncLessonAttendance, syncStaffScan, type SyncOutcome } from "../actions";

const SENDERS: Record<OutboxKind, (item: OutboxItem) => Promise<SyncOutcome>> = {
  lesson_attendance: (item) => syncLessonAttendance({ id: item.id, capturedAt: item.capturedAt, payload: item.payload }),
  staff_scan: (item) => syncStaffScan({ id: item.id, capturedAt: item.capturedAt, payload: item.payload }),
};
const LABEL: Record<OutboxKind, string> = { lesson_attendance: "Appel", staff_scan: "Pointage" };

/** État du réseau vu par le navigateur. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Synchronise la file d'envoi de ce compte : au chargement, au retour du réseau,
 * à chaque nouvelle saisie et toutes les 30 s. Dans l'ordre de saisie ; une
 * coupure arrête le passage (réessai plus tard) ; un refus du serveur est
 * conservé avec son motif, jamais effacé en silence.
 */
export function useOutboxSync(userId: string, kinds: OutboxKind[], onSynced?: (item: OutboxItem, outcome: SyncOutcome) => void) {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const busy = useRef(false);
  const kindsKey = kinds.join(",");
  const syncedRef = useRef(onSynced);
  useEffect(() => {
    syncedRef.current = onSynced;
  }, [onSynced]);

  const refresh = useCallback(async () => {
    const wanted = kindsKey.split(",");
    setItems((await listOutbox(userId)).filter((i) => wanted.includes(i.kind)));
  }, [userId, kindsKey]);

  const flush = useCallback(async () => {
    if (busy.current || !navigator.onLine) return;
    busy.current = true;
    setSyncing(true);
    try {
      const wanted = kindsKey.split(",");
      for (const item of (await listOutbox(userId)).filter((i) => wanted.includes(i.kind) && !i.failed)) {
        let outcome: SyncOutcome;
        try {
          outcome = await SENDERS[item.kind](item);
        } catch (error) {
          if (isNetworkError(error)) break;
          outcome = { ok: false, message: "Envoi impossible." };
        }
        if (outcome.ok) {
          await removeItem(item.id);
          syncedRef.current?.(item, outcome);
        } else {
          await updateItem({ ...item, attempts: item.attempts + 1, failed: true, error: outcome.message });
        }
      }
    } finally {
      busy.current = false;
      setSyncing(false);
      await refresh();
    }
  }, [userId, kindsKey, refresh]);

  useEffect(() => {
    // Premier passage différé : la page reste interactive pendant la lecture d'IndexedDB.
    const first = setTimeout(() => void refresh().then(flush), 0);
    const onOnline = () => void flush();
    const onChange = () => void refresh().then(() => (navigator.onLine ? flush() : undefined));
    window.addEventListener("online", onOnline);
    window.addEventListener(OUTBOX_EVENT, onChange);
    const timer = setInterval(() => void flush(), 30_000);
    return () => {
      clearTimeout(first);
      window.removeEventListener("online", onOnline);
      window.removeEventListener(OUTBOX_EVENT, onChange);
      clearInterval(timer);
    };
  }, [refresh, flush]);

  return { items, syncing, flush, refresh };
}

/** Bandeau hors ligne : état du réseau, saisies en attente, refus à traiter. */
export function OfflineStatus({ userId, kinds, className }: { userId: string; kinds: OutboxKind[]; className?: string }) {
  const router = useRouter();
  const online = useOnline();
  const { items, syncing, flush } = useOutboxSync(userId, kinds, (item, outcome) => {
    if (outcome.ok && !outcome.duplicate) notify.success(`${LABEL[item.kind]} saisi hors ligne : enregistré.`);
    router.refresh();
  });
  const pending = items.filter((i) => !i.failed);
  const failed = items.filter((i) => i.failed);
  if (online && items.length === 0) return null;

  return (
    <div
      data-testid="offline-status"
      role="status"
      className={cn("grid gap-2 rounded-2xl border px-4 py-3 text-sm", online ? "border-info/30 bg-info-soft" : "border-warning/40 bg-warning-soft", className)}
    >
      <div className="flex flex-wrap items-center gap-3">
        {online ? <Wifi className="size-4 text-info" aria-hidden /> : <CloudOff className="size-4 text-warning" aria-hidden />}
        <span className="font-semibold">{online ? "Connexion rétablie" : "Hors ligne"}</span>
        <span className="text-muted-foreground">
          {pending.length
            ? `${pending.length} saisie(s) en attente sur cet appareil${online ? "" : " — envoi automatique au retour du réseau"}.`
            : online
              ? ""
              : "Les saisies sont gardées sur l'appareil (sans données personnelles) puis envoyées au retour du réseau."}
        </span>
        {online && pending.length ? (
          <Button type="button" size="sm" variant="secondary" onClick={() => void flush()} disabled={syncing} className="ml-auto">
            {syncing ? <RefreshCw className="animate-spin motion-reduce:animate-none" aria-hidden /> : <CloudUpload aria-hidden />} Synchroniser
          </Button>
        ) : null}
      </div>
      {failed.length ? (
        <ul className="grid gap-1" aria-label="Saisies refusées">
          {failed.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-3 py-2" data-testid="offline-failed">
              <span className="font-medium">
                {LABEL[i.kind]} du {new Date(i.capturedAt).toLocaleString("fr-FR")}
              </span>
              <span className="text-danger">{i.error}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto text-danger"
                onClick={() => {
                  if (window.confirm("Retirer cette saisie refusée de l'appareil ? Elle ne sera pas enregistrée.")) void removeItem(i.id);
                }}
              >
                <Trash2 aria-hidden /> Retirer
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
