/**
 * File d'envoi hors ligne (IndexedDB, sur l'appareil).
 * Règle de confidentialité : uniquement des identifiants, statuts et horodatages
 * — jamais de nom ni de donnée personnelle lisible. Chaque élément porte un
 * identifiant unique (idempotence serveur) et l'identité du compte qui l'a saisi
 * (il n'est envoyé que par ce compte).
 */
export type OutboxKind = "lesson_attendance" | "staff_scan";

export type OutboxItem = {
  id: string;
  kind: OutboxKind;
  userId: string;
  organizationId: string;
  capturedAt: string;
  payload: Record<string, unknown>;
  attempts: number;
  error: string | null;
  failed: boolean;
};

const DB = "neoscol-offline";
const STORE = "outbox";
export const OUTBOX_EVENT = "neoscol:outbox";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const changed = () => window.dispatchEvent(new Event(OUTBOX_EVENT));

export async function enqueue(item: Omit<OutboxItem, "id" | "attempts" | "error" | "failed" | "capturedAt"> & { capturedAt?: string }): Promise<OutboxItem> {
  const full: OutboxItem = { id: crypto.randomUUID(), capturedAt: new Date().toISOString(), attempts: 0, error: null, failed: false, ...item };
  await run("readwrite", (s) => s.put(full));
  changed();
  return full;
}

/** Éléments du compte, dans l'ordre de saisie. */
export async function listOutbox(userId: string): Promise<OutboxItem[]> {
  try {
    const all = await run<OutboxItem[]>("readonly", (s) => s.getAll() as IDBRequest<OutboxItem[]>);
    return all.filter((i) => i.userId === userId).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  } catch {
    return [];
  }
}

export async function removeItem(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
  changed();
}

export async function updateItem(item: OutboxItem): Promise<void> {
  await run("readwrite", (s) => s.put(item));
  changed();
}

/** Erreur réseau (serveur injoignable) : l'élément reste en attente. */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const message = error instanceof Error ? error.message : String(error);
  return error instanceof TypeError || /fetch|network|Failed to|Load failed/i.test(message);
}
