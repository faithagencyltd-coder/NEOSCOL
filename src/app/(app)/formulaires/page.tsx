import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormEditor } from "@/features/forms/components/form-editor";
import { getFormDefinitions } from "@/features/forms/queries";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Formulaires" };

export default async function FormsPage() {
  const context = await requirePermission("enrollments.read");
  const definitions = await getFormDefinitions(context.organization.id);
  const canEdit = can(context, "forms.manage");

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <p className="text-sm text-muted-foreground">Scolarité</p>
        <h1 className="text-2xl font-semibold sm:text-[26px]">Formulaires personnalisables</h1>
        <p className="text-sm text-muted-foreground">
          Ajoutez ou retirez des champs : ils apparaissent aussitôt dans les formulaires et sont validés côté serveur.
          Une « pièce à fournir » se coche à réception du document.
        </p>
      </div>
      {definitions.map((definition) => (
        <Card key={definition.kind}>
          <CardHeader>
            <CardTitle>{definition.title}</CardTitle>
            <CardDescription>
              {definition.description}
              {definition.updatedAt
                ? ` · version ${definition.version}, modifiée le ${formatDateTime(definition.updatedAt, "fr-FR", context.organization.timezone)}`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormEditor kind={definition.kind} fields={definition.fields} canEdit={canEdit} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
