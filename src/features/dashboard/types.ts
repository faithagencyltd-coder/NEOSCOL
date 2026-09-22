import { z } from "zod";

/** Schéma de la réponse de la RPC dashboard_overview (clés présentes selon les permissions). */
export const dashboardOverviewSchema = z.object({
  academic_year_id: z.string().nullable().optional(),
  today: z.string().optional(),
  students_active: z.number().optional(),
  students_by_sex: z.record(z.string(), z.number()).optional(),
  enrollments_pending: z.number().optional(),
  enrollments_validated: z.number().optional(),
  reenrollments_validated: z.number().optional(),
  enrollments_by_class: z.array(z.object({ class: z.string(), count: z.number() })).optional(),
  classes: z.number().optional(),
  teachers: z.number().optional(),
  currency: z.string().optional(),
  payments_month: z.number().optional(),
  outstanding_total: z.number().optional(),
  overdue_invoices: z.number().optional(),
  payments_by_month: z.array(z.object({ month: z.string(), amount: z.number() })).optional(),
  absences_today: z.number().optional(),
  absences_week: z.number().optional(),
  lates_week: z.number().optional(),
  average_by_class: z.array(z.object({ class: z.string(), average: z.number() })).optional(),
  recent_activity: z
    .array(
      z.object({
        id: z.number(),
        action: z.string(),
        entity_type: z.string().nullable(),
        actor_email: z.string().nullable(),
        summary: z.string().nullable(),
        created_at: z.string(),
      }),
    )
    .optional(),
});

export type DashboardOverview = z.infer<typeof dashboardOverviewSchema>;
