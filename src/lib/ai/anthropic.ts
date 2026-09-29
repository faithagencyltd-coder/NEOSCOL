import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { loadIntegration } from "@/lib/messaging/server";
import type { ProviderResult } from "@/lib/messaging/providers";

/** Modèle utilisé par l'assistant. */
export const ASSISTANT_MODEL = "claude-opus-5";

/**
 * Clé Claude : saisie par le Super Admin dans la console (chiffrée, jamais
 * réaffichée), intégration active requise. La variable d'environnement
 * ANTHROPIC_API_KEY reste un repli pour les installations existantes.
 */
export async function anthropicClient(): Promise<Anthropic | null> {
  const integration = await loadIntegration("anthropic");
  if (integration?.secret) return new Anthropic({ apiKey: integration.secret });
  if (process.env.ANTHROPIC_API_KEY) return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return null;
}

/** Claude disponible pour l'assistant (clé de la console active, ou variable d'environnement). */
export async function aiAvailable(): Promise<boolean> {
  return (await loadIntegration("anthropic")) !== null || Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Test de la clé : lecture du modèle utilisé (aucune question envoyée, aucun coût). */
export async function anthropicCheck(apiKey: string): Promise<ProviderResult> {
  try {
    const model = await new Anthropic({ apiKey, maxRetries: 0, timeout: 15_000 }).models.retrieve(ASSISTANT_MODEL);
    return { ok: true, message: `Clé valide : modèle ${model.display_name} disponible.` };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { ok: false, error: "Clé Claude refusée (invalide ou révoquée)." };
    if (error instanceof Anthropic.PermissionDeniedError) return { ok: false, error: "Clé valide mais sans accès à ce modèle." };
    if (error instanceof Anthropic.APIError) return { ok: false, error: `Service Claude indisponible (${error.status ?? "réseau"}).` };
    return { ok: false, error: "Service Claude injoignable." };
  }
}
