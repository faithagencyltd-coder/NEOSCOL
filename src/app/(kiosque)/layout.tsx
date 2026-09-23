import { notFound } from "next/navigation";

import { requireOrganization } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";

/** Écran tablette plein cadre (sans navigation) : réservé à staff_attendance.scan. */
export default async function KioskLayout({ children }: { children: React.ReactNode }) {
  const context = await requireOrganization();
  if (!can(context, "staff_attendance.scan")) notFound();
  return <div className="min-h-dvh bg-[#07142b] text-white">{children}</div>;
}
