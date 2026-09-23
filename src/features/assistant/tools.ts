import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { REPORT_SECTIONS, type ReportSectionKey } from "@/features/reports/sections";
import type { Database } from "@/types/database";

/**
 * Outils de l'assistant. Ils s'exécutent TOUJOURS avec le client Supabase de
 * l'utilisateur connecté : la RLS et les fonctions contrôlées s'appliquent,
 * l'assistant ne voit jamais plus que l'utilisateur. Aucun SQL libre.
 */
export type ToolContext = { supabase: SupabaseClient<Database>; organizationId: string; timezone: string; today: string };

type ToolDef<S extends z.ZodType> = {
  name: string;
  description: string;
  schema: S;
  inputSchema: Record<string, unknown>;
  run: (ctx: ToolContext, input: z.infer<S>) => Promise<string>;
};

function tool<S extends z.ZodType>(def: ToolDef<S>) {
  return def;
}

const LABELS: Record<string, string> = {
  student: "Élève", guardian: "Parent", staff: "Personnel", class: "Classe", program: "Formation",
  enrollment: "Inscription", invoice: "Facture", payment: "Paiement", document: "Document",
};

export const ASSISTANT_TOOLS = [
  tool({
    name: "rechercher",
    description: "Recherche un élève, un parent, un membre du personnel, une classe, une formation, une inscription, une facture, un paiement ou un document par nom, matricule ou numéro.",
    schema: z.object({ texte: z.string().min(2).max(100) }),
    inputSchema: { type: "object", properties: { texte: { type: "string", description: "Nom, matricule ou numéro recherché" } }, required: ["texte"], additionalProperties: false },
    run: async (ctx, input) => {
      const { data, error } = await ctx.supabase.rpc("global_search", { p_organization_id: ctx.organizationId, p_query: input.texte, p_limit: 8 });
      if (error) return "Recherche indisponible.";
      if (!data?.length) return `Aucun résultat accessible pour « ${input.texte} ».`;
      return data.map((r) => `- ${LABELS[r.entity_type] ?? r.entity_type} : ${r.title}${r.subtitle ? ` (${r.subtitle})` : ""}`).join("\n");
    },
  }),
  tool({
    name: "statistiques",
    description: "Statistiques réelles de l'établissement pour une section : effectifs, inscriptions, finances, absences, resultats, formations. Refusé si l'utilisateur n'a pas le droit de consulter les rapports.",
    schema: z.object({ section: z.enum(Object.keys(REPORT_SECTIONS) as [ReportSectionKey, ...ReportSectionKey[]]) }),
    inputSchema: {
      type: "object",
      properties: { section: { type: "string", enum: Object.keys(REPORT_SECTIONS) } },
      required: ["section"],
      additionalProperties: false,
    },
    run: async (ctx, input) => {
      const { data, error } = await ctx.supabase.rpc("report_section", { p_organization_id: ctx.organizationId, p_section: input.section });
      if (error) return `Accès refusé : ${error.message}`;
      const report = data as unknown as { rows: Record<string, unknown>[]; total?: number };
      const columns = REPORT_SECTIONS[input.section].columns;
      const lines = report.rows.slice(0, 25).map((row) => `- ${columns.map((c) => `${c.label} : ${row[c.key] ?? "—"}`).join(" · ")}`);
      return `${REPORT_SECTIONS[input.section].title}${typeof report.total === "number" ? ` (total ${report.total})` : ""}\n${lines.join("\n") || "Aucune donnée."}`;
    },
  }),
  tool({
    name: "impayes",
    description: "Liste des factures dont une échéance est dépassée (élève, reste à payer). Nécessite l'accès aux finances.",
    schema: z.object({ limite: z.number().int().min(1).max(50).default(10) }),
    inputSchema: { type: "object", properties: { limite: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false },
    run: async (ctx, input) => {
      const { data, error } = await ctx.supabase
        .from("invoice_balances")
        .select("number, balance, next_due_on, student_id")
        .eq("organization_id", ctx.organizationId)
        .eq("is_overdue", true)
        .order("balance", { ascending: false })
        .limit(input.limite);
      if (error) return "Données financières indisponibles.";
      if (!data?.length) return "Aucune facture en retard visible avec vos droits.";
      const ids = data.flatMap((r) => (r.student_id ? [r.student_id] : []));
      const { data: students } = await ctx.supabase.from("students").select("id, first_name, last_name, matricule").in("id", ids);
      const byId = new Map((students ?? []).map((s) => [s.id, s]));
      const total = data.reduce((sum, r) => sum + Number(r.balance ?? 0), 0);
      return `${data.length} facture(s) en retard, ${total} au total :\n${data
        .map((r) => {
          const st = r.student_id ? byId.get(r.student_id) : undefined;
          return `- ${st?.last_name ?? "Élève"} ${st?.first_name ?? ""} (${st?.matricule ?? "—"}) : ${r.balance} restant, facture ${r.number}`;
        })
        .join("\n")}`;
    },
  }),
  tool({
    name: "absences",
    description: "Absences et retards enregistrés dans les appels validés d'une date (AAAA-MM-JJ, par défaut aujourd'hui).",
    schema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
    inputSchema: { type: "object", properties: { date: { type: "string", description: "Date AAAA-MM-JJ" } }, additionalProperties: false },
    run: async (ctx, input) => {
      const date = input.date ?? ctx.today;
      const { data, error } = await ctx.supabase
        .from("attendance_records")
        .select("status, minutes_late, is_justified, student:students(first_name, last_name), session:attendance_sessions!inner(session_date, starts_at, class:classes(name))")
        .eq("organization_id", ctx.organizationId)
        .eq("session.session_date", date)
        .in("status", ["absent", "late", "excused"]);
      if (error) return "Présences indisponibles.";
      if (!data?.length) return `Aucune absence ni aucun retard visible le ${date}.`;
      return `${data.length} enregistrement(s) le ${date} :\n${data
        .map((r) => `- ${r.student?.last_name ?? ""} ${r.student?.first_name ?? ""} (${r.session?.class?.name ?? "—"}, ${r.session?.starts_at?.slice(0, 5) ?? ""}) : ${r.status === "late" ? `retard${r.minutes_late ? ` de ${r.minutes_late} min` : ""}` : r.status === "excused" || r.is_justified ? "absence justifiée" : "absence"}`)
        .join("\n")}`;
    },
  }),
  tool({
    name: "anomalies",
    description: "Repère les anomalies visibles : absences non justifiées répétées, factures en retard, justificatifs à examiner, cours sans enseignant.",
    schema: z.object({}),
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async (ctx) => {
      const [absences, overdue, justifs, unassigned] = await Promise.all([
        ctx.supabase.from("attendance_records").select("student_id, student:students(first_name, last_name)").eq("organization_id", ctx.organizationId).eq("status", "absent").eq("is_justified", false),
        ctx.supabase.from("invoice_balances").select("invoice_id", { count: "exact", head: true }).eq("organization_id", ctx.organizationId).eq("is_overdue", true),
        ctx.supabase.from("absence_justifications").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organizationId).eq("status", "pending"),
        ctx.supabase.from("class_subjects").select("id, subject:subjects(name), class:classes(name)").eq("organization_id", ctx.organizationId).is("teacher_id", null),
      ]);
      const perStudent = new Map<string, { name: string; n: number }>();
      for (const r of absences.data ?? []) {
        const entry = perStudent.get(r.student_id) ?? { name: `${r.student?.last_name ?? ""} ${r.student?.first_name ?? ""}`, n: 0 };
        entry.n += 1;
        perStudent.set(r.student_id, entry);
      }
      const repeated = [...perStudent.values()].filter((s) => s.n >= 2).sort((a, b) => b.n - a.n);
      const lines = [
        repeated.length ? `Absences non justifiées répétées : ${repeated.slice(0, 8).map((s) => `${s.name} (${s.n})`).join(", ")}` : null,
        overdue.count ? `${overdue.count} facture(s) avec une échéance dépassée.` : null,
        justifs.count ? `${justifs.count} justificatif(s) d'absence à examiner.` : null,
        unassigned.data?.length ? `Cours sans enseignant : ${unassigned.data.map((c) => `${c.subject?.name} (${c.class?.name})`).join(", ")}` : null,
      ].filter(Boolean);
      return lines.length ? lines.map((l) => `- ${l}`).join("\n") : "Aucune anomalie détectée dans les données auxquelles vous avez accès.";
    },
  }),
];

export type AssistantToolName = (typeof ASSISTANT_TOOLS)[number]["name"];

/** Exécute un outil après validation stricte de ses arguments. */
export async function runTool(ctx: ToolContext, name: string, input: unknown): Promise<string> {
  const def = ASSISTANT_TOOLS.find((t) => t.name === name);
  if (!def) return "Outil inconnu.";
  const parsed = def.schema.safeParse(input ?? {});
  if (!parsed.success) return `Arguments invalides : ${parsed.error.issues[0]?.message ?? ""}`;
  return (def.run as (c: ToolContext, i: unknown) => Promise<string>)(ctx, parsed.data);
}
