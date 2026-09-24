import type { PortalTarget } from "@/features/auth/portals";

/** Champs cachés du lien des portails : l'établissement et le portail sont revérifiés côté serveur. */
export function PortalFields({ portal }: { portal?: PortalTarget }) {
  if (!portal) return null;
  return (
    <>
      <input type="hidden" name="etablissement" value={portal.code} />
      <input type="hidden" name="portail" value={portal.kind} />
    </>
  );
}
