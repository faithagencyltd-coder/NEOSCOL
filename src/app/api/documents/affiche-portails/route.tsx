import { Document, renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";

import { PORTALS } from "@/features/auth/portals";
import { denyDocument, hasAll, openDocumentRequest } from "@/features/documents/generate";
import { PortalPosterPage } from "@/features/documents/pdf/portal-poster";
import { loadImages, logDocumentEvent, pdfResponse } from "@/features/documents/server";
import { qrDataUrl } from "@/lib/pdf/qr";
import { portalLinkUrl } from "@/lib/site-url";

/** Affiche imprimable (A4) du lien des portails de l'établissement actif. */
export async function GET(request: NextRequest) {
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  if (!hasAll(req, "settings.manage")) return denyDocument(req, "affiche des portails", { type: "organizations", id: req.organization.id });
  const url = await portalLinkUrl(req.organization.code);
  const images = await loadImages(req.supabase, req.organization);
  const pdf = await renderToBuffer(
    <Document title={`Portails — ${req.organization.name}`} author="NéoScol" language="fr">
      <PortalPosterPage
        organization={req.organization}
        images={images}
        url={url}
        qr={await qrDataUrl(url, "#000000")}
        portals={(["parent", "enseignant", "eleve"] as const).map((k) => PORTALS[k])}
      />
    </Document>,
  );
  await logDocumentEvent(req.supabase, req.organization.id, "document.portal_poster", "Affiche du lien des portails", { type: "organizations", id: req.organization.id });
  return pdfResponse(pdf, `portails-${req.organization.code}`, request.nextUrl.searchParams.has("telecharger"));
}
