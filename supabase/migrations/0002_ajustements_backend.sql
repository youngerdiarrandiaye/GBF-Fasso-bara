-- =============================================================================
-- GFB-STOCK — Migration corrective
-- Fichier : supabase/migrations/0002_ajustements_backend.sql
-- Auteur  : architecte-bdd (agent)
-- Objet   : deux corrections ciblées demandées suite au développement des
--           Edge Functions par l'agent dev-backend-edge sur la base du schéma
--           0001_schema_initial.sql. Ce fichier NE MODIFIE PAS 0001 (déjà
--           livré/potentiellement déjà appliqué) : il ne fait qu'ajouter ce
--           qui manquait, conformément à la consigne de correction ciblée.
--
--   A. Déclaration formelle du bucket Storage privé "rapports" (section 18),
--      utilisé par l'Edge Function export-rapport, qui le créait jusqu'ici de
--      façon défensive au runtime (storage.createBucket côté applicatif) —
--      contraire au principe "le schéma de données est le seul livrable
--      faisant foi", cf. supabase/functions/export-rapport/README.md,
--      section "Bucket `rapports` — non déclaré dans la migration initiale".
--
--   B. Câblage pg_cron -> Edge Function `alerte-stock-bas` (section 19), pour
--      que le scan quotidien de 6h00 déclenche EN PLUS de l'insertion SQL
--      déjà garantie (scanner_alertes_stock_quotidien(), 0001 section 16) la
--      diffusion Realtime Broadcast enrichie que l'agent dev-backend-edge a
--      implémentée dans supabase/functions/alerte-stock-bas/index.ts. Avant
--      cette migration, le cron.schedule() de 0001 n'appelait QUE la fonction
--      SQL — jamais l'Edge Function — donc le broadcast enrichi ne se
--      déclenchait jamais automatiquement (uniquement sur appel manuel/test).
-- =============================================================================


-- =============================================================================
-- SECTION 18 — STORAGE BUCKET "rapports" (privé) + policy
--
-- Pourquoi cet ajustement (écart n°1 de la tâche de correction) :
-- La règle de méthode du schéma initial est que TOUTE ressource partagée par
-- plusieurs Edge Functions (buckets compris) doit être déclarée en SQL
-- versionné, jamais créée "à la demande" par du code applicatif : sinon rien
-- ne garantit que le bucket existe avant le premier déploiement, ni que ses
-- policies restent alignées avec le reste du schéma au fil des évolutions.
-- Voir supabase/functions/export-rapport/README.md pour le contexte complet
-- côté Edge Function (elle continue de fonctionner sans modification : elle
-- détecte que le bucket existe déjà et ne tente plus de le recréer).
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('rapports', 'rapports', false)
ON CONFLICT (id) DO NOTHING;

-- Convention de chemin (fixée par export-rapport/index.ts, cf. son README,
-- section "Idempotence du fichier généré") :
--   {scope}/ventes_{date_debut}_{date_fin}.{ext}
--   {scope}/stock_{AAAA-MM-JJ}.{ext}
-- où {scope} = id de l'agent (export scopé à un agent) ou "tous_agents"
-- (export admin non filtré). Ce scope sert de racine de dossier, exactement
-- comme {agent_id}/{numero_facture}.pdf pour le bucket "factures" (0001,
-- section 15).
--
-- Modèle de sécurité retenu — plus strict que le bucket "factures" par
-- conception, car "rapports" peut contenir des données agrégées inter-agents
-- (ex. export admin "tous_agents") :
--   - Écriture (INSERT/UPDATE/DELETE) : réservée à service_role, exactement
--     comme le bucket "factures" (0001, section 15) -> aucune policy
--     `authenticated` n'est créée pour l'écriture ; seule l'Edge Function
--     export-rapport (via son client service_role, cf.
--     supabase/functions/_shared/clients.ts) peut déposer un fichier.
--   - Lecture : contrairement à "factures" qui expose des policies SELECT
--     directes (admin total + agent propriétaire), l'accès à "rapports" se
--     fait UNIQUEMENT via l'URL signée que génère export-rapport avec son
--     client service_role (la génération d'une URL signée par service_role
--     ne dépend d'aucune policy RLS, et sa consommation ensuite ne repasse
--     pas par une policy SELECT `authenticated` : c'est le jeton signé
--     lui-même qui fait foi, avec une expiration courte configurable via
--     EXPORT_RAPPORT_SIGNED_URL_TTL_SECONDS côté Edge Function).
--     On ajoute néanmoins UNE policy explicite de lecture directe réservée à
--     l'admin (et seulement à l'admin, pas à l'agent) pour deux raisons :
--       1) rester cohérent avec la règle 8 du cahier des charges ("admin :
--          accès total en lecture/écriture sur toutes les tables"), dont
--          l'esprit s'étend logiquement au Storage pour un usage de type
--          "parcourir l'historique des rapports" depuis le Dashboard
--          Supabase ou un futur écran d'administration, sans dépendre à
--          chaque fois d'un nouvel appel à l'Edge Function ;
--       2) NE PAS donner de policy SELECT à l'agent : un agent ne doit
--          jamais pouvoir parcourir/lister directement le bucket (il
--          contient potentiellement des exports "tous_agents" d'autres
--          agents), son seul chemin d'accès reste l'URL signée que lui
--          fournit export-rapport (qui applique déjà, elle, le filtrage
--          agent_id strict documenté dans son README).
CREATE POLICY rapports_lecture_admin
  ON storage.objects FOR SELECT
  USING (bucket_id = 'rapports' AND is_admin());

-- Aucune policy INSERT/UPDATE/DELETE `authenticated` n'est créée ici, ni
-- aucune policy SELECT pour l'agent : storage.objects a RLS activé par
-- défaut sur tout projet Supabase, donc l'absence de policy vaut refus
-- implicite pour ces opérations/rôles (même principe déjà appliqué dans
-- 0001 à mouvements_stock pour l'agent). Seul service_role - qui contourne
-- RLS par construction - peut écrire, exactement comme pour "factures".


-- =============================================================================
-- SECTION 19 — CÂBLAGE PG_CRON -> EDGE FUNCTION "alerte-stock-bas"
--
-- Pourquoi cet ajustement (écart n°2 de la tâche de correction) :
-- 0001 (section 16) planifie déjà `scanner_alertes_stock_quotidien()` tous
-- les jours à 6h00 : cela suffit pleinement à garantir la règle métier 6
-- (l'INSERT dans alertes_stock est déjà garanti côté base, et diffusé
-- nativement via `postgres_changes` grâce à `alertes_stock` déjà ajoutée à
-- la publication `supabase_realtime`). CE `cron.schedule` N'A JAMAIS appelé
-- l'Edge Function `alerte-stock-bas` : il exécute uniquement la fonction SQL.
-- Le Realtime Broadcast enrichi (payload prêt à afficher, alertes agrégées
-- en un seul message) implémenté dans
-- supabase/functions/alerte-stock-bas/index.ts ne se déclenchait donc QUE
-- sur appel manuel/test, jamais automatiquement à 6h00 comme demandé.
--
-- Correction : on ajoute un second job pg_cron, décalé de 5 minutes après le
-- scan SQL direct (le temps que les éventuelles insertions se stabilisent),
-- qui appelle l'Edge Function via pg_net (`net.http_post`), conformément à
-- la recommandation documentée dans
-- supabase/functions/alerte-stock-bas/README.md, section "Câblage pg_cron
-- recommandé". Le job SQL direct de 0001 reste inchangé et continue de
-- garantir la règle 6 à lui seul, indépendamment du succès/échec de ce
-- second job (best effort, cf. plus bas).
-- =============================================================================

-- pg_net (appels HTTP sortants depuis Postgres) : même logique défensive que
-- pg_cron en 0001 section 16 -> ne fait pas échouer toute la migration si
-- l'extension n'est pas encore activable sur ce projet.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
EXCEPTION WHEN insufficient_privilege OR feature_not_supported THEN
  RAISE NOTICE 'pg_net non activable automatiquement ici : activez-le depuis Dashboard > Database > Extensions, puis relancez le bloc cron.schedule() de la section 19.';
END $$;

-- --- Secrets requis (Supabase Vault) — ÉTAPE MANUELLE, hors dépôt Git -------
-- Par sécurité, aucun secret n'est écrit en clair dans une migration
-- versionnée (cf. déjà la remarque équivalente dans le README de
-- alerte-stock-bas : "Ne pas coder la clé service_role en clair dans une
-- migration versionnée"). On utilise le mécanisme d'authentification le
-- plus léger déjà prévu par l'Edge Function elle-même (header
-- `x-cron-secret`, cf. son index.ts / verifierAppelantAutorise()) plutôt que
-- de faire transiter la clé service_role, conformément à la suggestion de
-- son README.
--
-- Avant que ce second job ne puisse réellement diffuser le broadcast, un
-- administrateur doit exécuter UNE FOIS, manuellement (SQL Editor du
-- Dashboard, jamais commité) :
--
--   select vault.create_secret(
--     '<URL du projet, ex: https://xxxxxxxx.supabase.co>',
--     'gfb_edge_functions_base_url',
--     'URL de base des Edge Functions GFB-STOCK, utilisée par pg_net.'
--   );
--
--   select vault.create_secret(
--     '<valeur secrète forte, générée aléatoirement>',
--     'gfb_cron_secret',
--     'Secret partagé pg_cron -> Edge Function alerte-stock-bas (header x-cron-secret).'
--   );
--
-- ET configurer la MÊME valeur que 'gfb_cron_secret' comme variable
-- d'environnement `CRON_SECRET` de l'Edge Function alerte-stock-bas
-- (`supabase secrets set CRON_SECRET=<même valeur>` ou Dashboard > Edge
-- Functions > alerte-stock-bas > Secrets) — voir alerte-stock-bas/README.md,
-- section "Points d'attention pour expert-securite".
--
-- Tant que ces deux secrets Vault ne sont pas créés, la fonction
-- appeler_edge_function_alerte_stock_bas() ci-dessous se contente de logguer
-- un WARNING et de ne rien faire : le scan SQL direct de 0001 (règle 6)
-- continue de fonctionner normalement, seul le broadcast enrichi est
-- temporairement inactif.

CREATE OR REPLACE FUNCTION appeler_edge_function_alerte_stock_bas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_base_url    text;
  v_cron_secret text;
BEGIN
  SELECT decrypted_secret INTO v_base_url
  FROM vault.decrypted_secrets WHERE name = 'gfb_edge_functions_base_url';

  SELECT decrypted_secret INTO v_cron_secret
  FROM vault.decrypted_secrets WHERE name = 'gfb_cron_secret';

  IF v_base_url IS NULL OR v_cron_secret IS NULL THEN
    RAISE WARNING 'appeler_edge_function_alerte_stock_bas: secrets Vault manquants (gfb_edge_functions_base_url / gfb_cron_secret) — voir instructions de la section 19 dans 0002_ajustements_backend.sql. Le scan SQL direct (scanner_alertes_stock_quotidien) reste opérationnel ; seule la diffusion Realtime Broadcast enrichie est ignorée pour ce passage.';
    RETURN;
  END IF;

  -- Appel best-effort : PERFORM ignore l'identifiant de requête renvoyé par
  -- net.http_post (asynchrone, cf. doc pg_net). Un échec réseau ici ne doit
  -- jamais faire échouer le job cron ni, a fortiori, remettre en cause
  -- l'insertion déjà garantie côté base par le premier job (règle 6).
  PERFORM net.http_post(
    url     := v_base_url || '/functions/v1/alerte-stock-bas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_cron_secret
    ),
    body    := '{}'::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'appeler_edge_function_alerte_stock_bas: échec de l''appel à l''Edge Function alerte-stock-bas (%). Le scan SQL direct reste garanti indépendamment.', SQLERRM;
END;
$$;

COMMENT ON FUNCTION appeler_edge_function_alerte_stock_bas() IS 'Appelle, via pg_net, l''Edge Function alerte-stock-bas (broadcast Realtime enrichi) — complément best-effort de scanner_alertes_stock_quotidien() (0001, section 16) pour la règle métier 6. Voir 0002_ajustements_backend.sql section 19.';

-- Second job pg_cron, décalé de 5 minutes après le scan SQL direct de 0001
-- ('scan-alertes-stock-quotidien', 6h00 pile), pour laisser le temps aux
-- insertions de alertes_stock de se stabiliser avant que l'Edge Function ne
-- les relise (README alerte-stock-bas, section "Câblage pg_cron
-- recommandé").
DO $$
BEGIN
  PERFORM cron.schedule(
    'alerte-stock-bas-edge-broadcast',
    '5 6 * * *',
    $cron$SELECT appeler_edge_function_alerte_stock_bas();$cron$
  );
EXCEPTION WHEN undefined_table OR undefined_function OR insufficient_privilege THEN
  RAISE NOTICE 'Planification pg_cron non effectuée pour alerte-stock-bas-edge-broadcast (pg_cron/pg_net indisponible) : à relancer manuellement une fois les deux extensions activées, via SELECT cron.schedule(''alerte-stock-bas-edge-broadcast'', ''5 6 * * *'', ''SELECT appeler_edge_function_alerte_stock_bas();'');';
END $$;


-- =============================================================================
-- FIN DE LA MIGRATION 0002
-- =============================================================================
