"use client";

import { Check, Lock, Minus } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";

import { toggleRolePermission } from "@/features/security/actions";
import { cn } from "@/lib/utils/cn";

type Role = { id: string; name: string; key: string };
type Permission = { code: string; label: string; module: string };

const MODULES: Record<string, string> = {
  settings: "Paramètres et sécurité",
  academic: "Structure académique",
  staff: "Personnel et pointage",
  students: "Élèves",
  enrollments: "Inscriptions",
  pedagogy: "Pédagogie",
  finance: "Finances",
  documents: "Documents",
  communication: "Communication",
  reports: "Rapports",
  portals: "Portails",
  assistant: "Assistant",
};

/**
 * Matrice rôles × permissions. Modifiable avec roles.manage (mise à jour
 * optimiste, contrôle et journalisation côté serveur) ; le rôle Administrateur
 * est verrouillé pour éviter de se retirer ses propres accès.
 */
export function PermissionMatrix({
  roles,
  permissions,
  grants,
  editable,
}: {
  roles: Role[];
  permissions: Permission[];
  grants: string[];
  editable: boolean;
}) {
  const [optimistic, apply] = useOptimistic(new Set(grants), (state, change: { key: string; on: boolean }) => {
    const next = new Set(state);
    if (change.on) next.add(change.key);
    else next.delete(change.key);
    return next;
  });
  const [, startTransition] = useTransition();
  const [module, setModule] = useState<string>("all");
  const modules = [...new Set(permissions.map((p) => p.module))];
  const visible = permissions.filter((p) => module === "all" || p.module === module);

  const toggle = (role: Role, code: string) => {
    const key = `${role.id}:${code}`;
    const on = !optimistic.has(key);
    const formData = new FormData();
    formData.set("role_id", role.id);
    formData.set("permission", code);
    formData.set("enabled", String(on));
    startTransition(async () => {
      apply({ key, on });
      await toggleRolePermission(formData);
    });
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Modules">
        {["all", ...modules].map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={module === m}
            onClick={() => setModule(m)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              module === m ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface hover:bg-surface-muted",
            )}
          >
            {m === "all" ? "Tous les modules" : (MODULES[m] ?? m)}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr>
              <th className="sticky left-0 z-20 min-w-64 bg-surface px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Permission</th>
              {roles.map((r) => (
                <th key={r.id} className="min-w-24 px-2 py-3 text-center text-xs font-semibold">
                  <span className="inline-flex items-center gap-1">
                    {r.key === "org_admin" ? <Lock className="size-3 text-muted-foreground" aria-label="Verrouillé" /> : null}
                    {r.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((p, index) => {
              const header = index === 0 || visible[index - 1]!.module !== p.module;
              return (
                <FragmentRow key={p.code} header={header ? (MODULES[p.module] ?? p.module) : null} colSpan={roles.length + 1}>
                  <tr className="border-t border-border hover:bg-background/70">
                    <td className="sticky left-0 z-[1] bg-surface px-4 py-2">
                      <span className="grid">
                        <span className="font-medium">{p.label}</span>
                        <code className="text-[11px] text-muted-foreground">{p.code}</code>
                      </span>
                    </td>
                    {roles.map((r) => {
                      const on = optimistic.has(`${r.id}:${p.code}`);
                      const locked = !editable || r.key === "org_admin";
                      return (
                        <td key={r.id} className="px-2 py-2 text-center">
                          <button
                            type="button"
                            disabled={locked}
                            aria-pressed={on}
                            aria-label={`${p.label} — ${r.name}`}
                            onClick={() => toggle(r, p.code)}
                            className={cn(
                              "inline-flex size-7 items-center justify-center rounded-lg border transition-all duration-150",
                              on ? "border-success bg-success text-white" : "border-border bg-surface text-muted-foreground/40",
                              !locked && "hover:scale-110 hover:shadow",
                              locked && "cursor-default opacity-80",
                            )}
                          >
                            {on ? <Check className="size-4" aria-hidden /> : <Minus className="size-3.5" aria-hidden />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({ header, colSpan, children }: { header: string | null; colSpan: number; children: React.ReactNode }) {
  return (
    <>
      {header ? (
        <tr className="bg-surface-muted/70">
          <td colSpan={colSpan} className="sticky left-0 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
            {header}
          </td>
        </tr>
      ) : null}
      {children}
    </>
  );
}
