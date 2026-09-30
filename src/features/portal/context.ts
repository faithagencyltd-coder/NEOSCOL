import "server-only";

import { notFound, redirect } from "next/navigation";

import { getPortalStatus, getSelectedStudent } from "@/features/portal/queries";
import { requireOrganization } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { featureEnabled } from "@/lib/features";

/**
 * Contexte d'une page du portail : compte parent ou élève, enfant affiché et
 * état des restrictions. 404 pour tout autre profil.
 */
export async function requirePortal() {
  const context = await requireOrganization();
  const parent = can(context, "portal.parent");
  if (!parent && !can(context, "portal.student")) notFound();
  // Portail arrêté par l'établissement ou par la plateforme : aucune donnée n'est supprimée.
  if (!featureEnabled(context.organization, parent ? "parent_portal" : "student_portal")) redirect("/acces-indisponible?portail=desactive");
  const { students, student } = await getSelectedStudent(context.organization.id);
  const status = student ? await getPortalStatus(student.id) : null;
  return { context, organization: context.organization, parent, students, student, status };
}
