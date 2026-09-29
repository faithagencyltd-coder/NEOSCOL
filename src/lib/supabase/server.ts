import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Client Supabase côté serveur, authentifié avec la session de l'utilisateur.
 * Toutes les requêtes passent par la RLS (voir docs/ARCHITECTURE.md, D-03).
 */
export async function createClient() {
  const cookieStore = await cookies();
  // Appareil réel de l'utilisateur (liste « Appareils connectés ») : navigateur et IP transmis au service d'authentification.
  const h = await headers();
  const forwarded: Record<string, string> = {};
  const userAgent = h.get("user-agent");
  const ip = h.get("x-forwarded-for");
  if (userAgent) forwarded["user-agent"] = userAgent.slice(0, 300);
  if (ip) forwarded["x-forwarded-for"] = ip.split(",")[0]!.trim().slice(0, 64);

  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    global: { headers: forwarded },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Appel depuis un Server Component : le proxy rafraîchit déjà la session.
        }
      },
    },
  });
}
