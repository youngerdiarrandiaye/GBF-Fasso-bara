import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseServerFetch } from "./server-fetch";

/**
 * Client Supabase `service_role` — STRICTEMENT réservé aux Server Actions
 * serveur (jamais importé par un composant client, jamais renvoyé au
 * navigateur). Le paquet `server-only` fait échouer le build si ce fichier
 * est jamais importé depuis un module client par erreur.
 *
 * Périmètre d'usage volontairement minimal : la SEULE opération qui exige
 * réellement `service_role` dans l'Espace Admin est la création d'un compte
 * utilisateur (`supabase.auth.admin.createUser`), qui n'a pas d'équivalent
 * possible via l'anon key + RLS (créer une ligne dans `auth.users` n'est pas
 * une opération PostgREST classique). Toutes les autres écritures Admin
 * (modification de rôle, désactivation, stock, factures, paiements...)
 * passent par le client standard authentifié (`lib/supabase/server.ts`), qui
 * reste filtré par les policies RLS de `architecte-bdd` — aucun contournement
 * de RLS n'est fait ici pour ces cas.
 *
 * Variable d'environnement `SUPABASE_SERVICE_ROLE_KEY` : volontairement SANS
 * préfixe `NEXT_PUBLIC_`, donc jamais injectée dans le bundle navigateur par
 * Next.js. Signalé à expert-securite : ce fichier est le seul point d'entrée
 * `service_role` du projet, à auditer en priorité.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis côté serveur (voir .env.local.example). Ne jamais préfixer SUPABASE_SERVICE_ROLE_KEY par NEXT_PUBLIC_."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    global: { fetch: supabaseServerFetch },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
