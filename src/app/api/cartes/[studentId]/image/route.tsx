import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { CARD_HEIGHT, CARD_WIDTH, CardBack, CardFront } from "@/features/cards/card-faces";
import { loadStudentCard } from "@/features/cards/server";
import { denyDocument, hasAll, openDocumentRequest } from "@/features/documents/generate";
import { errorResponse, logDocumentEvent } from "@/features/documents/server";
import { safeFileName } from "@/lib/pdf/format";
import { isUuid } from "@/lib/utils/search-params";

const GAP = 40;

/** Polices Poppins (SIL OFL, public/fonts) : mêmes graisses qu'à l'écran. */
async function fonts() {
  const dir = path.join(process.cwd(), "public", "fonts");
  const load = (file: string) => readFile(path.join(dir, file));
  const weights = [400, 500, 600, 700, 800] as const;
  const regular = await Promise.all(weights.map(async (weight) => ({ name: "Poppins", data: await load(`Poppins-${weight}.ttf`), weight, style: "normal" as const })));
  return [...regular, { name: "Poppins", data: await load("Poppins-600-italic.ttf"), weight: 600 as const, style: "italic" as const }];
}

/** Image PNG de la carte (recto et verso côte à côte), téléchargée ; export compté. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/cartes/[studentId]/image">) {
  const { studentId } = await ctx.params;
  if (!isUuid(studentId)) return errorResponse(404, "Titulaire introuvable.");
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  if (!hasAll(req, "students.badges.manage")) return denyDocument(req, "carte", { type: "students", id: studentId });
  const loaded = await loadStudentCard(req.supabase, req.organization.id, studentId);
  if (!loaded) return errorResponse(404, "Titulaire introuvable.");
  if (!loaded.badge) return errorResponse(409, "Aucune carte active : générez d'abord la carte.");
  const image = new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "row", gap: GAP, padding: GAP, background: "#eef2f7" }}>
        <CardFront card={loaded.card} design={loaded.design} fontFamily="Poppins" />
        <CardBack card={loaded.card} design={loaded.design} fontFamily="Poppins" />
      </div>
    ),
    { width: CARD_WIDTH * 2 + GAP * 3, height: CARD_HEIGHT + GAP * 2, fonts: await fonts() },
  );
  const bytes = await image.arrayBuffer();
  await req.supabase
    .from("student_badges")
    .update({ printed_count: loaded.badge.printed_count + 1, last_printed_at: new Date().toISOString() })
    .eq("id", loaded.badge.id);
  await logDocumentEvent(req.supabase, req.organization.id, "document.student_card", `${loaded.card.title} exportée (image)`, { type: "students", id: studentId });
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${safeFileName(`carte-${loaded.card.holder.matricule}`)}.png"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
