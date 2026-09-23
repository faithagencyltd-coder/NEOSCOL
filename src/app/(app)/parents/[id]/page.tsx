import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DetailList } from "@/components/shared/detail-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GuardianEditDialog } from "@/features/guardians/components/guardian-edit-dialog";
import { getGuardian } from "@/features/guardians/queries";
import { GuardianPortalAccess } from "@/features/portal/components/portal-access";
import { getPortalAccount } from "@/features/portal/queries";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { RELATIONSHIP, SEX, STUDENT_STATUS } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils/format";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Parent / tuteur" };

export default async function GuardianPage({ params }: PageProps<"/parents/[id]">) {
  const context = await requirePermission("guardians.read");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const guardian = await getGuardian(context.organization.id, id);
  if (!guardian) notFound();
  const fullName = `${guardian.first_name} ${guardian.last_name}`;
  const account = await getPortalAccount("guardian", guardian.id);

  return (
    <div className="grid gap-5">
      <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
        <Link href="/parents" className="hover:text-primary">
          Parents et tuteurs
        </Link>{" "}
        / <span className="text-foreground">{fullName}</span>
      </nav>
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <Avatar name={fullName} className="size-16 text-xl" />
        <div className="grid flex-1 gap-1">
          <h1 className="text-2xl font-semibold">{fullName}</h1>
          <p className="text-sm text-muted-foreground">
            {guardian.phone ?? "Téléphone non renseigné"}
            {guardian.email ? ` · ${guardian.email}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {account?.has_account ? (
            <Badge tone={account.status === "active" ? "info" : "danger"}>{account.status === "active" ? "Portail parent actif" : "Portail suspendu"}</Badge>
          ) : (
            <Badge>Portail non activé</Badge>
          )}
          {can(context, "guardians.manage") ? <GuardianEditDialog guardian={guardian} /> : null}
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Coordonnées</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                { label: "Sexe", value: guardian.sex ? SEX[guardian.sex] : null },
                { label: "Téléphone", value: guardian.phone },
                { label: "Téléphone secondaire", value: guardian.phone_secondary },
                { label: "E-mail", value: guardian.email },
                { label: "Profession", value: guardian.profession },
                { label: "Employeur", value: guardian.employer },
                { label: "Adresse", value: [guardian.address, guardian.city].filter(Boolean).join(", ") },
                { label: "Pièce d'identité", value: guardian.national_id },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Enfants</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2">
              {guardian.student_guardians.map((link) =>
                link.student ? (
                  <li key={link.id}>
                    <Link
                      href={`/eleves/${link.student.id}`}
                      className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-background"
                    >
                      <Avatar name={`${link.student.first_name} ${link.student.last_name}`} className="size-9" />
                      <span className="grid flex-1">
                        <span className="text-sm font-semibold">
                          {link.student.first_name} {link.student.last_name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {link.student.matricule} · {RELATIONSHIP[link.relationship] ?? link.relationship}
                        </span>
                      </span>
                      <StatusBadge value={link.student.status} map={STUDENT_STATUS} />
                    </Link>
                  </li>
                ) : null,
              )}
            </ul>
          </CardContent>
        </Card>
        <div className="lg:col-span-3">
          <GuardianPortalAccess
            guardianId={guardian.id}
            phone={guardian.phone}
            account={account}
            lastSignIn={account?.last_sign_in_at ? formatDateTime(account.last_sign_in_at, "fr-FR", context.organization.timezone) : null}
            canManage={can(context, "portal_access.manage")}
          />
        </div>
      </div>
    </div>
  );
}
