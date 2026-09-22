import { NotebookPen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentYear } from "@/features/academic/queries";
import { getGradeBooks } from "@/features/grades/queries";
import { requireOrganization } from "@/lib/auth/guards";
import { canAny } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Notes" };

export default async function GradesPage() {
  const context = await requireOrganization();
  if (!canAny(context, ["grades.read", "grades.enter", "grades.manage"])) notFound();
  const organizationId = context.organization.id;
  const year = await getCurrentYear(organizationId);
  const all = canAny(context, ["grades.read", "grades.manage"]);
  const books = year ? await getGradeBooks(organizationId, year.id, context.user.id, all) : [];
  const byClass = Map.groupBy(books, (b) => b.className);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <p className="text-sm text-muted-foreground">Pédagogie</p>
        <h1 className="text-2xl font-semibold sm:text-[26px]">{all ? "Carnets de notes" : "Mes carnets de notes"}</h1>
        <p className="text-sm text-muted-foreground">
          {all ? "Toutes les matières de l'année." : "Les matières qui vous sont affectées."} Choisissez une matière pour créer des évaluations et saisir les notes.
        </p>
      </div>
      {books.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState icon={NotebookPen} title="Aucune matière" description={all ? undefined : "Aucune matière ne vous est affectée cette année."} />
          </CardContent>
        </Card>
      ) : (
        [...byClass.entries()].map(([className, list]) => (
          <section key={className} className="grid gap-3">
            <h2 className="text-base font-semibold">{className}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((book) => (
                <li key={book.id}>
                  <Link href={`/notes/${book.id}`} className="block h-full">
                    <Card className="flex h-full items-center gap-4 p-4 transition-shadow hover:shadow-md">
                      <span
                        className="h-12 w-1.5 shrink-0 rounded-full"
                        style={{ background: book.color ?? "var(--primary)" }}
                        aria-hidden
                      />
                      <span className="grid flex-1 gap-0.5">
                        <span className="font-semibold">{book.subject}</span>
                        <span className="text-xs text-muted-foreground">
                          Coef. {book.coefficient}
                          {book.teacher ? ` · ${book.teacher}` : ""}
                        </span>
                      </span>
                      <span className="text-right text-sm">
                        <strong className="block font-display text-lg">{book.assessments}</strong>
                        <span className="text-xs text-muted-foreground">évaluation{book.assessments > 1 ? "s" : ""}</span>
                      </span>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
