import "server-only";

import { notFound } from "next/navigation";

import { getPortalStatus, getSelectedStudent } from "@/features/portal/queries";
import { requireOrganization } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";

/**
 * Contexte d'une page du portail : compte parent ou élève, enfant affiché et
 * état des restrictions. 404 pour tout autre profil.
 */
export async function requirePortal() {
  const context = await requireOrganization();
  const parent = can(context, "portal.parent");
  if (!parent && !can(context, "portal.student")) notFound();
  const { students, student } = await getSelectedStudent(context.organization.id);
  const status = student ? await getPortalStatus(student.id) : null;
  return { context, organization: context.organization, parent, students, student, status };
}
