import { requireModule } from "@/lib/auth/guards";

/** Page propre au module scolaire : introuvable pour un centre de formation ou une université. */
export default async function SchoolModuleLayout({ children }: { children: React.ReactNode }) {
  await requireModule("school");
  return children;
}
