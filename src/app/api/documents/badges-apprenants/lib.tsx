import "server-only";

import { loadStudentCard } from "@/features/cards/server";
import type { DocumentRequest } from "@/features/documents/generate";
import { StudentCardPdfPages } from "@/features/documents/pdf/student-card";

/**
 * Pages des cartes actives (recto + verso, design de l'établissement) des
 * élèves, apprenants ou étudiants demandés, triées par nom ; impression comptée.
 * Le QR contient le jeton du badge ACTIF.
 */
export async function learnerBadgePages(req: DocumentRequest, studentIds: string[]) {
  const loaded = [];
  for (const id of studentIds) {
    const card = await loadStudentCard(req.supabase, req.organization.id, id);
    if (card?.badge) loaded.push(card);
  }
  loaded.sort((a, b) => `${a.card.holder.lastName} ${a.card.holder.firstName}`.localeCompare(`${b.card.holder.lastName} ${b.card.holder.firstName}`, "fr"));
  const pages = [];
  for (const item of loaded) {
    pages.push(<StudentCardPdfPages key={item.badge!.id} card={item.card} design={item.design} />);
    await req.supabase
      .from("student_badges")
      .update({ printed_count: item.badge!.printed_count + 1, last_printed_at: new Date().toISOString() })
      .eq("id", item.badge!.id);
  }
  return pages;
}
