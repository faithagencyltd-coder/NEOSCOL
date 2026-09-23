"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { demoAccount } from "@/features/demo/accounts";
import { ACTIVE_ORG_COOKIE } from "@/lib/auth/session";
import { demoPassword, isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

/**
 * Connexion à un compte de démonstration (mode démonstration uniquement).
 * La session obtenue est une session normale : la RLS et les permissions du
 * rôle s'appliquent exactement comme pour une connexion classique.
 */
export async function demoSignIn(formData: FormData): Promise<void> {
  if (!isDemoMode()) redirect("/connexion");
  const account = demoAccount(String(formData.get("account") ?? ""));
  if (!account) redirect("/connexion");
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(ACTIVE_ORG_COOKIE);
  const { error } = await supabase.auth.signInWithPassword({ email: account.email, password: demoPassword() });
  if (error) redirect("/connexion?erreur=demo");
  const { data: org } = await supabase.from("organizations").select("id").eq("is_demo", true).limit(1).maybeSingle();
  await supabase.rpc("log_event", {
    p_organization_id: org?.id,
    p_action: "auth.login",
    p_summary: `Connexion (démonstration : ${account.role})`,
  });
  const next = String(formData.get("suite") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : account.key === "pointage" ? "/pointage" : account.key === "parent" || account.key === "eleve" ? "/portail" : "/tableau-de-bord");
}
