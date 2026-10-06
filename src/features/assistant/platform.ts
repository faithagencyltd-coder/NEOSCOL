import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { runClaude, type AssistantAnswer, type AssistantTurn } from "@/features/assistant/engine";
import { anthropicClient } from "@/lib/ai/anthropic";
import type { Database } from "@/types/database";

/**
 * Assistant de supervision du Super Admin : même moteur que l'assistant des
 * établissements, avec des outils de LECTURE de la plateforme. Chaque outil
 * appelle une fonction de la base qui revérifie le rôle de plateforme ; aucun
 * outil ne modifie quoi que ce soit, aucun ne renvoie de clé ou de donnée
 * d'élève.
 */

type Ctx = { supabase: SupabaseClient<Database>; today: string };
type Json = Record<string, unknown>;

const SYSTEM = `Tu es l'assistant de supervision de la plateforme NeoScool, au service du Super Administrateur.
Tu réponds en français simple, sans jargon technique, de façon claire et chiffrée.
Tu n'as accès aux données QUE par les outils fournis, en lecture seule. Ne devine jamais : si une donnée n'est pas disponible, dis-le.
Distingue toujours un FAIT constaté d'un SOUPÇON à vérifier (par exemple « tentatives échouées » n'est pas « piratage réussi »).
Tu ne peux rien modifier : propose seulement l'action à faire dans la console (et sur quelle page).
N'affiche jamais de données personnelles inutiles.`;

const count = (n: unknown) => Number(n ?? 0).toLocaleString("fr-FR");
const when = (iso: unknown) => (iso ? new Date(String(iso)).toLocaleString("fr-FR") : "jamais");

async function rpc(ctx: Ctx, fn: string, args: Json = {}): Promise<{ data: unknown; error: string | null }> {
  const { data, error } = await (ctx.supabase.rpc as unknown as (f: string, a: Json) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);
  return { data, error: error ? "Accès refusé ou donnée indisponible." : null };
}

const empty = z.object({});

export const PLATFORM_TOOLS = [
  {
    name: "tableau_de_bord",
    description: "Chiffres clés réels : établissements (actifs, suspendus, nouveaux), utilisateurs, connexions du jour, abonnements, alertes en cours.",
    schema: empty,
    inputSchema: { type: "object", properties: {} },
    async run(ctx: Ctx) {
      const { data, error } = await rpc(ctx, "platform_dashboard");
      if (error) return error;
      const d = data as { organizations: Json; users: Json; subscriptions: Json; alerts: { title: string }[] };
      return [
        `Établissements : ${count(d.organizations.total)} (${count(d.organizations.active)} actifs, ${count(d.organizations.suspended)} suspendus, ${count(d.organizations.new_30d)} nouveaux en 30 jours).`,
        `Utilisateurs : ${count(d.users.total)} comptes actifs ; ${count(d.users.logins_today)} se sont connectés aujourd'hui ; environ ${count(d.users.online_estimate)} actifs ces 15 dernières minutes ; ${count(d.users.failed_logins_24h)} échecs de connexion en 24 h.`,
        `Abonnements : ${count(d.subscriptions.active)} actifs, ${count(d.subscriptions.trialing)} en essai, ${count(d.subscriptions.unpaid)} impayés ou restreints, ${count(d.subscriptions.ended)} résiliés ou expirés.`,
        d.alerts.length ? `Alertes : ${d.alerts.map((a) => a.title).join(" ; ")}.` : "Aucune alerte en cours.",
      ].join("\n");
    },
  },
  {
    name: "etat_technique",
    description: "État technique mesuré : temps de réponse et taille de la base, services externes (dernier test), notifications de paiement, envois, erreurs fréquentes, stockage.",
    schema: empty,
    inputSchema: { type: "object", properties: {} },
    async run(ctx: Ctx) {
      const started = Date.now();
      const ping = await rpc(ctx, "health_ping");
      const latency = Date.now() - started;
      const { data, error } = await rpc(ctx, "platform_service_health");
      if (error) return error;
      const h = data as {
        database: Json;
        storage: Json;
        integrations: { provider: string; enabled: boolean; last_test_ok: boolean | null }[];
        webhooks: { subscriptions: Json; families: Json };
        errors: { failures_24h: number; denied_24h: number; top_7d: { action: string; n: number }[] };
        sms_low_balance: number;
      };
      const failing = h.integrations.filter((i) => i.enabled && i.last_test_ok === false).map((i) => i.provider);
      return [
        `Base de données : ${ping.error ? "ne répond pas" : `répond en ${latency} ms`} ; taille ${Math.round(Number(h.database.size_bytes) / 1048576)} Mo ; ${count(h.database.connections)} connexions sur ${count(h.database.max_connections)}.`,
        `Stockage des fichiers : ${count(h.storage.files)} fichiers, ${Math.round(Number(h.storage.bytes) / 1048576)} Mo.`,
        failing.length ? `Services en échec au dernier test : ${failing.join(", ")}.` : "Aucun service externe actif en échec au dernier test.",
        `Notifications de paiement (24 h) : abonnements ${count(h.webhooks.subscriptions.processed_24h)} traitées / ${count(h.webhooks.subscriptions.rejected_24h)} rejetées ; familles ${count(h.webhooks.families.processed_24h)} / ${count(h.webhooks.families.rejected_24h)}.`,
        `Erreurs (24 h) : ${count(h.errors.failures_24h)} échecs, ${count(h.errors.denied_24h)} accès refusés. Plus fréquentes sur 7 jours : ${h.errors.top_7d.map((e) => `${e.action} (${e.n})`).join(", ") || "aucune"}.`,
        `${count(h.sms_low_balance)} établissement(s) ont moins de 10 SMS.`,
        "Limite : la disponibilité vue de l'extérieur (panne complète) se surveille avec un service externe interrogeant /api/sante.",
      ].join("\n");
    },
  },
  {
    name: "securite",
    description: "Alertes de sécurité : échecs répétés, accès refusés, même adresse sur plusieurs comptes (attaque probable), nouveaux appareils, modifications sensibles (rôles, droits, équipe).",
    schema: z.object({ jours: z.number().int().min(1).max(90).optional() }),
    inputSchema: { type: "object", properties: { jours: { type: "integer", minimum: 1, maximum: 90, description: "Période en jours (7 par défaut, 1 pour aujourd'hui)" } } },
    async run(ctx: Ctx, input: { jours?: number }) {
      const { data, error } = await rpc(ctx, "platform_security_alerts", { p_days: input.jours ?? 7 });
      if (error) return error;
      const a = data as { days: number; repeated_failures: Json[]; denied: Json[]; spraying: Json[]; new_devices: Json[]; many_addresses: Json[]; changes: { action: string; actor_email: string; created_at: string }[] };
      return [
        `Période : ${a.days} jour(s).`,
        `FAITS : ${a.repeated_failures.length} compte(s) avec au moins 3 échecs de connexion en 24 h ; ${a.denied.length} accès refusé(s) enregistrés.`,
        `À VÉRIFIER (pas forcément une attaque) : ${a.spraying.length} adresse(s) ayant échoué sur au moins 5 comptes (attaque probable par essais), ${a.new_devices.length} connexion(s) depuis un nouvel appareil, ${a.many_addresses.length} compte(s) connecté(s) depuis 4 adresses ou plus en 24 h.`,
        `Modifications sensibles : ${a.changes.length}${a.changes.length ? ` — dernières : ${a.changes.slice(0, 5).map((c) => `${c.action} par ${c.actor_email} (${when(c.created_at)})`).join(" ; ")}` : ""}.`,
        "Rappel : ces indicateurs ne détectent pas toutes les attaques possibles.",
      ].join("\n");
    },
  },
  {
    name: "abonnements_echeance",
    description: "Établissements dont l'abonnement ou l'essai arrive à échéance dans les 30 jours.",
    schema: empty,
    inputSchema: { type: "object", properties: {} },
    async run(ctx: Ctx) {
      const { data, error } = await rpc(ctx, "platform_dashboard");
      if (error) return error;
      const list = (data as { expiring: { name: string; status: string; ends_at: string }[] }).expiring;
      return list.length
        ? list.map((e) => `• ${e.name} — ${e.status === "TRIALING" ? "essai" : "abonnement"} jusqu'au ${new Date(e.ends_at).toLocaleDateString("fr-FR")}`).join("\n")
        : "Aucune échéance dans les 30 prochains jours.";
    },
  },
  {
    name: "incidents",
    description: "Assistance : demandes et incidents ouverts, urgents, problèmes récurrents, délai moyen de résolution.",
    schema: empty,
    inputSchema: { type: "object", properties: {} },
    async run(ctx: Ctx) {
      const { data, error } = await rpc(ctx, "platform_support_overview");
      if (error) return error;
      const o = data as { open: number; critical_open: number; unassigned: number; resolved_30d: number; avg_resolution_hours: number | null; recurring: { category: string; n: number }[] };
      const { data: last } = await ctx.supabase
        .from("support_tickets")
        .select("number, title, severity, status, kind, created_at, organization:organizations(name)")
        .in("status", ["open", "in_progress", "waiting"])
        .order("created_at", { ascending: false })
        .limit(8);
      return [
        `${o.open} demande(s) active(s), dont ${o.critical_open} urgente(s) et ${o.unassigned} non prise(s) en charge ; ${o.resolved_30d} résolue(s) en 30 jours${o.avg_resolution_hours != null ? `, délai moyen ${o.avg_resolution_hours} h` : ""}.`,
        o.recurring.length ? `Problèmes récurrents : ${o.recurring.map((r) => `${r.category} (${r.n})`).join(", ")}.` : "Aucun problème récurrent.",
        ...(last ?? []).map((t) => `• N° ${t.number} ${t.kind === "incident" ? "[incident]" : ""} ${t.title} — ${(t.organization as { name: string } | null)?.name ?? "plateforme"}, gravité ${t.severity}, ${t.status}`),
      ].join("\n");
    },
  },
  {
    name: "croissance",
    description: "Évolution mensuelle : nouveaux établissements, utilisateurs actifs, essais, activations, renouvellements, résiliations, revenus NeoScool (hors frais de scolarité), établissements inactifs.",
    schema: z.object({ mois: z.number().int().min(3).max(36).optional() }),
    inputSchema: { type: "object", properties: { mois: { type: "integer", minimum: 3, maximum: 36 } } },
    async run(ctx: Ctx, input: { mois?: number }) {
      const { data, error } = await rpc(ctx, "platform_growth", { p_months: input.mois ?? 6 });
      if (error) return error;
      const g = data as { months: (Json & { month: string; revenue: Record<string, number> })[]; activity: { active_organizations_30d: number; organizations: number; inactive: { name: string }[] } };
      return [
        ...g.months.map(
          (m) =>
            `${m.month} : +${count(m.new_organizations)} établissement(s), ${count(m.active_users)} utilisateurs actifs, ${count(m.trials)} essai(s), ${count(m.activations)} activation(s), ${count(m.renewals)} renouvellement(s), ${count(m.cancellations)} résiliation(s), revenus ${Object.entries(m.revenue).map(([c, v]) => `${count(v)} ${c}`).join(" + ") || "0"}`,
        ),
        `Établissements actifs (30 jours) : ${g.activity.active_organizations_30d} sur ${g.activity.organizations}. Inactifs : ${g.activity.inactive.map((i) => i.name).join(", ") || "aucun"}.`,
      ].join("\n");
    },
  },
  {
    name: "etablissement",
    description: "Situation d'un établissement par son nom ou son code : abonnement, volumes, connexions, stockage, SMS, demandes d'assistance (aucune donnée d'élève).",
    schema: z.object({ nom: z.string().min(2).max(100) }),
    inputSchema: { type: "object", properties: { nom: { type: "string", description: "Nom ou code de l'établissement" } }, required: ["nom"] },
    async run(ctx: Ctx, input: { nom: string }) {
      const term = input.nom.replace(/[%_,()]/g, " ").trim();
      const { data: orgs } = await ctx.supabase.from("organizations").select("id, name, code").or(`name.ilike.%${term}%,code.ilike.%${term}%`).limit(3);
      if (!orgs?.length) return `Aucun établissement ne correspond à « ${input.nom} ».`;
      const out: string[] = [];
      for (const o of orgs) {
        const { data, error } = await rpc(ctx, "platform_organization_profile", { p_org: o.id });
        if (error) return error;
        const p = data as { organization: Json; subscription: Json | null; counts: Json; usage: Json; tickets: Json };
        out.push(
          `${o.name} (${o.code}) — ${p.organization.status === "active" ? "actif" : "suspendu"} ; abonnement : ${p.subscription ? `${p.subscription.status}, ${p.subscription.plan ?? "—"}` : "aucun"} ; ${count(p.counts.students)} élèves, ${count(p.counts.staff)} personnels, ${count(p.counts.members)} comptes ; ${count(p.usage.logins_30d)} connexions en 30 jours (dernière : ${when(p.usage.last_login)}) ; ${count(p.usage.sms_balance)} SMS ; ${count(p.tickets.open)} demande(s) d'assistance ouverte(s).`,
        );
      }
      return out.join("\n");
    },
  },
  {
    name: "journal",
    description: "Derniers événements importants du journal (gravité élevée par défaut), filtrables par catégorie (auth, platform, settings, billing…).",
    schema: z.object({ categorie: z.string().max(40).optional(), gravite: z.enum(["info", "medium", "high"]).optional() }),
    inputSchema: { type: "object", properties: { categorie: { type: "string" }, gravite: { type: "string", enum: ["info", "medium", "high"] } } },
    async run(ctx: Ctx, input: { categorie?: string; gravite?: "info" | "medium" | "high" }) {
      const { data, error } = await rpc(ctx, "platform_activity_log", { p_category: input.categorie ?? null, p_severity: input.gravite ?? "high", p_limit: 15 });
      if (error) return error;
      const rows = data as { created_at: string; action: string; actor_email: string | null; organization_name: string | null; summary: string | null; result: string }[];
      return rows.length
        ? rows.map((r) => `• ${when(r.created_at)} — ${r.summary ?? r.action} — ${r.actor_email ?? "système"}${r.organization_name ? ` (${r.organization_name})` : ""}${r.result !== "success" ? ` [${r.result}]` : ""}`).join("\n")
        : "Aucun événement correspondant.";
    },
  },
] as const;

async function runPlatformTool(ctx: Ctx, name: string, input: unknown): Promise<string> {
  const def = PLATFORM_TOOLS.find((t) => t.name === name);
  if (!def) return "Outil inconnu.";
  const parsed = def.schema.safeParse(input ?? {});
  if (!parsed.success) return `Arguments invalides : ${parsed.error.issues[0]?.message ?? ""}`;
  return (def.run as (c: Ctx, i: unknown) => Promise<string>)(ctx, parsed.data);
}

function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Aiguillage local (sans modèle de langage) vers les mêmes outils, quand Claude n'est pas configuré. */
async function localPlatformAnswer(ctx: Ctx, question: string): Promise<AssistantAnswer> {
  const q = normalize(question);
  const calls: { name: string; input: Json }[] = [];
  const general = /rapport general|etat general|resume|bilan/.test(q);
  if (general || /combien d.etablissement|etablissements actifs|connecte|utilisateur|tableau de bord|alerte/.test(q)) calls.push({ name: "tableau_de_bord", input: {} });
  if (general || /fonctionne|technique|serveur|base de donnees|stockage|sature|erreur|lent|panne|api|webhook|service/.test(q)) calls.push({ name: "etat_technique", input: {} });
  if (general || /piratage|pirate|intrusion|securite|attaque|suspect|tentative/.test(q)) calls.push({ name: "securite", input: { jours: /aujourd/.test(q) ? 1 : 7 } });
  if (/expir|echeance|renouvel|fin d.essai/.test(q)) calls.push({ name: "abonnements_echeance", input: {} });
  if (general || /incident|ticket|assistance|demande|probleme de connexion|signale/.test(q)) calls.push({ name: "incidents", input: {} });
  if (/croissance|evolution|tendance|revenu|chiffre d.affaires|resiliation|inactif/.test(q)) calls.push({ name: "croissance", input: { mois: 6 } });
  if (/journal|derniers evenements|historique/.test(q)) calls.push({ name: "journal", input: {} });
  const school = question.match(/(?:etablissement|établissement|ecole|école|lycée|lycee|universite|université|centre)\s+(.{2,60})/i)?.[1];
  if (school && !calls.length) calls.push({ name: "etablissement", input: { nom: school.replace(/[?.!]+$/, "").trim() } });
  if (!calls.length) {
    return {
      provider: "local",
      tools: [],
      answer:
        "Je peux vous donner : l'état général de la plateforme, les chiffres clés, la sécurité (tentatives suspectes), l'état technique (base, services, erreurs, stockage), les abonnements à échéance, les incidents, la croissance et la situation d'un établissement. Reformulez avec l'un de ces sujets.",
    };
  }
  const unique = calls.filter((c, i) => calls.findIndex((x) => x.name === c.name) === i);
  const results = await Promise.all(unique.map((c) => runPlatformTool(ctx, c.name, c.input)));
  return { provider: "local", tools: unique.map((c) => c.name), answer: results.join("\n\n") };
}

/** Réponse de l'assistant de supervision : Claude si la clé est configurée, sinon aiguillage local. */
export async function answerPlatform(ctx: Ctx, history: AssistantTurn[]): Promise<AssistantAnswer> {
  const last = history.at(-1)?.content ?? "";
  const client = await anthropicClient();
  if (client) {
    try {
      return await runClaude(client, { tools: PLATFORM_TOOLS, run: (name, input) => runPlatformTool(ctx, name, input), system: `${SYSTEM}\nDate du jour : ${ctx.today}.` }, history);
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        const fallback = await localPlatformAnswer(ctx, last);
        return { ...fallback, answer: `${fallback.answer}\n\n(Service d'IA indisponible : réponse calculée localement.)` };
      }
      throw error;
    }
  }
  return localPlatformAnswer(ctx, last);
}
