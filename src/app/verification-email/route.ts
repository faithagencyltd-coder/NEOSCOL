import { NextResponse } from "next/server";

import { sha256 } from "@/lib/auth/security";
import { createAdminClient } from "@/lib/supabase/admin";

/** Lien reçu par e-mail : active l'établissement (jeton haché, usage unique, contrôlé en base). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("jeton") ?? "";
  const admin = createAdminClient();
  if (!admin || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return NextResponse.redirect(new URL("/connexion?erreur=verification", url));
  const { data } = await admin.rpc("verify_organization_email", { p_token_hash: sha256(token) });
  const ok = (data as { ok?: boolean } | null)?.ok === true;
  return NextResponse.redirect(new URL(ok ? "/tableau-de-bord?email=verifie" : "/connexion?erreur=verification", url));
}
