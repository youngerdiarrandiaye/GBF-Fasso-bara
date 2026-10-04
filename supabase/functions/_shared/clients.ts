// supabase/functions/_shared/clients.ts
//
// Fabriques de clients Supabase pour les Edge Functions GFB-STOCK.
//
// Principe de sécurité appliqué systématiquement dans ce dossier :
//   - `service_role` (SUPABASE_SERVICE_ROLE_KEY) n'est JAMAIS envoyé au
//     client. Il ne sert qu'à l'intérieur de la fonction, pour les
//     opérations qui ne peuvent techniquement pas passer par RLS
//     (écriture dans le bucket privé "factures", lecture large pour un
//     export déjà autorisé, job pg_cron sans utilisateur authentifié...).
//   - Chaque fois que c'est possible, on utilise un client "utilisateur"
//     construit avec le JWT transmis par l'appelant (clé anon +
//     Authorization forwardée). Ce client respecte RLS : c'est lui qui sert
//     de portail d'autorisation (un agent ne peut lire que ses factures,
//     un produit désactivé n'est pas visible, etc.), sans jamais dupliquer
//     la logique métier déjà écrite dans 0001_schema_initial.sql.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

export function getEnv() {
  return {
    SUPABASE_URL: requireEnv("SUPABASE_URL"),
    SUPABASE_ANON_KEY: requireEnv("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    // Optionnelle : voir toPublicUrl() ci-dessous. Ne PAS passer par
    // requireEnv() — absente en production Cloud (SUPABASE_URL y est déjà
    // l'URL publique réelle) et absente par défaut en local tant que le
    // développeur ne l'a pas explicitement renseignée.
    PUBLIC_SUPABASE_URL: Deno.env.get("PUBLIC_SUPABASE_URL") || undefined,
  };
}

/**
 * Réécrit l'origine (protocole + host + port) d'une URL Storage signée pour
 * la rendre utilisable depuis l'extérieur du réseau Docker.
 *
 * Contexte : en développement local (`supabase start`), le runtime des Edge
 * Functions reçoit `SUPABASE_URL=http://kong:8000` — c'est le nom d'hôte
 * INTERNE du conteneur Kong, résolu uniquement à l'intérieur du réseau
 * Docker. Le client `service_role` construit avec cette URL (voir
 * `createServiceClient`) produit donc des URLs signées Storage
 * (`storage.from(...).createSignedUrl(...)`) dont l'origine est
 * `http://kong:8000` : injoignable depuis la machine hôte ou un navigateur.
 * Même chose, potentiellement, pour un déploiement self-hosted derrière une
 * passerelle Kong non exposée directement.
 *
 * En Cloud (production), `SUPABASE_URL` est déjà l'URL publique réelle
 * (`https://xxx.supabase.co`) : il n'y a rien à corriger, et cette fonction
 * ne fait rien tant que `PUBLIC_SUPABASE_URL` n'est pas définie.
 *
 * Seuls le protocole, le host et le port sont remplacés : le chemin (bucket,
 * dossier, nom de fichier) et la query string (notamment le `token` de
 * signature) sont conservés strictement intacts, pour ne pas invalider la
 * signature.
 *
 * Nom de variable choisi (`PUBLIC_SUPABASE_URL`, et non `SUPABASE_PUBLIC_URL`) :
 * testé en conditions réelles contre `supabase start`, le CLI Supabase rejette
 * silencieusement (avec un simple warning en log, aucune erreur bloquante)
 * toute variable de `supabase/functions/.env` dont le nom COMMENCE par
 * `SUPABASE_` : `Env name cannot start with SUPABASE_, skipping: ...`. Cette
 * même restriction existe côté Supabase Cloud pour `supabase secrets set`
 * (préfixe réservé à l'usage interne de la plateforme). D'où le nom retenu
 * ici, qui ne commence pas par ce préfixe et fonctionne donc réellement dans
 * les deux environnements.
 */
export function toPublicUrl(url: string): string {
  const publicBase = Deno.env.get("PUBLIC_SUPABASE_URL");
  if (!publicBase) return url;

  try {
    const target = new URL(url);
    const base = new URL(publicBase);
    target.protocol = base.protocol;
    target.host = base.host; // hostname (+ port éventuel)
    return target.toString();
  } catch (err) {
    console.warn(
      "toPublicUrl: PUBLIC_SUPABASE_URL ou URL signée invalide, URL retournée telle quelle",
      err,
    );
    return url;
  }
}

/**
 * Client "service_role" : bypass RLS. Réservé aux opérations qui l'exigent
 * techniquement (Storage bucket privé, job pg_cron sans JWT utilisateur).
 * Ne jamais renvoyer ce client ni sa clé au frontend.
 */
export function createServiceClient(): SupabaseClient {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getEnv();
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Client "utilisateur" : forward le JWT de l'appelant (header Authorization
 * de la requête entrante) avec la clé anon. Toutes les requêtes faites avec
 * ce client passent par RLS exactement comme si elles venaient du frontend
 * (auth.uid() = l'utilisateur réel). C'est le portail d'autorisation.
 */
export function createUserClient(authHeader: string): SupabaseClient {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getEnv();
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Récupère et valide le header Authorization d'une requête entrante. */
export function getAuthHeader(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) return null;
  return header;
}

/**
 * Résout l'id de l'appelant à partir de son JWT (validé côté serveur par
 * Supabase Auth) — à appeler AVANT toute lecture "self-select" sur la table
 * `utilisateurs` via un `userClient`.
 *
 * Piège évité : `utilisateurs` porte la policy `utilisateurs_admin_all`
 * (`FOR ALL USING (is_admin())`, sans restriction de ligne) EN PLUS de
 * `utilisateurs_self_select` (`id = auth.uid()`) — les policies RLS
 * s'additionnent (OR), donc un `.from("utilisateurs").select(...).single()`
 * sans `.eq("id", ...)` explicite renvoie TOUTES les lignes dès que
 * l'appelant est admin et qu'il existe plus d'un compte dans la table :
 * PostgREST échoue alors avec "JSON object requested, multiple ... rows
 * returned" (PGRST116). Bug réel constaté sur `export-rapport` dès qu'un
 * second compte (agent) a existé en base — mêmes symptômes latents dans
 * `alerte-stock-bas`/`alerte-facture-impayee` (chemin "déclenchement manuel
 * admin"). Toujours filtrer explicitement par l'id résolu ici, jamais
 * compter sur RLS seul pour scoper une lecture "mon propre profil".
 */
export async function resolveCallerId(userClient: SupabaseClient): Promise<string | null> {
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) return null;
  return data.user.id;
}
