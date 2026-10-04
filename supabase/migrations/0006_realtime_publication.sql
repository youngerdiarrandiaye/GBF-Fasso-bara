-- =============================================================================
-- GFB-STOCK — Correctif publication Supabase Realtime
-- Fichier : supabase/migrations/0006_realtime_publication.sql
-- Auteur  : architecte-bdd (agent)
-- Objet   : ajouter à la publication `supabase_realtime` les tables réellement
--           consommées par des abonnements `postgres_changes` déjà codés côté
--           frontend, sans toucher à 0001-0005 déjà livrées.
--
-- =============================================================================
-- BUG CONFIRMÉ EN CONDITIONS RÉELLES (stack Supabase local, dev-frontend-agent)
-- =============================================================================
-- `SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime'` ne
-- renvoyait, avant cette migration, QUE la ligne `alertes_stock` (ajoutée en
-- 0001_schema_initial.sql section 12, ~ligne 991). Or Postgres/Supabase
-- Realtime ne diffuse d'événements `postgres_changes` QUE pour les tables
-- explicitement ajoutées à cette publication logique : une table absente de
-- `pg_publication_tables` ne génère aucun événement WAL exploitable par le
-- serveur Realtime, quels que soient (a) l'état du canal côté client
-- (`SUBSCRIBED`), et (b) les policies RLS en place sur la table (une policy
-- RLS SELECT correcte est une condition NÉCESSAIRE mais pas SUFFISANTE : sans
-- publication, le flux WAL n'atteint même pas Realtime pour que RLS soit
-- évaluée). Test réalisé : abonnement `produits` (canal bien `SUBSCRIBED`),
-- `UPDATE` direct en SQL sur une ligne `produits`, AUCUN événement reçu — la
-- cause racine est bien l'absence de `produits` dans la publication, pas la
-- policy `produits_lecture_agent` (SELECT) qui existe déjà et fonctionne
-- correctement pour les requêtes REST/PostgREST classiques.
--
-- =============================================================================
-- TABLES AJOUTÉES — DÉTERMINÉES PAR RELECTURE EXHAUSTIVE DU CODE FRONTEND
-- (grep "postgres_changes" / ".channel(" / "tables={" dans app/ et
-- components/, .next/ exclu car ce sont des artefacts de build) — PAS
-- SUPPOSÉES.
-- =============================================================================
--
-- 1) `produits`
--    - app/(agent)/nouvelle-facture/NouvelleFactureForm.tsx : canal
--      "nouvelle-facture-stock-produits", `.on("postgres_changes",
--      { event: "UPDATE", schema: "public", table: "produits" }, ...)` — reflète
--      en direct le stock d'un produit déjà ajouté à la facture en cours de
--      composition (règle transversale : "si un produit passe en rupture
--      pendant qu'un agent compose une facture, l'écran doit refléter le
--      changement avant validation").
--    - app/(admin)/admin/stock/page.tsx : `<RealtimeRevalidate tables={["produits"]} />`.
--    - app/(admin)/admin/stock/[id]/page.tsx : `<RealtimeRevalidate
--      tables={["produits", "mouvements_stock"]} />`.
--    - app/(admin)/admin/page.tsx (dashboard admin) : `<RealtimeRevalidate
--      tables={["factures", "produits"]} />` — reflète les décréments de stock
--      déclenchés par la validation d'une facture (règle 4/6, EF-MVT-02).
--
-- 2) `factures`
--    - app/(admin)/admin/page.tsx (dashboard) : `tables={["factures", "produits"]}`
--      — "une facture validée côté Espace Agent doit apparaître dans le
--      dashboard Espace Admin sans rechargement manuel".
--    - app/(admin)/admin/factures/page.tsx : `tables={["factures"]}`.
--    - app/(admin)/admin/factures/[id]/page.tsx : `tables={["factures", "paiements"]}`.
--    - app/(admin)/admin/paiements/page.tsx : `tables={["factures", "paiements"]}`.
--
-- 3) `paiements`
--    - app/(admin)/admin/factures/[id]/page.tsx et
--      app/(admin)/admin/paiements/page.tsx (cf. ci-dessus) — reflète en
--      direct le passage `payee_partielle`/`payee` calculé par le trigger
--      `appliquer_paiement()` (règle 7).
--
-- 4) `mouvements_stock`
--    - app/(admin)/admin/stock/[id]/page.tsx : `tables={["produits", "mouvements_stock"]}`
--      — historique de mouvements (décrément/restauration automatiques,
--      règles 4/5) affiché en direct sur la fiche produit admin.
--
-- `alertes_stock` reste inchangée (déjà publiée en 0001, utilisée par
-- components/admin/AlertsBell.tsx) — non répétée ici pour éviter le doublon
-- `duplicate_object` (déjà géré par un bloc idempotent séparé en 0001).
--
-- Aucune autre table n'est référencée par un `.channel(...).on("postgres_changes"...)`
-- ni par un `tables={[...]}` ailleurs dans app/ ou components/ à ce jour
-- (vérifié par grep exhaustif hors .next/ et node_modules/, seuls résultats :
-- NouvelleFactureForm.tsx, RealtimeRevalidate.tsx et ses 6 usages listés
-- ci-dessus, AlertsBell.tsx déjà couvert). Si un futur composant a besoin
-- d'une nouvelle table, l'ajouter dans une NOUVELLE migration documentée de la
-- même manière plutôt que d'élargir celle-ci a posteriori.
--
-- =============================================================================
-- AUDIT RLS — CONFIRMATION EXPLICITE QUE REALTIME RESPECTE LES POLICIES (PAS
-- SUPPOSÉ)
-- =============================================================================
-- Supabase Realtime, pour les canaux `postgres_changes`, exécute une requête
-- de vérification RLS pour CHAQUE abonné et CHAQUE ligne modifiée, avec le
-- rôle Postgres et le `auth.uid()` associés au JWT utilisé pour établir la
-- connexion Realtime (exactement le même contexte que pour une requête
-- PostgREST classique) — un abonné ne reçoit un événement `postgres_changes`
-- QUE si une policy SELECT lui donne le droit de voir CETTE ligne. Ajouter une
-- table à `supabase_realtime` élargit donc uniquement le CANAL de diffusion,
-- jamais le périmètre de VISIBILITÉ déjà défini par les policies RLS
-- existantes (0001-0003). Vérification table par table :
--
--   - `produits` : policy `produits_lecture_agent` (SELECT, USING
--     is_agent_actif() AND actif = true) + `produits_admin_all`. Catalogue
--     partagé, non nominatif, déjà lisible intégralement par tout agent actif
--     via REST — aucune exposition nouvelle, Realtime ne fait que pousser la
--     même donnée déjà accessible.
--   - `factures` : policy `factures_lecture_agent_propre` (SELECT, USING
--     is_agent_actif() AND agent_id = auth.uid()) + `factures_admin_all`. Un
--     agent abonné à `factures` ne recevra JAMAIS d'événement sur une facture
--     d'un autre agent : la clause `agent_id = auth.uid()` est évaluée par
--     Realtime au moment de la diffusion, pas seulement au moment d'un SELECT
--     initial. `auth.uid()` provient du JWT vérifié par Postgres/GoTrue, donc
--     de la session serveur, jamais d'une valeur envoyée par le client
--     (conforme à la règle transversale "identité toujours vérifiée via
--     auth.uid()"). `RealtimeRevalidate` n'exploite de toute façon que
--     l'occurrence d'un événement pour déclencher `router.refresh()`, sans
--     jamais lire le payload lui-même côté agent — mais même en l'absence de
--     cette précaution applicative, la policy RLS suffit à empêcher toute
--     fuite inter-agents.
--   - `paiements` : policy `paiements_lecture_agent_propre` (SELECT, USING
--     EXISTS (... f.agent_id = auth.uid())) + `paiements_admin_all`. Même
--     raisonnement : un agent ne reçoit que les paiements liés à SES PROPRES
--     factures.
--   - `mouvements_stock` : SEULE policy existante = `mouvements_stock_admin_all`
--     (FOR ALL, USING is_admin()). Aucune policy SELECT pour le rôle agent =
--     RLS refuse par défaut (deny-by-default Postgres en l'absence de policy
--     correspondante) : un agent abonné à cette table ne recevrait de toute
--     façon AUCUNE ligne, quelle qu'elle soit. Cette table n'est d'ailleurs
--     utilisée en Realtime que par une page strictement admin
--     (app/(admin)/admin/stock/[id]/page.tsx, route sous le layout
--     (admin) qui vérifie déjà le rôle côté serveur) : ajout sans risque.
--
-- => Aucune table sensible n'est diffusée au-delà de ce que chaque rôle peut
--    déjà lire via REST ; Realtime ne fait qu'ajouter un canal de
--    notification sur un périmètre de lignes déjà borné par RLS.
--
-- =============================================================================
-- AJOUTS À LA PUBLICATION
-- =============================================================================
-- Bloc idempotent (comme 0001 section 12) : `ALTER PUBLICATION ... ADD TABLE`
-- lève `duplicate_object` si la table est déjà présente (ex. migration
-- rejouée) ; on l'ignore silencieusement pour permettre un `supabase db reset`
-- sans erreur, table par table (une seule ADD TABLE par table ajoutée pour
-- isoler l'erreur si une seule table posait problème).

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE produits;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE factures;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE paiements;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE mouvements_stock;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- =============================================================================
-- VÉRIFICATION MANUELLE POST-MIGRATION
-- =============================================================================
-- SELECT schemaname, tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' ORDER BY tablename;
-- Doit renvoyer exactement : alertes_stock, factures, mouvements_stock,
-- paiements, produits (5 lignes, ni plus ni moins).

-- =============================================================================
-- FIN DU CORRECTIF
-- =============================================================================
