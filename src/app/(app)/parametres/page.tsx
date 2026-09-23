import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { SettingsForm } from "@/features/portal/components/settings-form";
import { requirePermission } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Paramètres" };

type Settings = Record<string, Record<string, unknown> | undefined>;

const num = (value: unknown, fallback: number) => (typeof value === "number" ? value : Number(value ?? fallback) || fallback);
const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

export default async function SettingsPage() {
  const context = await requirePermission("settings.manage");
  const settings = (context.organization.settings ?? {}) as Settings;
  const restrictions = settings.portal_restrictions ?? {};
  const features = (restrictions.features ?? {}) as Record<string, unknown>;
  const reminders = settings.reminders ?? {};
  const staff = settings.staff_attendance ?? {};
  const grading = settings.grading ?? {};
  return (
    <div className="grid gap-6">
      <PageHeader title="Paramètres de l'établissement" description="Règles appliquées immédiatement par la base de données (portails, rappels, pointage, notes)." />
      <SettingsForm
        currency={context.organization.currency}
        values={{
          restrictions_enabled: bool(restrictions.enabled, false),
          grace_days: num(restrictions.grace_days, 0),
          min_overdue_amount: num(restrictions.min_overdue_amount, 0),
          restrict_grades: bool(features.grades, true),
          restrict_report_cards: bool(features.report_cards, true),
          restrict_documents: bool(features.documents, true),
          restrict_timetable: bool(features.timetable, false),
          days_before_due: num(reminders.days_before_due, 3),
          overdue_interval_days: num(reminders.overdue_interval_days, 7),
          open_before_minutes: num(staff.open_before_minutes, 15),
          late_tolerance_minutes: num(staff.late_tolerance_minutes, 5),
          duplicate_window_seconds: num(staff.duplicate_window_seconds, 60),
          track_departure: bool(staff.track_departure, true),
          lock_after_validation: bool(grading.lock_after_validation, true),
          credit_threshold: num(grading.credit_threshold, 10),
        }}
      />
    </div>
  );
}
