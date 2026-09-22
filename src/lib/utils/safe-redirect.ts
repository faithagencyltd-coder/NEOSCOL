/** N'accepte que des chemins internes pour éviter les redirections ouvertes. */
export function safeRedirectPath(value: unknown, fallback = "/tableau-de-bord"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
