import type { NextRequest } from "next/server";

import { resolveYear, type TimetableTarget } from "@/features/exports/data";
import { uuidList, uuidParam } from "@/features/exports/params";
import { exportTimetables, logDocumentEvent } from "@/features/exports/server";
import { errorResponse } from "@/features/documents/server";
import { canAny, getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Emplois du temps en PDF (créneaux réellement enregistrés) : une page par
 * classe / session / promotion (ou groupe), ou celui d'un enseignant / d'une
 * salle. timetable.read ou timetable.manage requis.
 */
export async function GET(request: NextRequest) {
  const context = await getSessionContext();
  if (!context?.organization) return errorResponse(401, "Session expirée : reconnectez-vous.");
  const organization = context.organization;
  const supabase = await createClient();
  if (!canAny(context, ["timetable.read", "timetable.manage"])) {
    await logDocumentEvent(supabase, organization.id, "export.denied", "Export d'emploi du temps refusé (droit manquant)", { type: "timetable_slots", id: null }, "denied");
    return errorResponse(403, "Vous n'avez pas l'autorisation d'exporter les emplois du temps.");
  }
  const params = request.nextUrl.searchParams;
  const year = await resolveYear(organization.id, uuidParam(params, "annee"));
  if (!year) return errorResponse(404, "Aucune année académique.");
  const teacherId = uuidParam(params, "enseignant");
  const roomId = uuidParam(params, "salle");
  const target: TimetableTarget = teacherId
    ? { kind: "teacher", teacherId }
    : roomId
      ? { kind: "room", roomId }
      : {
          kind: "classes",
          classIds: uuidList(params, "classes"),
          levelId: uuidParam(params, "niveau"),
          programId: uuidParam(params, "filiere"),
          trackId: uuidParam(params, "parcours"),
          groupId: uuidParam(params, "groupe"),
        };
  const result = await exportTimetables(supabase, organization.id, organization.type, year.id, year.name, target);
  if (!result.ok) return errorResponse(result.status, result.message);
  await logDocumentEvent(
    supabase,
    organization.id,
    "export.timetable",
    `Export PDF : ${result.sections} emploi(s) du temps${result.empty ? ` (${result.empty} sans créneau, non inclus)` : ""}`,
    { type: "timetable_slots", id: null },
  );
  return new Response(new Uint8Array(result.body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${params.get("telecharger") === "1" ? "attachment" : "inline"}; filename="${result.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Export-Sections": String(result.sections),
      "X-Export-Empty": String(result.empty),
    },
  });
}
