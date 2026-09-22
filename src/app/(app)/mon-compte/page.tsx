import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { requireOrganization } from "@/lib/auth/guards";
import { displayName } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Mon compte" };

const PERSONA_LABELS = { staff: "Personnel", teacher: "Enseignant", parent: "Parent", student: "Élève" } as const;

export default async function AccountPage() {
  const context = await requireOrganization();
  return (
    <div className="grid gap-6">
      <PageHeader title="Mon compte" description="Informations de connexion et sécurité." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profil</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              <div className="grid gap-0.5">
                <dt className="text-muted-foreground">Nom</dt>
                <dd className="font-medium">{displayName(context)}</dd>
              </div>
              {context.user.email ? (
                <div className="grid gap-0.5">
                  <dt className="text-muted-foreground">E-mail</dt>
                  <dd className="font-medium">{context.user.email}</dd>
                </div>
              ) : null}
              {context.user.phone ? (
                <div className="grid gap-0.5">
                  <dt className="text-muted-foreground">Téléphone</dt>
                  <dd className="font-medium">+{context.user.phone.replace(/^\+/, "")}</dd>
                </div>
              ) : null}
              <div className="grid gap-0.5">
                <dt className="text-muted-foreground">Établissement actif</dt>
                <dd className="font-medium">{context.organization.name}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-muted-foreground">Profils</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {[...context.personas].map((persona) => (
                    <Badge key={persona} tone="primary">
                      {PERSONA_LABELS[persona]}
                    </Badge>
                  ))}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Changer le mot de passe</CardTitle>
            <CardDescription>Le changement est enregistré dans le journal d&apos;audit.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResetPasswordForm redirectTo="/mon-compte" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
