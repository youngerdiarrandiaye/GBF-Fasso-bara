import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServerFetch } from "./server-fetch";

/**
 * Rafraîchit la session Supabase (cookies) à chaque requête et protège les
 * routes de l'Espace Agent : un utilisateur non authentifié est redirigé
 * vers /login. La vérification fine du rôle (agent vs admin) et des
 * policies RLS reste faite plus bas (layouts + policies base de données) —
 * ce middleware ne fait qu'un contrôle rapide de présence de session.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    global: { fetch: supabaseServerFetch },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // "/api/health" est interrogée par NetworkStatusBanner (docs/toast-et-coherence-donnees.md
  // §9 V3.2) comme health-check de connectivité générique — ne doit jamais être
  // redirigée vers /login, sous peine de fausser la détection réseau pour un
  // utilisateur dont la session vient d'expirer.
  const isPublicRoute =
    pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/api/health");

  if (!user && !isPublicRoute) {
    const redirectUrl = new URL("/login", request.url);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
