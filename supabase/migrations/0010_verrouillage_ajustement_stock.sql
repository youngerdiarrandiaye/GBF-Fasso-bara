-- =============================================================================
-- GFB-STOCK — Verrouillage de l'ajustement manuel de stock
-- Fichier : supabase/migrations/0010_verrouillage_ajustement_stock.sql
-- Auteur  : architecte-bdd (agent)
-- Objet   : corrige un écart critique relevé par l'audit du module stock :
--           la policy `produits_admin_all` (0001_schema_initial.sql:357-360)
--           autorise aujourd'hui n'importe quel admin à faire
--           `UPDATE produits SET quantite_stock = ...` en direct via
--           PostgREST/supabase-js, sans passer par aucune procédure, sans
--           motif tracé et sans protection contre une race condition entre
--           deux ajustements concurrents.
--
-- Règle métier renforcée ici (extension explicite de la règle 8 du schéma
-- initial "agent ... aucun accès en écriture directe au stock" à
-- "PERSONNE, pas même admin, ne modifie quantite_stock par UPDATE direct") :
--   "Aucune UPDATE directe sur produits.quantite_stock ne doit être permise
--    par les policies RLS / les GRANT SQL en dehors de la procédure
--    d'ajustement — même l'admin ne modifie jamais la quantité directement."
--
-- Ce fichier NE MODIFIE AUCUNE migration existante (0001-0009). Il :
--   1. Ajoute une CHECK sur mouvements_stock.motif pour les mouvements
--      'ajustement' (traçabilité obligatoire, règle 9).
--   2. Crée la fonction RPC SECURITY DEFINER ajuster_stock_manuel(), seul
--      chemin désormais autorisé pour modifier produits.quantite_stock hors
--      trigger interne (decrementer_stock / restaurer_stock_annulation).
--   3. Retire le privilège UPDATE sur la colonne produits.quantite_stock au
--      rôle `authenticated` (donc admin ET agent au niveau SQL/PostgREST),
--      tout en conservant le droit de modifier les autres colonnes de la
--      fiche produit.
--
-- Ce que cette migration NE change PAS (vérifié explicitement, voir section 4
-- "vérifications manuelles" en fin de fichier) :
--   - Le trigger `decrementer_stock()` (règle 4, 0001 section 14) : il
--     modifie quantite_stock via une fonction SECURITY DEFINER dont le
--     propriétaire est `postgres` (superuser) -> un REVOKE sur le rôle
--     `authenticated` n'a strictement aucun effet sur son exécution
--     (un superuser bypasse systématiquement toute vérification de privilège
--     GRANT/REVOKE, indépendamment du rôle qui a déclenché le trigger).
--   - Le trigger `restaurer_stock_annulation()` (règle 5) : même raisonnement.
--   - Le trigger `verifier_seuil_stock()` (règle 6) : continue de se
--     déclencher sur tout UPDATE de quantite_stock, qu'il provienne des
--     triggers ci-dessus ou de la nouvelle fonction ajuster_stock_manuel()
--     ci-dessous (qui fait un UPDATE SQL standard sur produits, donc
--     conserve le déclenchement normal des triggers AFTER UPDATE existants).
--   - Le trigger `gerer_ajustement_stock_manuel()` (0001 section 14) reste
--     inchangé : ajuster_stock_manuel() réutilise le même flag de session
--     `gfb.mouvement_auto` que decrementer_stock()/restaurer_stock_annulation()
--     pour éviter qu'il double-journalise le mouvement (motif générique) en
--     plus du mouvement inséré ci-dessous avec le motif réel de l'admin.
-- =============================================================================


-- =============================================================================
-- SECTION 1 — CHECK : motif obligatoire pour un mouvement de type 'ajustement'
-- =============================================================================

-- Vérifié avant écriture (audit) : les INSERT existants dans mouvements_stock
-- (0001_schema_initial.sql) sont :
--   - decrementer_stock()          -> type='sortie', motif='Validation facture <numero>' (non nul)
--   - restaurer_stock_annulation() -> type='entree', motif='Annulation facture <numero>' (non nul)
--   - gerer_ajustement_stock_manuel() -> type='ajustement', motif='Ajustement manuel du stock' (non nul)
-- Aucun de ces INSERT ne pose de motif NULL pour type='ajustement' : la
-- contrainte ci-dessous ne casse donc aucun flux existant. Elle ne fait que
-- fermer la porte à un futur INSERT direct de type='ajustement' sans motif
-- (ex: par service_role ou un script mal écrit) et documente explicitement
-- l'exigence déjà respectée en pratique par le code existant.
ALTER TABLE mouvements_stock
  ADD CONSTRAINT mouvements_stock_motif_ajustement_oblig
  CHECK (type <> 'ajustement' OR (motif IS NOT NULL AND length(trim(motif)) > 0));

COMMENT ON CONSTRAINT mouvements_stock_motif_ajustement_oblig ON mouvements_stock IS
  'Règle métier 9 (traçabilité) renforcée par l''audit du 0010 : un mouvement de type ''ajustement'' doit toujours porter un motif non vide. Les mouvements ''entree''/''sortie'' générés automatiquement (decrementer_stock/restaurer_stock_annulation) ne sont pas concernés par cette contrainte.';


-- =============================================================================
-- SECTION 2 — RPC ajuster_stock_manuel() : seul chemin d'ajustement manuel
-- =============================================================================

-- Règle métier renforcée (voir en-tête de fichier) : remplace l'ancien
-- chemin "deux UPDATE distincts pilotés par la Server Action" par une seule
-- fonction SECURITY DEFINER, transactionnelle, qui est la SEULE à pouvoir
-- faire varier produits.quantite_stock hors triggers internes de facture.
--
-- NOTE DE TYPAGE (écart documenté par rapport à la signature indicative du
-- prompt d'audit, qui proposait `p_nouvelle_quantite integer`) : la colonne
-- produits.quantite_stock est `numeric(12,2)` (des unités comme 'metre' ou
-- 'rouleau' peuvent avoir un stock fractionnaire, ex. 12.5 mètres), et le
-- composant NumberInput du formulaire d'ajustement (components/ui/NumberInput.tsx)
-- accepte déjà des décimales (step arrondi à 2 décimales). Utiliser `integer`
-- tronquerait silencieusement ces valeurs légitimes. Le paramètre est donc
-- déclaré `numeric` pour rester fidèle au type de colonne réel.
CREATE OR REPLACE FUNCTION ajuster_stock_manuel(
  p_produit_id uuid,
  p_nouvelle_quantite numeric,
  p_motif text
)
RETURNS TABLE (ancienne_quantite numeric, nouvelle_quantite numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ancienne_quantite numeric(12,2);
BEGIN
  -- 1) Réservé aux administrateurs (règle 8). is_admin() lit auth.uid() côté
  --    serveur, jamais une valeur envoyée par le client -> aucune usurpation
  --    possible. Un agent qui appellerait cette RPC reçoit cette exception,
  --    pas un accès silencieux (cf. GRANT EXECUTE section 3 ci-dessous : la
  --    fonction est exposée à `authenticated` tout entier, agent compris,
  --    précisément parce que ce contrôle interne est la seule barrière
  --    nécessaire et suffisante).
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  -- 2) Motif obligatoire et non vide (règle 9, renforcée section 1 par la
  --    CHECK sur mouvements_stock — cette vérification applicative donne un
  --    message d'erreur explicite avant même de tenter l'INSERT).
  IF p_motif IS NULL OR length(trim(p_motif)) = 0 THEN
    RAISE EXCEPTION 'Le motif est obligatoire pour un ajustement de stock';
  END IF;

  -- 3) Quantité cible jamais négative (en plus de la CHECK
  --    produits_quantite_stock_positive déjà existante sur la table :
  --    exception explicite ici pour un message clair avant l'UPDATE).
  IF p_nouvelle_quantite < 0 THEN
    RAISE EXCEPTION 'La nouvelle quantité en stock ne peut pas être négative';
  END IF;

  -- 4) Lecture de la quantité RÉELLEMENT en base au moment de la validation,
  --    avec verrouillage FOR UPDATE : si deux admins ajustent le même
  --    produit en même temps, le second à valider voit la valeur déjà
  --    modifiée par le premier (pas une valeur obsolète capturée côté
  --    frontend avant l'ouverture de la modale), et son delta est calculé
  --    sur cette base réelle. Le verrou est relâché au COMMIT de la
  --    transaction appelante (la RPC entière s'exécute dans une seule
  --    transaction implicite).
  SELECT quantite_stock INTO v_ancienne_quantite
  FROM produits
  WHERE id = p_produit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produit introuvable (id=%)', p_produit_id;
  END IF;

  IF v_ancienne_quantite = p_nouvelle_quantite THEN
    RAISE EXCEPTION 'La nouvelle quantité est identique au stock actuel : aucun ajustement à enregistrer';
  END IF;

  -- 5) Décrément/incrément effectif. Le flag de session `gfb.mouvement_auto`
  --    (même mécanisme que decrementer_stock()/restaurer_stock_annulation(),
  --    0001 section 14) neutralise le temps de cet UPDATE le trigger
  --    `trg_gerer_ajustement_stock_manuel`, qui journaliserait sinon un
  --    second mouvement 'ajustement' avec un motif générique ("Ajustement
  --    manuel du stock") en plus de celui inséré ci-dessous avec le motif
  --    réel saisi par l'admin -> évite un double comptage des mouvements de
  --    stock, exactement comme le documentait déjà l'ancienne Server Action.
  --    Ce trigger existant n'est pas modifié par cette migration.
  PERFORM set_config('gfb.mouvement_auto', 'true', true);

  UPDATE produits
  SET quantite_stock = p_nouvelle_quantite,
      updated_at = now()
  WHERE id = p_produit_id;

  PERFORM set_config('gfb.mouvement_auto', 'false', true);
  -- Le trigger `trg_verifier_seuil_stock_update` (règle 6) N'EST PAS couvert
  -- par ce flag : il continue de se déclencher normalement sur ce même
  -- UPDATE et génère/nettoie les alertes de stock bas comme avant.

  -- 6) Traçabilité (règle 9) : un seul mouvement 'ajustement', motif réel,
  --    quantité signée (positive = entrée, négative = sortie), pas de
  --    facture associée.
  INSERT INTO mouvements_stock (produit_id, type, quantite, motif, reference_facture_id, utilisateur_id)
  VALUES (
    p_produit_id, 'ajustement', p_nouvelle_quantite - v_ancienne_quantite,
    p_motif, NULL, auth.uid()
  );

  -- 7) Journal d'activité (règle 9) : remplace l'entrée générique que le
  --    trigger neutralisé aurait posée, avec le motif réel en plus.
  INSERT INTO journal_activites (utilisateur_id, action, table_cible, avant, apres)
  VALUES (
    auth.uid(), 'ajustement_stock_manuel', 'produits',
    jsonb_build_object('quantite_stock', v_ancienne_quantite),
    jsonb_build_object('quantite_stock', p_nouvelle_quantite, 'motif', p_motif)
  );

  RETURN QUERY SELECT v_ancienne_quantite, p_nouvelle_quantite;
END;
$$;

COMMENT ON FUNCTION ajuster_stock_manuel(uuid, numeric, text) IS
  'Seul chemin autorisé pour modifier produits.quantite_stock hors validation/annulation de facture. SECURITY DEFINER : vérifie is_admin() en interne (règle 8), motif obligatoire (règle 9), verrouille la ligne produit (FOR UPDATE) pour lire la quantité réelle en base et éviter toute race condition entre deux ajustements concurrents.';

-- GRANT EXECUTE à `authenticated` (admin ET agent) : la fonction elle-même
-- vérifie is_admin() en interne (étape 1 ci-dessus) et lève une exception
-- explicite pour un agent -> pas besoin (et pas souhaitable) de dupliquer ce
-- contrôle au niveau GRANT, qui resterait de toute façon insuffisant pour
-- distinguer "admin actif" vs "admin désactivé" (is_admin() vérifie aussi
-- `actif = true`).
REVOKE ALL ON FUNCTION ajuster_stock_manuel(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ajuster_stock_manuel(uuid, numeric, text) TO authenticated;


-- =============================================================================
-- SECTION 3 — Retrait du privilège UPDATE direct sur produits.quantite_stock
-- =============================================================================

-- ATTENTION (comportement Postgres vérifié empiriquement avant d'écrire cette
-- section) : les privilèges table-level et column-level sont ADDITIFS dans le
-- modèle d'ACL Postgres. Un simple
--   REVOKE UPDATE (quantite_stock) ON produits FROM authenticated;
-- laissé seul NE SUFFIT PAS : le GRANT UPDATE table-level déjà posé en 0001
-- section 17 (`GRANT SELECT, INSERT, UPDATE, DELETE ON produits ... TO
-- authenticated`) continue de couvrir TOUTES les colonnes, quantite_stock
-- comprise (vérifié avec has_column_privilege() : reste `true` après un
-- REVOKE column-level seul). La seule méthode qui fonctionne réellement est :
--   1. REVOKE UPDATE ON produits FROM authenticated  (retire le droit
--      table-level, donc implicitement sur TOUTES les colonnes) ;
--   2. GRANT UPDATE (liste explicite des colonnes autorisées) ON produits
--      TO authenticated (ré-ouvre l'UPDATE colonne par colonne, en excluant
--      volontairement quantite_stock).
-- Cette séquence a été testée dans une transaction ROLLBACK sur l'instance
-- locale avant d'être committée ici (voir section 4).
REVOKE UPDATE ON produits FROM authenticated;

-- Liste des colonnes qui doivent rester modifiables via UPDATE direct
-- (PostgREST / supabase-js), à l'exclusion de quantite_stock : reprise
-- exacte des champs édités par components/admin/ProductForm.tsx via
-- lib/actions/produits.ts::modifierProduit() (code, nom, description,
-- categorie_id, unite, type_ligne_produit, kit_parent_id, prix_unitaire,
-- seuil_alerte, photos_urls) + `actif`, modifiable indépendamment depuis la
-- fiche produit (case à cocher "Produit actif").
-- `updated_at` n'a pas besoin d'être listé : il n'est jamais inclus dans le
-- SET explicite d'un UPDATE émis par l'application (il est positionné par le
-- trigger `set_updated_at()` sur NEW, ce qui n'exige pas de privilège colonne
-- pour la colonne cible — seules les colonnes réellement présentes dans la
-- clause SET de la requête SQL entrante sont soumises au contrôle de
-- privilège column-level).
GRANT UPDATE (
  code,
  nom,
  description,
  categorie_id,
  unite,
  type_ligne_produit,
  kit_parent_id,
  prix_unitaire,
  seuil_alerte,
  photos_urls,
  actif
) ON produits TO authenticated;

-- Les policies RLS existantes (produits_admin_all, produits_lecture_agent,
-- 0001 section 5) ne sont PAS modifiées : elles continuent de filtrer QUELLES
-- LIGNES peuvent être vues/modifiées (admin: toutes, agent: aucune en
-- écriture) ; ce GRANT/REVOKE ajoute un filtre orthogonal, au niveau colonne,
-- qui s'applique même à un admin passant l'USING/WITH CHECK de RLS. Les deux
-- mécanismes sont cumulatifs (RLS ET GRANT doivent tous les deux autoriser
-- l'opération), exactement la garantie recherchée par l'audit : même un
-- admin ne peut plus modifier quantite_stock par UPDATE direct.


-- =============================================================================
-- SECTION 4 — VÉRIFICATIONS MANUELLES (à exécuter après application)
-- =============================================================================
-- Toutes vérifiées sur l'instance locale au moment de l'écriture de cette
-- migration (voir rapport de l'agent) :
--
-- 1. `REVOKE` réellement effectif (pas juste supposé) :
--      SELECT has_column_privilege('authenticated', 'produits', 'quantite_stock', 'UPDATE'); -- doit renvoyer false
--      SELECT has_column_privilege('authenticated', 'produits', 'actif', 'UPDATE');           -- doit renvoyer true
--    Et, en simulant un rôle authenticated réel (ex. via un JWT admin/agent
--    et supabase-js, ou `SET ROLE authenticated; SET request.jwt.claims = ...`) :
--      UPDATE produits SET quantite_stock = 999 WHERE id = '<id existant>';
--    doit échouer avec "permission denied for column quantite_stock".
--
-- 2. RPC fonctionnelle :
--      SELECT * FROM ajuster_stock_manuel('<id existant>', 5, 'Test audit — inventaire physique');
--    doit renvoyer (ancienne_quantite, nouvelle_quantite), modifier
--    produits.quantite_stock, insérer une ligne mouvements_stock
--    (type='ajustement', motif='Test audit — inventaire physique') et une
--    ligne journal_activites (action='ajustement_stock_manuel').
--
-- 3. Triggers de facture toujours fonctionnels après la migration :
--      - Valider une facture (statut -> 'validee') décrémente bien le stock
--        de chaque ligne (trigger decrementer_stock, règle 4) et bloque si
--        le stock est insuffisant.
--      - Annuler une facture validée (statut -> 'annulee') restaure bien le
--        stock (trigger restaurer_stock_annulation, règle 5).
--      - Dans les deux cas, `trg_verifier_seuil_stock_update` continue de
--        générer/nettoyer les alertes de stock bas (règle 6).
--
-- 4. Agent bloqué :
--      SELECT ajuster_stock_manuel('<id existant>', 5, 'Tentative agent');
--    exécuté avec un JWT agent doit lever "Réservé aux administrateurs".
--
-- 5. Motif vide rejeté :
--      SELECT ajuster_stock_manuel('<id existant>', 5, '   ');
--    doit lever "Le motif est obligatoire pour un ajustement de stock" (sans
--    même atteindre la CHECK de la section 1).
-- =============================================================================
