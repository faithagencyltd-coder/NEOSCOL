import "server-only";

import type { Client } from "@/features/documents/server";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type UploadOwner = "student" | "staff" | "organization" | "absence_justification" | "expense" | "enrollment";

const SIGNATURES: { mime: string; bytes: number[] }[] = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
];

/** Type réel du fichier d'après sa signature (le type annoncé par le navigateur n'est pas fiable). */
export function detectMime(bytes: Uint8Array): string | null {
  return SIGNATURES.find((s) => s.bytes.every((b, i) => bytes[i] === b))?.mime ?? null;
}

/**
 * Enregistre un fichier en base (file_objects, D-15). La RLS vérifie le droit
 * d'écriture selon le type de propriétaire.
 */
export async function storeUpload(
  supabase: Client,
  input: { organizationId: string; file: File; owner: UploadOwner; ownerId?: string | null; category?: string; accept: ("pdf" | "image")[] },
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const { file } = input;
  if (!file || file.size === 0) return { ok: false, message: "Aucun fichier sélectionné." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, message: "Fichier trop volumineux (5 Mo maximum)." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectMime(bytes);
  const allowed = (mime === "application/pdf" && input.accept.includes("pdf")) || (mime?.startsWith("image/") && input.accept.includes("image"));
  if (!mime || !allowed) {
    return { ok: false, message: input.accept.includes("pdf") ? "Formats acceptés : PDF, JPEG ou PNG." : "Formats acceptés : JPEG ou PNG." };
  }
  const name = (file.name || "fichier").replace(/[/\\]/g, "_").slice(0, 150);
  const { data, error } = await supabase
    .from("file_objects")
    .insert({
      organization_id: input.organizationId,
      bucket: "database",
      path: `${input.organizationId}/${input.owner}/${crypto.randomUUID()}`,
      owner_type: input.owner,
      owner_id: input.ownerId ?? null,
      category: input.category ?? null,
      file_name: name,
      mime_type: mime,
      size_bytes: bytes.length,
      content: `\\x${Buffer.from(bytes).toString("hex")}`,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: "Le fichier n'a pas pu être enregistré (droits insuffisants ou fichier invalide)." };
  return { ok: true, id: data.id };
}
