import type { Metadata } from "next";

import { getRooms } from "@/features/academic/queries";
import { BadgeScanner } from "@/features/staff/components/badge-scanner";
import { isTrainingOrg } from "@/features/training/config";
import { listBadgeScans } from "@/features/staff/queries";
import { signOut } from "@/features/auth/actions";
import { requireOrganization } from "@/lib/auth/guards";
import { can, displayName } from "@/lib/auth/session";
import { todayIn } from "@/lib/dates";

export const metadata: Metadata = { title: "Scanner votre badge" };

export default async function KioskPage() {
  const context = await requireOrganization();
  const organization = context.organization;
  const today = todayIn(organization.timezone);
  const training = isTrainingOrg(organization.type);
  const [scans, rooms] = await Promise.all([
    listBadgeScans(organization.id, { from: today, to: today }, 12),
    training ? getRooms(organization.id) : Promise.resolve([]),
  ]);
  return (
    <BadgeScanner
      organizationName={organization.name}
      operator={displayName(context)}
      timezone={organization.timezone}
      canOpenBackOffice={can(context, "staff_attendance.read")}
      signOut={signOut}
      training={training ? { rooms: rooms.map((r) => ({ id: r.id, name: r.name })) } : null}
      initialScans={scans.map((s) => ({
        id: s.id,
        at: s.scanned_at,
        result: s.result as "accepted" | "rejected",
        // Le nom n'est lisible que si la RLS l'autorise : sinon, libellé selon le résultat réel du scan.
        name: s.staff
          ? `${s.staff.first_name} ${s.staff.last_name}`
          : s.student
            ? `${s.student.first_name} ${s.student.last_name}`
            : s.result === "accepted"
              ? "Badge accepté"
              : "Badge refusé",
        message: s.message,
      }))}
    />
  );
}
