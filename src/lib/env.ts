/** Variables publiques (disponibles côté navigateur). */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

export function isSupabaseConfigured(): boolean {
  return publicEnv.supabaseUrl.length > 0 && publicEnv.supabaseAnonKey.length > 0;
}

/** Noms des variables Supabase publiques manquantes (jamais leurs valeurs). */
export function missingSupabaseEnv(): string[] {
  const missing: string[] = [];
  if (!publicEnv.supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!publicEnv.supabaseAnonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return missing;
}

/**
 * Indices de diagnostic (côté serveur uniquement) : variable présente au moment de
 * l'exécution mais absente à la compilation (les NEXT_PUBLIC_* sont figées au build),
 * ou variable créée sous un autre nom que celui lu par l'application.
 */
export function supabaseEnvHints(): string[] {
  if (typeof window !== "undefined") return [];
  const runtime = (name: string) => Boolean(process.env[name]?.trim());
  const hints: string[] = [];
  for (const name of missingSupabaseEnv()) {
    if (runtime(name)) hints.push(`${name} est définie mais n'existait pas lors de la compilation : relancez un déploiement (Redeploy).`);
  }
  const lookalikes: Record<string, string[]> = {
    NEXT_PUBLIC_SUPABASE_URL: ["SUPABASE_URL"],
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY"],
  };
  for (const name of missingSupabaseEnv()) {
    for (const other of lookalikes[name] ?? []) {
      if (runtime(other)) hints.push(`${other} existe, mais l'application lit ${name} : créez ${name} avec la même valeur.`);
    }
  }
  return hints;
}

/** Erreur explicite (noms des variables, jamais leurs valeurs) au lieu du message générique de Supabase. */
export function assertSupabaseConfigured(where: string): void {
  const missing = missingSupabaseEnv();
  if (!missing.length) return;
  const hints = supabaseEnvHints();
  throw new Error(
    `Configuration Supabase manquante (${where}) : ${missing.join(", ")} non définie(s). ` +
      "Ajoutez-les dans les variables d'environnement (Vercel › Settings › Environment Variables), puis redéployez." +
      (hints.length ? ` ${hints.join(" ")}` : ""),
  );
}
