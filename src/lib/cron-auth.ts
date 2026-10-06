import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * Protection des tâches planifiées (/api/cron/*) : Vercel Cron envoie
 * « Authorization: Bearer <CRON_SECRET> » lorsque la variable CRON_SECRET est
 * définie dans le projet Vercel. Renvoie une réponse 401 si l'appel n'est pas
 * autorisé, null sinon. La cause est journalisée côté serveur (jamais la valeur).
 */
export function cronUnauthorized(request: Request, route: string): Response | null {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  const provided = header?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret) {
    console.error(`[cron] ${route} refusé : la variable CRON_SECRET n'est pas définie sur le serveur (Vercel › Settings › Environment Variables, puis redéployer).`);
    return new Response("Non autorisé.", { status: 401 });
  }
  if (!header) {
    console.error(`[cron] ${route} refusé : en-tête Authorization absent (appel hors Vercel Cron, ou CRON_SECRET ajoutée après le dernier déploiement).`);
    return new Response("Non autorisé.", { status: 401 });
  }
  if (provided.length !== secret.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
    console.error(`[cron] ${route} refusé : jeton différent de CRON_SECRET.`);
    return new Response("Non autorisé.", { status: 401 });
  }
  return null;
}
