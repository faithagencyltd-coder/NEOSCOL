import "server-only";

import webpush from "web-push";

import { loadIntegration } from "@/lib/messaging/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Notifications push (Web Push / VAPID). Clés de l'intégration « web_push »
 * (clé privée déchiffrée ici, jamais envoyée au navigateur). Chaque envoi part
 * réellement vers le service push du navigateur (Google, Mozilla, Apple…) ;
 * un appareil désabonné (404 / 410) est retiré.
 */
export type PushMessage = {
  title: string;
  body?: string | null;
  link?: string | null;
  tag?: string;
};
type Subscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};
type VapidDetails = { subject: string; publicKey: string; privateKey: string };

export async function loadVapid({
  requireEnabled = true,
} = {}): Promise<VapidDetails | null> {
  const integration = await loadIntegration("web_push", { requireEnabled });
  const publicKey = integration?.config.public_key;
  const subject = integration?.config.subject;
  if (!integration || !publicKey || !subject) return null;
  return { subject, publicKey, privateKey: integration.secret };
}

/** Vérifie une paire de clés VAPID (format) sans rien envoyer. */
export function checkVapid(details: VapidDetails): string | null {
  try {
    webpush.getVapidHeaders(
      "https://fcm.googleapis.com",
      details.subject,
      details.publicKey,
      details.privateKey,
      "aes128gcm",
    );
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Clés VAPID invalides.";
  }
}

export function generateVapidKeys() {
  return webpush.generateVAPIDKeys();
}

async function sendOne(
  sub: Subscription,
  message: PushMessage,
  vapid: VapidDetails,
): Promise<"sent" | "gone" | string> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({
        title: message.title,
        body: message.body ?? "",
        link: message.link ?? "/",
        tag: message.tag,
      }),
      {
        vapidDetails: vapid,
        TTL: 60 * 60 * 24,
        urgency: "normal",
        timeout: 10_000,
      },
    );
    return "sent";
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    return `${status ?? "réseau"} : ${e instanceof Error ? e.message : "échec"}`.slice(
      0,
      300,
    );
  }
}

/** Envoie un message à tous les appareils d'un utilisateur. */
export async function sendPushToUser(
  userId: string,
  message: PushMessage,
  vapid?: VapidDetails | null,
) {
  const admin = createAdminClient();
  const keys = vapid ?? (await loadVapid());
  if (!admin || !keys)
    return {
      sent: 0,
      failed: 0,
      devices: 0,
      error: "Notifications push non configurées par la plateforme.",
    };
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  let sent = 0;
  let failed = 0;
  let lastError: string | undefined;
  for (const sub of subs ?? []) {
    const outcome = await sendOne(sub, message, keys);
    if (outcome === "sent") {
      sent++;
      await admin
        .from("push_subscriptions")
        .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
        .eq("id", sub.id);
    } else if (outcome === "gone") {
      await admin.from("push_subscriptions").delete().eq("id", sub.id);
    } else {
      failed++;
      lastError = outcome;
      const { data: row } = await admin
        .from("push_subscriptions")
        .select("failure_count")
        .eq("id", sub.id)
        .maybeSingle();
      const count = (row?.failure_count ?? 0) + 1;
      // Appareil injoignable de façon répétée : retiré (l'utilisateur pourra le réactiver).
      if (count >= 10)
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      else
        await admin
          .from("push_subscriptions")
          .update({ failure_count: count })
          .eq("id", sub.id);
    }
  }
  return { sent, failed, devices: subs?.length ?? 0, error: lastError };
}

/** Traite la file des notifications push en attente (route planifiée). */
export async function processPushQueue(limit = 100) {
  const admin = createAdminClient();
  if (!admin)
    return { ok: false as const, error: "Configuration serveur incomplète." };
  const vapid = await loadVapid();
  if (!vapid)
    return {
      ok: true as const,
      processed: 0,
      sent: 0,
      skipped: "Notifications push non configurées.",
    };
  const { data: batch, error } = await admin.rpc("claim_push_deliveries", {
    p_limit: limit,
  });
  if (error) return { ok: false as const, error: error.message };
  let sent = 0;
  for (const d of batch ?? []) {
    const result = await sendPushToUser(
      d.user_id,
      {
        title: d.title,
        body: d.body
          ? `${d.organization_name} — ${d.body}`
          : d.organization_name,
        link: d.link,
        tag: d.delivery_id,
      },
      vapid,
    );
    const update =
      result.sent > 0
        ? {
            status: "sent",
            sent_at: new Date().toISOString(),
            last_error: null,
            provider_reference: `${result.sent}/${result.devices} appareil(s)`,
          }
        : result.devices === 0
          ? { status: "skipped", last_error: "Aucun appareil abonné" }
          : { status: "pending", last_error: result.error ?? "Échec d'envoi" };
    await admin
      .from("notification_deliveries")
      .update(update)
      .eq("id", d.delivery_id);
    if (result.sent > 0) sent++;
  }
  return { ok: true as const, processed: batch?.length ?? 0, sent };
}
