import { timingSafeEqual } from "node:crypto";

import { receiveWebhook } from "@/features/billing/server";

const MAX_BODY = 64 * 1024;

function secretMatches(provided: string | null): boolean {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return true; // Recommandé en production ; la vérification fournisseur reste la preuve.
  if (!provided || provided.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}

/**
 * Notification serveur à serveur d'un fournisseur (IPN / webhook).
 * Le contenu n'est jamais cru : l'identifiant qu'il porte est revérifié
 * auprès du fournisseur, puis le paiement est appliqué de façon idempotente.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/payments/[provider]">) {
  const { provider } = await ctx.params;
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(provider)) return new Response("Fournisseur inconnu.", { status: 404 });
  if (!secretMatches(new URL(request.url).searchParams.get("cle"))) return new Response("Non autorisé.", { status: 401 });

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
  const result = await receiveWebhook(provider, body, ip);
  // 200 même en cas de rejet métier (journalisé) : évite les renvois en boucle ; 500 si incident serveur.
  return Response.json({ ok: result.status !== "error", status: result.status }, { status: result.status === "error" ? 500 : 200 });
}
