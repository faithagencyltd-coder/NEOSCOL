import { KeyRound, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { createRole } from "@/features/security/actions";
import { PermissionMatrix } from "@/features/security/components/permission-matrix";
import { requireOrganization } from "@/lib/auth/guards";
import { can, canAny } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Rôles et permissions" };

const PERSONA: Record<string, string> = { staff: "Personnel", teacher: "Enseignant", parent: "Portail parent", student: "Portail élève" };

/** Rôles de l'établissement et matrice des permissions (RBAC). */
export default async function RolesPage() {
  const context = await requireOrganization();
  if (!canAny(context, ["users.read", "roles.manage"])) notFound();
  const manage = can(context, "roles.manage");
  const supabase = await createClient();
  const [{ data: roles }, { data: permissions }, { data: members }] = await Promise.all([
    supabase.from("roles").select("id, key, name, description, persona, is_system, role_permissions(permission_code)").eq("organization_id", context.organization.id),
    supabase.from("permissions").select("code, label, module, sort_order").order("sort_order"),
    supabase.from("membership_roles").select("role_id").eq("organization_id", context.organization.id),
  ]);
  const ordered = (roles ?? []).sort((a, b) => Number(b.is_system) - Number(a.is_system) || a.name.localeCompare(b.name, "fr"));
  const memberCount = (id: string) => (members ?? []).filter((m) => m.role_id === id).length;
  const grants = ordered.flatMap((r) => r.role_permissions.map((rp) => `${r.id}:${rp.permission_code}`));

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Rôles et permissions"
        description="Chaque action est contrôlée par une permission, dans l'interface ET dans la base de données (RLS). Cacher un bouton ne suffit jamais."
        actions={
          manage ? (
            <QuickFormDialog
              title="Nouveau rôle"
              description="Un rôle personnalisé pour le personnel ; ses permissions se règlent ensuite dans la matrice."
              triggerLabel="Nouveau rôle"
              action={createRole}
              fields={[
                { name: "name", label: "Nom du rôle", required: true, wide: true },
                { name: "description", label: "Description", wide: true },
                { name: "copy_from", label: "Copier les permissions de", type: "select", options: ordered.map((r) => ({ value: r.id, label: r.name })), wide: true },
              ]}
              submitLabel="Créer le rôle"
            />
          ) : null
        }
      />
      {!manage ? <Alert tone="info">Consultation seule : la modification des rôles nécessite la permission « roles.manage ».</Alert> : null}
      <section aria-label="Rôles" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ordered.map((r, i) => (
          <Card key={r.id} className="rise grid gap-2 p-4" style={{ "--delay": `${Math.min(i, 10) * 30}ms` } as React.CSSProperties}>
            <div className="flex items-start justify-between gap-2">
              <span className="flex items-center gap-2 font-semibold">
                {r.key === "org_admin" ? <ShieldCheck className="size-4 text-primary" aria-hidden /> : <KeyRound className="size-4 text-primary" aria-hidden />}
                {r.name}
              </span>
              {r.is_system ? <Badge>Système</Badge> : <Badge tone="info">Personnalisé</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">{r.description ?? "—"}</p>
            <p className="text-xs">
              <span className="font-semibold">{r.role_permissions.length}</span> permission(s) · <span className="font-semibold">{memberCount(r.id)}</span> compte(s) ·{" "}
              {PERSONA[r.persona] ?? r.persona}
            </p>
          </Card>
        ))}
      </section>
      <section aria-labelledby="matrix-title" className="grid gap-3">
        <h2 id="matrix-title" className="text-lg font-semibold">
          Matrice des permissions
        </h2>
        <PermissionMatrix
          roles={ordered.map((r) => ({ id: r.id, name: r.name, key: r.key }))}
          permissions={(permissions ?? []).map((p) => ({ code: p.code, label: p.label, module: p.module }))}
          grants={grants}
          editable={manage}
        />
      </section>
    </div>
  );
}
