import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { isNativeApp } from "@/lib/native-app";
import type { Database } from "@/types/database";

/** Routes accessibles sans session. */
// /acces : lien des portails d'un établissement (identité publique + formulaires de connexion).
// /api/cron : protégé par CRON_SECRET (pas de session utilisateur).
// /api/webhooks : notifications des fournisseurs de paiement (revérifiées auprès du fournisseur).
// /api/app : identité publique d'un établissement pour l'application mobile (comme /acces).
// /api/site : mesure d'audience anonyme du site public (sans cookie).
// /api/sante : sonde de disponibilité pour un service de surveillance externe (aucune donnée).
// /tarifs, /pricing, /inscription : offre NeoScool et création d'un établissement (essai gratuit).
const PUBLIC_PATHS = [
  "/connexion", "/acces", "/mot-de-passe-oublie", "/auth", "/verifier", "/configuration", "/api/cron", "/api/webhooks", "/api/hooks", "/api/app", "/api/sante", "/api/site",
  "/verification-email", "/console.webmanifest",
  "/demo", "/hors-ligne", "/tarifs", "/pricing", "/inscription",
  // Pages publiques réglées par le Super Admin : aide, conditions générales, confidentialité.
  "/aide", "/conditions", "/confidentialite",
  // Site officiel : accueil (« / » exact), version anglaise, secteurs, pays, contact.
  "/en", "/secteurs", "/pays", "/contact",
  // Écosystème public : annuaire Discover, opportunités, création d'un compte public.
  "/decouvrir", "/opportunites", "/espace/inscription", "/sitemap.xml", "/robots.txt",
  // Support Center : chatbot du site (visiteurs sans compte).
  "/api/support",
];

function isPublicPath(pathname: string): boolean {
  return pathname === "/" || PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Rafraîchit la session Supabase et redirige les visiteurs non connectés. */
export async function updateSession(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!isSupabaseConfigured()) {
    if (isPublicPath(pathname)) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/configuration", request.url));
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getClaims() valide le JWT (signature) : ne jamais se fier à getSession() seul.
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);

  // Application mobile : pas de site vitrine, l'accueil mène à l'espace du compte (ou à la connexion).
  if (pathname === "/" && isNativeApp(request.headers.get("user-agent"))) {
    return NextResponse.redirect(new URL(isAuthenticated ? "/tableau-de-bord" : "/connexion", request.url));
  }

  if (!isAuthenticated && !isPublicPath(pathname)) {
    const loginUrl = new URL("/connexion", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("suite", `${pathname}${search}`);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && (pathname === "/connexion" || pathname === "/mot-de-passe-oublie")) {
    return NextResponse.redirect(new URL("/tableau-de-bord", request.url));
  }

  return response;
}
