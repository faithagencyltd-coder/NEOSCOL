import { receiveFeeWebhook } from "@/features/fee-payments/server";

const MAX_BODY = 64 * 1024;

/**
 * Notification serveur à serveur d'un fournisseur de paiement d'établissement.
 * L'adresse contient un jeton aléatoire propre au fournisseur (il désigne
 * l'établissement : jamais d'identifiant d'établissement envoyé par l'appelant).
 * Le contenu n'est jamais cru : l'identifiant qu'il porte est revérifié auprès
 * du fournisseur, puis appliqué de façon idempotente.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/school-payments/[token]">) {
  const { token } = await ctx.params;
  const raw = await request.text();
  if (raw.length > MAX_BODY) return new Response("Contenu trop volumineux.", { status: 413 });
  let body: unknown = {};
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) body = JSON.parse(raw || "{}");
    else body = Object.fromEntries(new URLSearchParams(raw));
  } catch {
    return new Response("Contenu illisible.", { status: 400 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const result = await receiveFeeWebhook(token, body, ip);
  if (!result.known) return new Response("Adresse inconnue.", { status: 404 });
  // 200 même en cas de rejet métier (journalisé) : évite les renvois en boucle ; 500 si incident serveur.
  return Response.json({ ok: result.status !== "error", status: result.status }, { status: result.status === "error" ? 500 : 200 });
}
