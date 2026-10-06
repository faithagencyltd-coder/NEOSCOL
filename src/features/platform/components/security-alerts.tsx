import { CircleCheck, Eye, ShieldAlert, UserCog } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type SecurityAlerts = {
  days: number;
  repeated_failures: { identifier: string; failures: number; last: string }[];
  denied: { created_at: string; action: string; actor_email: string | null; organization: string | null }[];
  spraying: { ip: string; accounts: number; failures: number; last: string }[];
  new_devices: { created_at: string; actor_email: string | null; organization: string | null; device: string }[];
  many_addresses: { actor_email: string | null; addresses: number; last: string }[];
  changes: { created_at: string; action: string; actor_email: string | null; organization: string | null; summary: string | null }[];
};

const when = (iso: string) => new Date(iso).toLocaleString("fr-FR");

/** Navigateur et système lisibles à partir de l'identifiant d'appareil. */
function deviceLabel(ua: string): string {
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navigateur";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone / iPad" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "système inconnu";
  return `${browser} sur ${os}${/NeoScoolApp\//.test(ua) ? " (application)" : ""}`;
}

function Empty({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-success">
      <CircleCheck className="size-4" aria-hidden /> {text}
    </p>
  );
}

/** Alertes de sécurité : faits observés, comportements à vérifier, modifications sensibles. */
export function SecurityAlertsSection({ a }: { a: SecurityAlerts }) {
  const suspicious = a.spraying.length + a.new_devices.length + a.many_addresses.length;
  return (
    <section className="grid gap-4" aria-label="Alertes de sécurité" data-testid="security-alerts">
      <div className="grid gap-1">
        <h3 className="text-lg font-bold">Alertes de sécurité</h3>
        <p className="text-sm text-muted-foreground">
          Ces alertes s&apos;appuient sur les connexions et le journal. Elles distinguent les faits constatés des comportements à vérifier ; elles ne détectent pas toutes les attaques possibles (une protection réseau de l&apos;hébergeur reste nécessaire).
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="size-5 text-danger" aria-hidden /> Faits observés
            </CardTitle>
            <CardDescription>Échecs répétés (24 h) et accès refusés ({a.days} j).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {a.repeated_failures.length === 0 && a.denied.length === 0 ? <Empty text="Rien à signaler." /> : null}
            {a.repeated_failures.map((f) => (
              <p key={f.identifier}>
                <Badge tone="danger">{f.failures} échecs</Badge> compte <span className="font-mono text-xs">{f.identifier}…</span> — dernier {when(f.last)}
              </p>
            ))}
            {a.denied.slice(0, 8).map((d, i) => (
              <p key={`${d.created_at}-${i}`}>
                <Badge tone="warning">Refusé</Badge> <span className="font-mono text-xs">{d.action}</span> — {d.actor_email ?? "?"}
                {d.organization ? ` (${d.organization})` : ""} · {when(d.created_at)}
              </p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Eye className="size-5 text-warning" aria-hidden /> À vérifier ({suspicious})
            </CardTitle>
            <CardDescription>Comportements inhabituels : pas forcément une attaque.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {suspicious === 0 ? <Empty text="Aucun comportement inhabituel." /> : null}
            {a.spraying.map((s) => (
              <p key={s.ip}>
                <Badge tone="danger">Attaque probable</Badge> une même adresse a échoué sur {s.accounts} comptes ({s.failures} essais) — {when(s.last)}
              </p>
            ))}
            {a.many_addresses.map((m) => (
              <p key={m.actor_email}>
                <Badge tone="warning">{m.addresses} adresses</Badge> {m.actor_email} connecté depuis plusieurs adresses en 24 h
              </p>
            ))}
            {a.new_devices.slice(0, 8).map((n, i) => (
              <p key={`${n.created_at}-${i}`}>
                <Badge tone="info">Nouvel appareil</Badge> {n.actor_email} — {deviceLabel(n.device)} · {when(n.created_at)}
              </p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCog className="size-5 text-primary" aria-hidden /> Modifications sensibles
            </CardTitle>
            <CardDescription>Rôles, droits, équipe, double authentification, sessions ({a.days} j).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {a.changes.length === 0 ? <Empty text="Aucune modification sensible." /> : null}
            {a.changes.slice(0, 10).map((c, i) => (
              <p key={`${c.created_at}-${i}`}>
                <span className="font-medium">{c.summary ?? c.action}</span> — {c.actor_email}
                {c.organization ? ` (${c.organization})` : ""} · {when(c.created_at)}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
