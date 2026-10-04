import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseServerFetch } from "./server-fetch";

/**
 * Client Supabase côté serveur (Server Components, Server Actions, Route
 * Handlers). Porte la session de l'utilisateur via les cookies — jamais la
 * clé service_role : toute requête reste filtrée par les policies RLS
 * définies par l'agent architecte-bdd (aucun contournement côté frontend).
 */
export async function createClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY doivent être définis (voir .env.local.example)."
    );
  }

  return createServerClient(url, anonKey, {
    global: { fetch: supabaseServerFetch },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // setAll appelé depuis un Server Component : sans effet si le
          // middleware rafraîchit déjà la session. Sans risque à ignorer ici.
        }
      },
    },
  });
}
