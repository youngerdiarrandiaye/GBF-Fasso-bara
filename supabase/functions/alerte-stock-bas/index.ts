// supabase/functions/alerte-stock-bas/index.ts
//
// Scan quotidien de complément pour les alertes de stock bas.
//
// IMPORTANT — lire avant de modifier ce fichier :
// Le schéma SQL implémente déjà ENTIÈREMENT la règle métier 6, désormais
// scopée PAR ENTREPÔT (règle 16, supabase/migrations/0013_avenant_credit_entrepots.sql) :
//   - Le trigger `verifier_seuil_stock_entrepot()` (0013, section 15.3) crée
//     une alerte en TEMPS RÉEL dès qu'un couple (produit, entrepôt) passe
//     sous son seuil (INSERT/UPDATE sur `stock_entrepot`, PAS `produits` :
//     `produits.quantite_stock`/`seuil_alerte` sont DÉPRÉCIÉES depuis 0013,
//     gelées, plus jamais mises à jour — cf. en-tête de cette migration).
//   - La fonction SQL `scanner_alertes_stock_quotidien()` (0013, section 15.4,
//     CREATE OR REPLACE du même nom que 0001 : le job pg_cron existant
//     continue de l'appeler sans reconfiguration) est le filet de sécurité
//     quotidien (ex: seuil abaissé sans mouvement de stock), déjà planifiée
//     via `cron.schedule('scan-alertes-stock-quotidien', '0 6 * * *', ...)`
//     directement en base — donc DÉJÀ opérationnelle sans cette fonction, et
//     scanne désormais `stock_entrepot` au lieu de `produits`.
//   - `alertes_stock.entrepot_id` (0013, section 10.3, NOT NULL) : chaque
//     alerte précise désormais l'entrepôt concerné, et le message SQL généré
//     inclut déjà son nom (ex. `Stock bas pour "Spray Tube HYB1-3" à
//     l'entrepôt "Thiès" : 2 restant(s), seuil d'alerte 5`).
//   - La table `alertes_stock` est déjà ajoutée à la publication
//     `supabase_realtime` : tout INSERT y est donc déjà diffusé nativement
//     via `postgres_changes`, sans code applicatif supplémentaire.
//
// Cette Edge Function ne réimplémente PAS la sélection "produits sous seuil,
// par entrepôt" (ce serait un recalcul interdit d'une règle déjà couverte par
// un trigger SQL) : son rôle n'a PAS changé de nature avec l'avenant
// multi-entrepôts, seule la FORME des données qu'elle lit/relaie change
// (jointure `entrepot_id` en plus de `produit_id`, abandon des colonnes
// dépréciées `produits.quantite_stock`/`seuil_alerte` au profit de
// `stock_entrepot.quantite_stock`/`seuil_alerte`). Elle appelle la fonction
// SQL existante via RPC, puis ajoute une valeur incrémentale : un événement
// Realtime Broadcast enrichi (produit + entrepôt + message déjà joints en un
// seul payload) sur le canal `alertes_stock`, plus pratique à consommer pour
// le dashboard admin qu'un flux brut de changements de ligne. Voir README.md
// pour la recommandation de câblage pg_cron -> cette fonction (optionnelle,
// en complément du scan SQL direct déjà en place).

import {
  createServiceClient,
  createUserClient,
  getAuthHeader,
  getEnv,
  resolveCallerId,
} from "../_shared/clients.ts";
import { avecCors, handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";

const REALTIME_BROADCAST_TOPIC = "alertes_stock";
const REALTIME_BROADCAST_EVENT = "stock_bas_quotidien";

Deno.serve(avecCors(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée, utilisez POST." }, 405);
  }

  const authError = await verifierAppelantAutorise(req);
  if (authError) return authError;

  try {
    const serviceClient = createServiceClient();

    // 1) Délègue entièrement la logique de sélection/insertion à la fonction
    //    SQL existante (aucune règle métier recalculée ici).
    const { error: rpcError } = await serviceClient.rpc("scanner_alertes_stock_quotidien");
    if (rpcError) {
      console.error("alerte-stock-bas: échec RPC scanner_alertes_stock_quotidien", rpcError);
      return jsonResponse({ error: "Échec du scan quotidien des seuils de stock." }, 500);
    }

    // 2) Récupère les alertes actives (non lues) pour construire un payload
    //    de diffusion enrichi (produit + entrepôt déjà joints) pour le
    //    dashboard admin. `produit_id`/`entrepot_id` sont conservés à plat
    //    (en plus des ressources imbriquées) pour permettre l'enrichissement
    //    par quantité/seuil réels à l'étape 2bis, sans avoir à reparser les
    //    objets imbriqués.
    const { data: alertes, error: selectError } = await serviceClient
      .from("alertes_stock")
      .select(
        `
        id, type, message, created_at, produit_id, entrepot_id,
        produit:produit_id ( id, code, nom ),
        entrepot:entrepot_id ( id, nom )
      `,
      )
      .eq("lue", false)
      .order("created_at", { ascending: false });

    if (selectError) {
      console.error("alerte-stock-bas: échec lecture alertes_stock", selectError);
      return jsonResponse({ error: "Échec de lecture des alertes actives." }, 500);
    }

    // 2bis) Enrichissement PAR ENTREPÔT : quantite_stock/seuil_alerte réels
    //    proviennent désormais de `stock_entrepot` (règle 16, 0013), plus de
    //    `produits.quantite_stock`/`seuil_alerte` (dépréciées, gelées). Ces
    //    deux tables n'ayant pas de relation directe exploitable par
    //    PostgREST pour un embed imbriqué à 2 niveaux (produit_id ET
    //    entrepot_id combinés), on récupère les lignes `stock_entrepot`
    //    concernées en un second appel (bornées aux produits/entrepôts déjà
    //    présents dans `alertes`, jamais un scan complet de la table) et on
    //    les associe en mémoire par la clé composite (produit_id, entrepot_id)
    //    — cette même clé est unique en base (stock_entrepot_produit_entrepot_unique,
    //    0013 section 3), donc l'association ci-dessous est sans ambiguïté.
    const produitIds = [...new Set((alertes ?? []).map((a: any) => a.produit_id))];
    const entrepotIds = [...new Set((alertes ?? []).map((a: any) => a.entrepot_id))];

    let stockParCle = new Map<string, { quantite_stock: number; seuil_alerte: number }>();
    if (produitIds.length > 0 && entrepotIds.length > 0) {
      const { data: stocks, error: stockError } = await serviceClient
        .from("stock_entrepot")
        .select("produit_id, entrepot_id, quantite_stock, seuil_alerte")
        .in("produit_id", produitIds)
        .in("entrepot_id", entrepotIds);

      if (stockError) {
        // Non bloquant : le scan/l'insertion en base (étape 1) a déjà réussi,
        // et le `message` de chaque alerte contient déjà la quantité/le seuil
        // en toutes lettres (généré côté SQL) — seul l'enrichissement
        // structuré du payload de diffusion est perdu.
        console.error("alerte-stock-bas: échec lecture stock_entrepot (enrichissement non bloquant)", stockError);
      } else {
        stockParCle = new Map(
          (stocks ?? []).map((s: any) => [
            `${s.produit_id}:${s.entrepot_id}`,
            { quantite_stock: s.quantite_stock, seuil_alerte: s.seuil_alerte },
          ]),
        );
      }
    }

    const alertesEnrichies = (alertes ?? []).map((a: any) => ({
      ...a,
      stock: stockParCle.get(`${a.produit_id}:${a.entrepot_id}`) ?? null,
    }));

    // 3) Diffusion Realtime Broadcast (REST, sans ouverture de WebSocket
    //    persistante — adapté à une fonction courte durée déclenchée par
    //    pg_cron). Best-effort : une panne de diffusion ne doit pas faire
    //    échouer le scan lui-même (déjà garanti en base à l'étape 1).
    let diffusionOk = true;
    try {
      await diffuserBroadcast(alertesEnrichies);
    } catch (err) {
      diffusionOk = false;
      console.error("alerte-stock-bas: échec diffusion Realtime Broadcast", err);
    }

    return jsonResponse({
      scan_effectue: true,
      alertes_actives: alertes?.length ?? 0,
      diffusion_realtime: diffusionOk,
    });
  } catch (err) {
    console.error("alerte-stock-bas: erreur inattendue", err);
    return jsonResponse({ error: "Erreur interne lors du scan des alertes de stock." }, 500);
  }
}));

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
    console.error("alerte-stock-bas: échec vérification appelant", err);
    return jsonResponse({ error: "Impossible de vérifier l'identité de l'appelant." }, 401);
  }
}

async function diffuserBroadcast(alertes: any[]) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getEnv();

  const payload = {
    source: "alerte-stock-bas",
    genere_le: new Date().toISOString(),
    total_alertes_actives: alertes.length,
    alertes: alertes.slice(0, 50), // évite un payload trop volumineux
  };

  const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      messages: [
        {
          topic: REALTIME_BROADCAST_TOPIC,
          event: REALTIME_BROADCAST_EVENT,
          payload,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Realtime Broadcast REST a répondu ${res.status} : ${text}`);
  }
}
