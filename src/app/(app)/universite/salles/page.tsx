import { DoorOpen, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog, type QuickField } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { saveRoom, toggleRoom } from "@/features/university/actions";
import { ToggleButton } from "@/features/university/components/toggle-button";
import { UniversityHeader } from "@/features/university/components/university-header";
import { ROOM_TYPES } from "@/features/university/config";
import { requireUniversity } from "@/features/university/guard";
import { universityRooms } from "@/features/university/queries";
import { can } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Salles" };

const val = (v: unknown) => (v === null || v === undefined ? undefined : String(v));
function roomFields(v: Record<string, unknown> = {}): QuickField[] {
  return [
    { name: "name", label: "Nom", required: true, defaultValue: val(v.name), placeholder: "Amphithéâtre A" },
    { name: "room_type", label: "Type", type: "select", required: true, options: Object.entries(ROOM_TYPES).map(([value, label]) => ({ value, label })), defaultValue: val(v.room_type) ?? "cours" },
    { name: "number", label: "Numéro", defaultValue: val(v.number) },
    { name: "building", label: "Bâtiment", defaultValue: val(v.building) },
    { name: "capacity", label: "Capacité (places)", type: "number", min: 1, max: 5000, defaultValue: val(v.capacity) },
    { name: "equipment", label: "Équipements", type: "textarea", defaultValue: val(v.equipment), placeholder: "Vidéoprojecteur, sonorisation, 30 postes…" },
  ];
}

export default async function UniversityRoomsPage() {
  const context = await requireUniversity(["academic.read"]);
  const rooms = await universityRooms(context.organization.id);
  const manage = can(context, "academic.manage");
  const seats = rooms.filter((r) => r.is_available).reduce((s, r) => s + (r.capacity ?? 0), 0);

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <UniversityHeader
        title="Salles"
        description="Salles de cours, amphithéâtres, laboratoires et salles informatiques : capacité, équipements et disponibilité. L'emploi du temps refuse deux cours dans la même salle au même moment."
        actions={manage ? <QuickFormDialog title="Nouvelle salle" triggerLabel="Nouvelle salle" action={saveRoom} fields={roomFields()} /> : null}
      />
      <p className="text-sm text-muted-foreground">
        {rooms.filter((r) => r.is_available).length} salle(s) disponible(s) · {seats} places ·{" "}
        <Link href="/emploi-du-temps" className="text-primary underline-offset-2 hover:underline">
          occupation dans l&apos;emploi du temps
        </Link>
      </p>
      <Card>
        {rooms.length === 0 ? (
          <CardContent>
            <EmptyState icon={DoorOpen} title="Aucune salle" />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Salle</TH>
                <TH>Type</TH>
                <TH>Capacité</TH>
                <TH>Équipements</TH>
                <TH>Disponibilité</TH>
                {manage ? <TH className="text-right">Actions</TH> : null}
              </TR>
            </THead>
            <tbody>
              {rooms.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <span className="grid">
                      <span className="font-medium">{r.name}</span>
                      <span className="text-xs text-muted-foreground">{[r.number, r.building].filter(Boolean).join(" · ") || "—"}</span>
                    </span>
                  </TD>
                  <TD className="text-sm">{ROOM_TYPES[r.room_type ?? ""] ?? "—"}</TD>
                  <TD className="text-sm">{r.capacity ?? "—"}</TD>
                  <TD className="max-w-xs text-sm">{r.equipment ?? "—"}</TD>
                  <TD>{r.is_available ? <Badge tone="success">Disponible</Badge> : <Badge tone="neutral">Indisponible</Badge>}</TD>
                  {manage ? (
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        <QuickFormDialog
                          title={`Modifier ${r.name}`}
                          action={saveRoom}
                          hidden={{ id: r.id }}
                          fields={roomFields(r)}
                          trigger={
                            <Button variant="ghost" size="sm" aria-label={`Modifier ${r.name}`}>
                              <Pencil aria-hidden />
                            </Button>
                          }
                        />
                        <ToggleButton id={r.id} active={r.is_available} action={toggleRoom} label={`la salle ${r.name}`} onLabel="Rendre disponible" offLabel="Rendre indisponible" />
                      </div>
                    </TD>
                  ) : null}
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
