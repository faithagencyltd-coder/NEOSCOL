import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Chiffrement des clés des intégrations (AES-256-GCM), côté serveur uniquement.
 * Format : « v1:iv:tag:chiffré » (base64). La clé de chiffrement vient de
 * INTEGRATIONS_ENCRYPTION_KEY (32 octets en base64, recommandé) ou, à défaut,
 * est dérivée (HKDF) de la clé de service Supabase — jamais stockée en base.
 */
export function encryptionKeyFrom(env: Record<string, string | undefined>): Buffer | null {
  const dedicated = env.INTEGRATIONS_ENCRYPTION_KEY?.trim();
  if (dedicated) {
    const key = Buffer.from(dedicated, "base64");
    if (key.length !== 32) throw new Error("INTEGRATIONS_ENCRYPTION_KEY doit faire 32 octets (base64).");
    return key;
  }
  const service = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!service) return null;
  return Buffer.from(hkdfSync("sha256", service, "neoscol-integrations", "neoscol/integrations/v1", 32));
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(payload: string, key: Buffer): string {
  const [version, iv, tag, data] = payload.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Format de clé chiffrée inconnu.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

/** Indice affiché (4 derniers caractères) : permet de reconnaître la clé sans la révéler. */
export function secretHint(plain: string): string {
  const clean = plain.trim();
  return clean.length <= 8 ? "••••" : `••${clean.slice(-4)}`;
}
