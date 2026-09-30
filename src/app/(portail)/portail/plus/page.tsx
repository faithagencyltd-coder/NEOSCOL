import { BookOpen, CalendarClock, IdCard, ChevronRight, FileCheck2, LogOut, Megaphone, MessagesSquare, NotebookPen, Route, UserRound, Wallet, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { InstallAppButton } from "@/components/shared/pwa";
import { SubmitButton } from "@/components/shared/submit-button";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { signOut } from "@/features/auth/actions";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { currentPlacement, OrganizationCard } from "@/features/portal/components/school-record";
import { requirePortal } from "@/features/portal/context";
import { getPortalSchoolRecord, getPortalSubjects } from "@/features/portal/queries";
import { isHigherOrg } from "@/features/university/config";
import { displayName } from "@/lib/auth/session";
import { SEX } from "@/lib/labels";
import { formatDate, formatNumber } from "@/lib/utils/format";
import { vocabularyFor } from "@/lib/vocabulary";

export const metadata: Metadata = { title: "Plus" };

/** Profil, matières et enseignants, raccourcis, compte et déconnexion. */
export default async function PortalMorePage() {
  const { context, organization, parent, students, student } = await requirePortal();
  const [subjects, record] = student ? await Promise.all([getPortalSubjects(student.id), getPortalSchoolRecord(student.id)]) : [[], null];
  const university = !parent && isHigherOrg(organization.type);
  const vocabulary = vocabularyFor(organization.type);
  const links: { href: string; label: string; icon: LucideIcon }[] = [
    ...(university
      ? [
          { href: "/portail/parcours", label: "Mon parcours universitaire", icon: Route },
          { href: "/portail/notes", label: "Notes des évaluations", icon: NotebookPen },
        ]
      : [{ href: "/portail/parcours", label: parent ? "Parcours scolaire" : vocabulary.family === "training" ? "Mon parcours de formation" : "Mon parcours scolaire", icon: Route }]),
    ...(parent ? [{ href: "/portail/emploi-du-temps", label: "Emploi du temps", icon: CalendarClock }] : []),
    ...(parent ? [] : [{ href: "/portail/badge", label: "Mon badge (QR de pointage)", icon: IdCard }]),
    { href: "/portail/documents", label: "Documents officiels", icon: FileCheck2 },
    ...(parent ? [] : [{ href: "/portail/finances", label: "Situation financière", icon: Wallet }]),
    { href: "/portail/annonces", label: "Annonces et notifications", icon: Megaphone },
    { href: "/portail/messages", label: "Messages de l'établissement", icon: MessagesSquare },
  ];

  return (
    <>
      <h1 className="text-xl font-bold">Plus</h1>
      <Card>
        <ul className="divide-y divide-border">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium hover:bg-surface-muted">
                <l.icon className="size-5 text-primary" aria-hidden />
                <span className="flex-1">{l.label}</span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {student ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-4 text-primary" aria-hidden /> {isHigherOrg(organization.type) ? "Profil universitaire" : "Profil scolaire"} de {student.first_name}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center gap-3">
              <Avatar name={`${student.first_name} ${student.last_name}`} photoId={student.photo_path} className="size-12" />
              <dl className="grid gap-0.5 text-sm">
                <dt className="sr-only">Nom</dt>
                <dd className="font-semibold">
                  {student.last_name} {student.first_name}
                </dd>
                <dt className="sr-only">{vocabulary.family === "training" ? "Formation" : vocabulary.klass} et matricule</dt>
                <dd className="text-muted-foreground">
                  {record ? currentPlacement(record, vocabulary) : (student.class_name ?? `${vocabulary.klass} non affectée`)} · matricule {student.matricule}
                  {student.birth_date ? ` · né(e) le ${formatDate(student.birth_date)}` : ""}
                </dd>
              </dl>
            </div>
            {record ? (
              <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                {[
                  ["Sexe", record.student.sex ? (SEX[record.student.sex] ?? record.student.sex) : null],
                  ["Lieu de naissance", record.student.birth_place],
                  ["Nationalité", record.student.nationality],
                  ["Téléphone", record.student.phone],
                  ["E-mail", record.student.email],
                  ["Inscrit(e) depuis", record.student.first_enrolled_on ? formatDate(record.student.first_enrolled_on) : null],
                ]
                  .filter((entry): entry is [string, string] => Boolean(entry[1]))
                  .map(([label, value]) => (
                    <div key={label} className="grid gap-0.5">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="break-words font-medium">{value}</dd>
                    </div>
                  ))}
              </dl>
            ) : null}
            {subjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune matière affectée à la classe.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {subjects.map((s) => (
                  <li key={s.subject} className="flex items-center gap-3 rounded-xl border-l-4 bg-background px-3 py-2 text-sm" style={{ borderLeftColor: s.color ?? "var(--primary)" }}>
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate font-medium">{s.subject}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {s.teacher ?? "Enseignant non affecté"}
                        {s.is_head_teacher ? " · professeur principal" : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">coef. {formatNumber(Number(s.coefficient))}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {record ? <OrganizationCard record={record} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="size-4 text-primary" aria-hidden /> Mon compte
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <dl className="grid gap-2">
            <div className="grid gap-0.5">
              <dt className="text-muted-foreground">Nom</dt>
              <dd className="font-medium">{displayName(context)}</dd>
            </div>
            {context.user.phone ? (
              <div className="grid gap-0.5">
                <dt className="text-muted-foreground">Téléphone de connexion</dt>
                <dd className="font-medium">+{context.user.phone.replace(/^\+/, "")}</dd>
              </div>
            ) : null}
            {parent ? (
              <div className="grid gap-0.5">
                <dt className="text-muted-foreground">Enfants rattachés</dt>
                <dd className="font-medium">{students.map((s) => `${s.first_name} (${s.class_name ?? "—"})`).join(", ") || "Aucun"}</dd>
              </div>
            ) : null}
          </dl>
          {parent ? (
            <p className="text-muted-foreground">Connexion par téléphone, nom, prénom et code reçu par SMS : aucun mot de passe à retenir.</p>
          ) : (
            <div className="grid gap-2">
              <h3 className="font-semibold">Changer mon mot de passe</h3>
              <ResetPasswordForm redirectTo="/portail" />
            </div>
          )}
          <div className="grid gap-2">
            <h3 className="font-semibold">Application mobile</h3>
            <InstallAppButton />
          </div>
          <form action={signOut}>
            <SubmitButton variant="secondary" className="w-full sm:w-auto" pendingLabel="Déconnexion…">
              <LogOut aria-hidden /> Se déconnecter
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
