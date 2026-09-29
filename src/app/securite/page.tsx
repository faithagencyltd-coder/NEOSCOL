import { ArrowLeft, Laptop, MonitorSmartphone, ShieldCheck, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { Logo } from "@/components/shared/logo";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MfaPanel, SignOutOthersButton } from "@/features/auth/components/security-panels";
import { revokeSession } from "@/features/auth/security-actions";
import { securityState } from "@/lib/auth/security";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sécurité du compte" };

function device(ua: string | null) {
  const s = ua ?? "";
  const os = /Android/i.test(s) ? "Android" : /iPhone|iPad/i.test(s) ? "iPhone / iPad" : /Windows/i.test(s) ? "Windows" : /Mac OS/i.test(s) ? "Mac" : /Linux/i.test(s) ? "Linux" : "Appareil";
  const browser = /Edg\//.test(s) ? "Edge" : /Chrome\//.test(s) ? "Chrome" : /Firefox\//.test(s) ? "Firefox" : /Safari\//.test(s) ? "Safari" : "Navigateur";
  return { label: `${browser} · ${os}`, mobile: /Android|iPhone|iPad|Mobile/i.test(s) };
}

/**
 * Sécurité du compte (tout utilisateur) : double authentification et appareils
 * connectés. Accessible même quand la double authentification est exigée mais
 * pas encore activée (c'est ici qu'on l'active).
 */
export default async function SecurityPage({ searchParams }: PageProps<"/securite">) {
  const params = await searchParams;
  const context = await getSessionContext();
  if (!context) redirect("/connexion?suite=/securite");
  const supabase = await createClient();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/connexion/verification?suite=/securite");
  const [state, { data: sessions }] = await Promise.all([securityState(), supabase.rpc("my_sessions")]);
  const required = Boolean(state?.mfa_required && state.sensitive);
  const back = state?.platform_admin ? "/plateforme" : "/tableau-de-bord";

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <Logo />
          {!required || state?.mfa_enrolled ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={back}>
                <ArrowLeft aria-hidden /> Retour
              </Link>
            </Button>
          ) : null}
        </div>
      </header>
      <main className="mx-auto grid max-w-4xl min-w-0 gap-6 px-4 py-8 sm:px-8 [&>*]:min-w-0">
        <div className="grid gap-1">
          <h1 className="text-2xl font-bold">Sécurité du compte</h1>
          <p className="text-sm text-muted-foreground">{context.user.email ?? context.user.phone}</p>
        </div>
        {params.obligatoire && !state?.mfa_enrolled ? (
          <Alert tone="warning" title="Double authentification obligatoire">
            Votre rôle donne accès à des données sensibles : activez la double authentification pour continuer.
          </Alert>
        ) : null}

        <Card className="anim-fade-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" aria-hidden /> Double authentification
            </CardTitle>
            <CardDescription>Contrôlée par le serveur : un compte protégé n&apos;a accès à aucune donnée tant que le code n&apos;est pas saisi.</CardDescription>
          </CardHeader>
          <CardContent>
            <MfaPanel enrolled={Boolean(state?.mfa_enrolled)} required={required} />
          </CardContent>
        </Card>

        <Card className="anim-fade-up" style={{ "--delay": "80ms" } as React.CSSProperties}>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <CardTitle className="flex items-center gap-2">
                <MonitorSmartphone className="size-5 text-primary" aria-hidden /> Appareils connectés
              </CardTitle>
              <CardDescription>Un appareil perdu ou inconnu ? Déconnectez-le : il devra saisir à nouveau le mot de passe.</CardDescription>
            </div>
            {(sessions?.length ?? 0) > 1 ? <SignOutOthersButton /> : null}
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2">
              {(sessions ?? []).map((s) => {
                const d = device(s.user_agent);
                const Icon = d.mobile ? Smartphone : Laptop;
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-3">
                    <span className="flex items-center gap-3">
                      <Icon className="size-5 text-muted-foreground" aria-hidden />
                      <span className="grid">
                        <span className="flex flex-wrap items-center gap-2 font-medium">
                          {d.label}
                          {s.current ? <Badge tone="success">Cet appareil</Badge> : null}
                          {s.aal === "aal2" ? <Badge tone="primary">Vérifié par code</Badge> : null}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {s.ip ?? "IP inconnue"} · dernière activité {new Date(s.updated_at ?? s.created_at).toLocaleString("fr-FR")}
                        </span>
                      </span>
                    </span>
                    {s.current ? null : (
                      <ConfirmAction
                        trigger={
                          <Button size="sm" variant="ghost" className="text-danger">
                            Déconnecter
                          </Button>
                        }
                        title="Déconnecter cet appareil ?"
                        description="La session sera fermée ; l'appareil devra se reconnecter."
                        confirmLabel="Déconnecter"
                        tone="danger"
                        action={revokeSession}
                        fields={{ session_id: s.id }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
