/** Traduit une erreur PostgreSQL/PostgREST en message compréhensible pour l'utilisateur. */
export function dbErrorMessage(error: { code?: string; message?: string } | null | undefined, fallback = "L'opération a échoué."): string {
  if (!error) return fallback;
  const message = error.message ?? "";
  if (message.includes("row-level security") || error.code === "42501") {
    // Les refus émis par nos triggers sont déjà en français ; ceux de la RLS sont génériques.
    return /^[A-ZÉÈÀÇ]/.test(message) && !message.startsWith("new row") && !message.startsWith("permission")
      ? message
      : "Vous n'avez pas les droits nécessaires pour cette opération.";
  }
  if (error.code === "23505") return /^[A-ZÉÈÀÇ]/.test(message) && !message.startsWith("duplicate") ? message : "Cet élément existe déjà.";
  if (error.code === "23503") return "Un élément lié est introuvable ou encore utilisé.";
  if (error.code === "22P02" || error.code === "22007") return "Une valeur saisie n'a pas le bon format.";
  if (["23514", "P0001", "P0002", "22023"].includes(error.code ?? "") && /^[A-ZÉÈÀÇÀ«]/.test(message)) {
    return message; // messages métier rédigés en français dans les triggers et fonctions
  }
  return fallback;
}
