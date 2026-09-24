import type { Metadata } from "next";

import { BadgeScanner } from "@/features/staff/components/badge-scanner";
import { listBadgeScans } from "@/features/staff/queries";
import { signOut } from "@/features/auth/actions";
import { requireOrganization } from "@/lib/auth/guards";
import { can, displayName } from "@/lib/auth/session";
import { todayIn } from "@/lib/dates";

export const metadata: Metadata = { title: "Tablette de pointage" };

export default async function KioskPage() {
  const context = await requireOrganization();
  const organization = context.organization;
  const today = todayIn(organization.timezone);
  const scans = await listBadgeScans(organization.id, { from: today, to: today }, 12);
  return (
    <BadgeScanner
      organizationName={organization.name}
      operator={displayName(context)}
      timezone={organization.timezone}
      canOpenBackOffice={can(context, "staff_attendance.read")}
      signOut={signOut}
      initialScans={scans.map((s) => ({
        id: s.id,
        at: s.scanned_at,
        result: s.result as "accepted" | "rejected",
        // Le nom n'est lisible que si la RLS l'autorise : sinon, libellé selon le résultat réel du scan.
        name: s.staff ? `${s.staff.first_name} ${s.staff.last_name}` : s.result === "accepted" ? "Badge accepté" : "Badge refusé",
        message: s.message,
      }))}
    />
  );
}
