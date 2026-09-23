import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/** Routes accessibles sans session. */
// /api/cron : protégé par CRON_SECRET (pas de session utilisateur).
const PUBLIC_PATHS = ["/connexion", "/mot-de-passe-oublie", "/auth", "/verifier", "/configuration", "/api/cron", "/demo", "/hors-ligne"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
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
