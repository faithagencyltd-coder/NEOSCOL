import { ChevronRight, Route } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card } from "@/components/ui/card";
import { requirePortal } from "@/features/portal/context";
import { ResultsTab } from "@/features/university/components/student-tabs";
import { universityConfigOf } from "@/features/university/config";
import { studentAcademicRecord } from "@/features/university/queries";

export const metadata: Metadata = { title: "Résultats et crédits" };

/**
 * Portail étudiant (université) : résultats PUBLIÉS de l'étudiant connecté
 * uniquement (UE, matières, session 1 / rattrapage, crédits, décision) — la RLS
 * ne renvoie rien d'autre.
 */
export default async function PortalResultsPage() {
  const { organization, student } = await requirePortal();
  const university = universityConfigOf(organization.type, organization.settings);
  if (!university || !university.features.student_portal) notFound();
  const record = student ? await studentAcademicRecord(organization.id, student.id) : null;

  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-xl font-bold">Résultats et crédits</h1>
        <p className="text-sm text-muted-foreground">Résultats publiés après délibération du jury.</p>
      </div>
      <Card>
        <Link href="/portail/parcours" className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium hover:bg-surface-muted">
          <Route className="size-5 text-primary" aria-hidden />
          <span className="flex-1">Mon parcours universitaire et mes crédits par cycle</span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </Link>
      </Card>
      {record ? (
        <ResultsTab record={record} showRank={university.features.ranking} notesHref="/portail/notes" emptyHint="Vos résultats apparaîtront ici après la délibération du jury." />
      ) : null}
    </>
  );
}
