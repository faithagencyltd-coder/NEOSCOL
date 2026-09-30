import { redirect } from "next/navigation";

import { requireOrganization } from "@/lib/auth/guards";
import { vocabularyFor } from "@/lib/vocabulary";

/** Chaque module a son propre parcours d'inscription : formation et université sont redirigées vers le leur. */
export default async function NewEnrollmentLayout({ children }: { children: React.ReactNode }) {
  const context = await requireOrganization();
  const family = vocabularyFor(context.organization.type).family;
  if (family === "training") redirect("/formation/inscription");
  if (family === "higher") redirect("/universite/inscription");
  return children;
}
