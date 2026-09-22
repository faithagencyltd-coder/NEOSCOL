import "server-only";

import { getMyStaffMember } from "@/features/timetable/queries";
import { can, type SessionContext } from "@/lib/auth/session";

/** Droit d'écriture sur un carnet de notes : gestion globale, ou enseignant de la matière. */
export async function canEditGradeBook(context: SessionContext & { organization: { id: string } }, teacherId: string | null) {
  if (can(context, "grades.manage")) return true;
  if (!can(context, "grades.enter") || !teacherId) return false;
  const me = await getMyStaffMember(context.organization.id, context.user.id);
  return me?.id === teacherId;
}
