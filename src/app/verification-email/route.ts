import { NextResponse } from "next/server";

import { sha256 } from "@/lib/auth/security";
import { createAdminClient } from "@/lib/supabase/admin";

/** Lien reçu par e-mail : active l'établissement, ou confirme l'adresse d'un compte particulier (jeton haché, usage unique, contrôlé en base). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("jeton") ?? "";
  const admin = createAdminClient();
  if (!admin || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return NextResponse.redirect(new URL("/connexion?erreur=verification", url));
  const { data } = await admin.rpc("verify_organization_email", { p_token_hash: sha256(token) });
  if ((data as { ok?: boolean } | null)?.ok === true) return NextResponse.redirect(new URL("/tableau-de-bord?email=verifie", url));
  // Sinon : lien de confirmation d'un compte particulier (NeoScool Opportunities).
  const { data: account } = await admin.rpc("verify_public_account_email", { p_token_hash: sha256(token) });
  const ok = (account as { ok?: boolean } | null)?.ok === true;
  return NextResponse.redirect(new URL(ok ? "/espace?email=confirme" : "/connexion?erreur=verification", url));
}
