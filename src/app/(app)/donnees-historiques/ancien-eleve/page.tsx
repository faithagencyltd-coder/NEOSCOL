import type { Metadata } from "next";
import Link from "next/link";

import { LegacyStudentForm } from "@/features/migration/components/legacy-student-form";
import { requirePermission } from "@/lib/auth/guards";
import { vocabularyFor } from "@/lib/vocabulary";

export const metadata: Metadata = { title: "Ajouter un ancien élève" };

export default async function LegacyStudentPage() {
  const context = await requirePermission("students.create");
  const v = vocabularyFor(context.organization.type);
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
          <Link href="/eleves?vue=anciens" className="hover:text-primary">
            Anciens {v.students.toLowerCase()}
          </Link>{" "}
          / <span className="text-foreground">Ajouter</span>
        </nav>
        <h1 className="text-2xl font-semibold sm:text-[26px]">Ajouter manuellement un ancien {v.student.toLowerCase()}</h1>
        <p className="text-sm text-muted-foreground">
          Pour un dossier absent de vos fichiers. La détection des doublons (matricule, nom, prénom, date de naissance) est faite avant l&apos;enregistrement.
        </p>
      </div>
      <LegacyStudentForm v={v} />
    </div>
  );
}
