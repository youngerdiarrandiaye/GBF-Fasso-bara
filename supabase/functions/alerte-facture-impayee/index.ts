// supabase/functions/alerte-facture-impayee/index.ts
//
// Scan quotidien de complément pour les alertes de retard de paiement (J+10).
//
// IMPORTANT — lire avant de modifier ce fichier :
// Le schéma SQL (0009_alertes_paiement.sql) implémente déjà ENTIÈREMENT la
// règle métier 10 :
//   - La vue `v_factures_retard_paiement` calcule dynamiquement, à chaque
//     interrogation, les factures validées/partiellement payées dont le
//     solde reste dû plus de 10 jours après `date_validation`.
//   - La fonction SQL `scanner_alertes_factures_impayees()` fait TOUT le
//     travail de sélection/upsert/auto-résolution des alertes, et est déjà
//     planifiée via `cron.schedule('scan-alertes-factures-quotidien',
//     '0 6 * * *', ...)` directement en base — donc DÉJÀ opérationnelle
//     sans cette fonction.
//   - La table `alertes_factures` est déjà ajoutée à la publication
//     `supabase_realtime` : tout INSERT/UPDATE y est donc déjà diffusé
//     nativement via `postgres_changes`, sans code applicatif supplémentaire.
//
// Cette Edge Function ne réimplémente PAS la sélection "factures en retard"
// (ce serait un recalcul interdit d'une règle déjà couverte par une fonction
// SQL SECURITY DEFINER). Elle appelle la fonction SQL existante via RPC et ne
// diffuse volontairement AUCUN Realtime Broadcast : un Broadcast n'est PAS
// soumis aux policies RLS (contrairement à `postgres_changes`, déjà actif sur
// `alertes_factures` via la publication `supabase_realtime`), ce qui
// exposerait nom/téléphone client et montants dus à quiconque possède la clé
// `anon` (cf. audit expert-securite du 2026-08-10). `PaymentAlertsBell.tsx`
// s'abonne déjà à `postgres_changes` sur `alertes_factures`, protégé par la
// policy `alertes_factures_admin_all` (admin-only) — rien de plus à faire ici.

import {
  createServiceClient,
  createUserClient,
  getAuthHeader,
  getEnv,
  resolveCallerId,
} from "../_shared/clients.ts";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée, utilisez POST." }, 405);
  }

  const authError = await verifierAppelantAutorise(req);
  if (authError) return authError;

  try {
    const serviceClient = createServiceClient();

    // 1) Délègue entièrement la logique de sélection/upsert/auto-résolution
    //    à la fonction SQL existante (aucune règle métier recalculée ici).
    const { error: rpcError } = await serviceClient.rpc(
      "scanner_alertes_factures_impayees",
    );
    if (rpcError) {
      console.error(
        "alerte-facture-impayee: échec RPC scanner_alertes_factures_impayees",
        rpcError,
      );
      return jsonResponse(
        { error: "Échec du scan quotidien des retards de paiement." },
        500,
      );
    }

    // 2) Compte les alertes actives (non lues) pour la réponse — aucune
    //    diffusion Broadcast : `alertes_factures` est déjà dans la
    //    publication `supabase_realtime`, donc déjà diffusée nativement via
    //    `postgres_changes` (protégé par RLS, contrairement à un Broadcast).
    const { count: alertesActives, error: countError } = await serviceClient
      .from("alertes_factures")
      .select("id", { count: "exact", head: true })
      .eq("lue", false);

    if (countError) {
      console.error(
        "alerte-facture-impayee: échec lecture alertes_factures",
        countError,
      );
      return jsonResponse({ error: "Échec de lecture des alertes actives." }, 500);
    }

    return jsonResponse({
      scan_effectue: true,
      alertes_actives: alertesActives ?? 0,
    });
  } catch (err) {
    console.error("alerte-facture-impayee: erreur inattendue", err);
    return jsonResponse(
      { error: "Erreur interne lors du scan des alertes de retard de paiement." },
      500,
    );
  }
});

/**
 * Autorise soit un appel serveur-à-serveur (pg_cron via pg_net, ou tout
 * appelant connaissant la clé service_role — jamais exposée au frontend),
 * soit un déclenchement manuel par un compte admin authentifié (pratique
 * pour un test qa-testeur ou un bouton "Scanner maintenant" côté dashboard).
 * Retourne une Response d'erreur si refusé, sinon `null`.
 */
async function verifierAppelantAutorise(req: Request): Promise<Response | null> {
  const { SUPABASE_SERVICE_ROLE_KEY } = getEnv();
  const authHeader = getAuthHeader(req);
  const cronSecretHeader = req.headers.get("x-cron-secret");
  const expectedCronSecret = Deno.env.get("CRON_SECRET");

  if (expectedCronSecret && cronSecretHeader === expectedCronSecret) {
    return null;
  }

  if (!authHeader) {
    return jsonResponse(
      { error: "Authentification requise (service_role, x-cron-secret, ou session admin)." },
      401,
    );
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (token === SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  // Sinon, on tente une authentification "utilisateur admin" classique.
  try {
    const userClient = createUserClient(authHeader);
    const callerId = await resolveCallerId(userClient);
    if (!callerId) {
      return jsonResponse({ error: "Accès réservé au service_role ou à un administrateur." }, 403);
    }
    const { data: profil, error } = await userClient
      .from("utilisateurs")
      .select("role, actif")
      .eq("id", callerId)
      .single();
    if (error || !profil || profil.role !== "admin" || !profil.actif) {
      return jsonResponse({ error: "Accès réservé au service_role ou à un administrateur." }, 403);
    }
    return null;
  } catch (err) {
    console.error("alerte-facture-impayee: échec vérification appelant", err);
    return jsonResponse({ error: "Impossible de vérifier l'identité de l'appelant." }, 401);
  }
}
