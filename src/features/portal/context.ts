import "server-only";

import { notFound, redirect } from "next/navigation";

import { getPortalStatus, getSelectedStudent } from "@/features/portal/queries";
import { isHigherOrg, universityConfigOf, type ParentSection } from "@/features/university/config";
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
  // Université : portail parent seulement s'il est activé (la base ne renvoie sinon aucune donnée d'étudiant).
  const university = universityConfigOf(context.organization.type, context.organization.settings);
  if (parent && university && !university.features.parent_portal) redirect("/acces-indisponible?portail=desactive");
  const { students, student } = await getSelectedStudent(context.organization.id);
  const status = student ? await getPortalStatus(student.id) : null;
  /** Information visible : toujours, sauf pour un parent d'université qui ne l'a pas choisie. */
  const shows = (section: ParentSection) => !(parent && university) || university.parentSections[section];
  return { context, organization: context.organization, parent, students, student, status, shows, university: isHigherOrg(context.organization.type) };
}

/** Page du portail liée à une information que l'université peut masquer aux parents. */
export async function requirePortalSection(section: ParentSection) {
  const portal = await requirePortal();
  if (!portal.shows(section)) notFound();
  return portal;
}
