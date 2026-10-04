-- =============================================================================
-- GFB-STOCK — Correctif de sécurité BLOQUANT : contournement du contrôle de
-- stock via factures.bon_livraison_id
-- Fichier : supabase/migrations/0014_correctif_securite_bl_facture.sql
-- Auteur  : architecte-bdd (agent)
-- Objet   : corrige la faille BLOQUANTE relevée par l'audit de l'agent
--           expert-securite (point 4b) sur 0013_avenant_credit_entrepots.sql,
--           confirmée par un test SQL réel (session agent authentifiée, hors
--           UI), + le problème connexe IMPORTANT (point 4a, BL orphelin non
--           nettoyable). Ce fichier NE MODIFIE NI 0001 NI 0013 NI AUCUNE
--           autre migration existante (déjà livrées/potentiellement déjà
--           appliquées) : uniquement CREATE OR REPLACE FUNCTION / ALTER
--           TABLE / CREATE POLICY, exactement la méthode déjà utilisée par
--           0003/0004/0007/0008/0010/0013 pour corriger un comportement sans
--           toucher au fichier qui l'a introduit.
--
-- =============================================================================
-- LA FAILLE (audit expert-securite, point 4b — BLOQUANT)
-- =============================================================================
-- decrementer_stock_entrepot() (0013, section 15.5) contenait :
--
--   IF NEW.bon_livraison_id IS NOT NULL THEN
--     NEW.date_validation := now();
--     RETURN NEW;  -- saute TOUT le contrôle de disponibilité ET le décrément
--   END IF;
--
-- Cette branche fait aveuglément confiance à la simple PRÉSENCE d'un
-- bon_livraison_id sur la facture, sans jamais vérifier qu'il correspond
-- réellement à CETTE facture (même client, même entrepôt, quantités
-- couvertes). Or la policy RLS `factures_maj_agent_propre_brouillon` (0001,
-- section 8, lignes 590-596 — NON MODIFIÉE ici, cf. contrainte de ne pas
-- toucher 0001) autorise un agent à modifier `statut` ET `bon_livraison_id`
-- dans le MÊME UPDATE sur sa propre facture brouillon : son WITH CHECK ne
-- porte que sur `is_agent_actif() AND agent_id = auth.uid() AND statut IN
-- (...)`, sans aucune contrainte de cohérence inter-colonnes (RLS ne peut de
-- toute façon pas exprimer "bon_livraison_id doit appartenir au même client
-- que la facture" — ce type de règle transversale relève d'un trigger, pas
-- d'une policy, cf. déjà le même raisonnement pour
-- `empecher_auto_promotion()`, 0001 section 3).
--
-- Test réel exécuté par expert-securite (reproductible) : un agent avec un
-- produit à 50 en stock crée une facture brouillon de 20 unités, puis
-- exécute DIRECTEMENT (supabase-js/PostgREST, sans passer par l'UI, qui ne
-- câble pas encore ce champ — cf. note de fin de fichier) :
--
--   UPDATE factures SET statut = 'validee',
--          bon_livraison_id = '<un BL quelconque, même vide ou d''un autre client>'
--   WHERE id = <sa facture>;
--
-- -> SUCCÈS. Facture validée, date_validation renseignée, stock INCHANGÉ
-- (toujours 50), aucune vérification n'a eu lieu. Un agent malveillant (ou
-- un futur bug frontend qui enverrait par erreur un bon_livraison_id) peut
-- ainsi faire "disparaître" le contrôle de stock d'une vente réelle : la
-- facture apparaît validée, mais aucune marchandise n'a réellement été
-- comptée comme sortie nulle part (ni par la facture, ni par un BL réel).
--
-- =============================================================================
-- LE CORRECTIF (section 1) — PRINCIPE
-- =============================================================================
-- Avant de sauter le contrôle de stock, decrementer_stock_entrepot() vérifie
-- désormais EXPLICITEMENT que le bon_livraison_id référencé :
--   (a) existe et appartient au MÊME client ET au MÊME entrepôt que la
--       facture (sinon : un agent ne peut plus "emprunter" un BL d'un autre
--       client/entrepôt pour se soustraire au contrôle de stock) ;
--   (b) a des lignes qui COUVRENT, produit par produit (somme agrégée, pas
--       ligne à ligne — cf. gestion des lignes dupliquées ci-dessous), au
--       moins les quantités facturées (sinon : impossible de "réutiliser" un
--       BL vide ou insuffisant).
-- Si l'une des deux conditions échoue : RAISE EXCEPTION, la transaction
-- entière est annulée (comme pour "Stock insuffisant..." dans la branche
-- normale du même trigger) — le comportement légitime (BL correctement
-- rattaché, coverage suffisante) n'est en rien affecté : c'est exactement le
-- cas que 0013 visait à traiter sans double-décompte (règle 15/16, décision
-- documentée dans factures.bon_livraison_id, 0013 section 10.2).
--
-- Point de départ = brouillon fourni par expert-securite, RELU ET CORRIGÉ ici
-- (voir "Écarts par rapport au brouillon" en fin de fichier) : gestion des
-- lignes dupliquées côté facture (déjà gérée par le GROUP BY du brouillon,
-- conservée), verrouillage explicite des lignes du BL pour fermer une
-- fenêtre de concurrence (ajouté, absent du brouillon), et durcissement
-- complémentaire contre le partage d'un même BL entre plusieurs factures
-- (ajouté, absent du brouillon — cf. section 2).
-- =============================================================================


-- =============================================================================
-- SECTION 1 — CORRECTIF BLOQUANT : decrementer_stock_entrepot() valide la
-- cohérence du bon_livraison_id avant de sauter le contrôle de stock
-- =============================================================================

CREATE OR REPLACE FUNCTION decrementer_stock_entrepot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        RECORD;
  v_dispo  numeric(12,2);
BEGIN
  IF NEW.bon_livraison_id IS NOT NULL THEN
    -- --- (a) Cohérence client/entrepôt --------------------------------------
    -- Le BL doit être un document RÉEL, appartenant au même client et au
    -- même entrepôt que la facture qui prétend s'appuyer dessus. Une simple
    -- existence du BL (sans ces deux égalités) est exactement ce que
    -- l'agent malveillant exploitait dans le test de l'audit (BL "même vide
    -- ou d'un autre client").
    IF NOT EXISTS (
      SELECT 1 FROM bons_livraison bl
      WHERE bl.id = NEW.bon_livraison_id
        AND bl.client_id = NEW.client_id
        AND bl.entrepot_id = NEW.entrepot_id
    ) THEN
      RAISE EXCEPTION 'Bon de livraison lié (%) introuvable ou incohérent avec la facture (client/entrepôt différents) : validation refusée', NEW.bon_livraison_id;
    END IF;

    -- --- Verrouillage anti-concurrence --------------------------------------
    -- Verrouille explicitement les lignes du BL AVANT de calculer la
    -- couverture ci-dessous, pour fermer une fenêtre de concurrence absente
    -- du brouillon initial : sans ce verrou, un admin pourrait supprimer une
    -- ligne de ce même bon_livraison_id (gerer_ligne_bon_livraison, 0013
    -- section 15.7, qui restaure le stock à la suppression) EXACTEMENT entre
    -- le calcul de couverture ci-dessous et la fin de cette transaction,
    -- laissant la facture validée sur la foi d'une couverture qui n'existe
    -- plus au moment du commit. `FOR UPDATE` n'est pas utilisable directement
    -- sur la requête agrégée (SUM/GROUP BY, section suivante) — Postgres
    -- interdit `FOR UPDATE` combiné à un agrégat/GROUP BY — d'où ce
    -- verrouillage préalable, non agrégé, sur les lignes concernées : toute
    -- transaction qui tenterait de les modifier/supprimer concurremment
    -- attendra la fin de CETTE transaction (COMMIT ou ROLLBACK), exactement
    -- le même principe que le `FOR UPDATE OF se` déjà utilisé par
    -- decrementer_stock_entrepot() (branche normale, ci-dessous) et par
    -- gerer_ligne_bon_livraison() (0013, section 15.7).
    PERFORM 1 FROM lignes_bon_livraison
    WHERE bon_livraison_id = NEW.bon_livraison_id
    FOR UPDATE;

    -- --- (b) Couverture des quantités facturées -----------------------------
    -- Agrégation par produit_id des DEUX côtés (facture ET BL) : gère
    -- correctement le cas où une même facture contient plusieurs lignes du
    -- même produit (ex. deux lignes distinctes de 10 unités chacune du même
    -- produit = 20 à couvrir, pas 10). COALESCE(...,0) gère le cas où le BL
    -- ne contient AUCUNE ligne de ce produit (BL vide ou incomplet).
    IF EXISTS (
      SELECT lf.produit_id
      FROM lignes_facture lf
      WHERE lf.facture_id = NEW.id
      GROUP BY lf.produit_id
      HAVING SUM(lf.quantite) > COALESCE((
        SELECT SUM(lbl.quantite) FROM lignes_bon_livraison lbl
        WHERE lbl.bon_livraison_id = NEW.bon_livraison_id AND lbl.produit_id = lf.produit_id
      ), 0)
    ) THEN
      RAISE EXCEPTION 'Le bon de livraison lié (%) ne couvre pas les quantités facturées pour au moins un produit : validation refusée', NEW.bon_livraison_id;
    END IF;

    -- Les deux contrôles passent : le BL est réellement le document qui a
    -- matérialisé la sortie physique de CES marchandises pour CE client
    -- depuis CET entrepôt (décision de conception 0013, section 10.2 : la
    -- facture ne décrémente alors pas une seconde fois). NB : la restauration
    -- symétrique (restaurer_stock_annulation_entrepot, 0013 section 15.6) ne
    -- restaure QUE si `OLD.bon_livraison_id IS NULL` — elle continue de ne
    -- rien faire ici, ce qui est correct puisque cette branche n'a jamais
    -- décrémenté quoi que ce soit (rien à restaurer).
    NEW.date_validation := now();
    RETURN NEW;
  END IF;

  -- =====================================================================
  -- Branche normale (facture SANS bon_livraison_id) — INCHANGÉE par rapport
  -- à 0013 (section 15.5) : décrément direct du stock de l'entrepôt de la
  -- facture, avec blocage si insuffisant.
  -- =====================================================================

  FOR r IN
    SELECT lf.produit_id, p.nom, lf.quantite AS quantite_demandee
    FROM lignes_facture lf
    JOIN produits p ON p.id = lf.produit_id
    WHERE lf.facture_id = NEW.id
  LOOP
    SELECT quantite_stock INTO v_dispo
    FROM stock_entrepot
    WHERE produit_id = r.produit_id AND entrepot_id = NEW.entrepot_id
    FOR UPDATE;

    IF NOT FOUND OR v_dispo < r.quantite_demandee THEN
      RAISE EXCEPTION 'Stock insuffisant pour le produit "%" dans l''entrepôt sélectionné : disponible %, demandé %',
        r.nom, COALESCE(v_dispo, 0), r.quantite_demandee;
    END IF;
  END LOOP;

  UPDATE stock_entrepot se
  SET quantite_stock = se.quantite_stock - lf.quantite,
      updated_at = now()
  FROM lignes_facture lf
  WHERE lf.facture_id = NEW.id AND se.produit_id = lf.produit_id AND se.entrepot_id = NEW.entrepot_id;

  INSERT INTO mouvements_stock (produit_id, entrepot_id, type, quantite, motif, reference_facture_id, utilisateur_id)
  SELECT lf.produit_id, NEW.entrepot_id, 'sortie', lf.quantite,
         'Validation facture ' || NEW.numero, NEW.id, auth.uid()
  FROM lignes_facture lf
  WHERE lf.facture_id = NEW.id;

  NEW.date_validation := now();

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION decrementer_stock_entrepot() IS 'Règle métier 4, adaptée à la règle 16 (0013). CORRECTIF SÉCURITÉ BLOQUANT (0014, audit expert-securite point 4b) : la branche bon_livraison_id IS NOT NULL vérifie désormais explicitement que le BL référencé appartient au même client/entrepôt que la facture ET que ses lignes couvrent les quantités facturées (verrouillées FOR UPDATE le temps du calcul), avant de sauter le décrément. Sans ce contrôle, un agent pouvait valider une facture avec un bon_livraison_id arbitraire (vide ou d''un autre client) pour contourner totalement la vérification/décrément de stock via un appel API direct.';

-- Aucune modification de la définition du trigger lui-même : il pointe déjà
-- vers decrementer_stock_entrepot() par son nom (0013, section 15.5) et
-- récupère donc automatiquement ce nouveau corps.
-- CREATE TRIGGER trg_decrementer_stock_entrepot
--   BEFORE UPDATE ON factures
--   FOR EACH ROW WHEN (NEW.statut = 'validee' AND OLD.statut IS DISTINCT FROM 'validee')
--   EXECUTE FUNCTION decrementer_stock_entrepot();


-- =============================================================================
-- SECTION 2 — DURCISSEMENT COMPLÉMENTAIRE (non demandé explicitement par
-- l'audit, identifié en auto-relecture de ce correctif — cf. consigne
-- "relis ta propre migration comme si tu étais l'agent sécurité")
-- =============================================================================
--
-- Gap résiduel identifié : rien n'empêche, y compris après le correctif de
-- la section 1, qu'un MÊME bon_livraison_id soit référencé par PLUSIEURS
-- factures. Chacune, prise isolément, passerait le contrôle de couverture
-- ci-dessus (le BL couvre bien SES quantités), mais l'effet CUMULÉ est que
-- deux factures distinctes se prévalent de la même sortie physique de stock
-- pour ne la décrémenter qu'une seule fois — pas une corruption du stock en
-- lui-même (aucune valeur ne devient négative), mais une incohérence
-- commerciale grave : un client pourrait être facturé deux fois pour une
-- seule livraison réelle, ou un agent malveillant pourrait créer une
-- deuxième facture "gratuite" en réutilisant un BL légitime déjà consommé
-- par une première facture, sans qu'aucun contrôle de stock ne s'y oppose.
--
-- Correctif : contrainte d'unicité PARTIELLE au niveau base (résiste à tout
-- chemin d'écriture, y compris service_role et admin direct, même principe
-- que credits_un_seul_en_cours_par_client, 0013 section 7). NULL reste
-- autorisé en plusieurs exemplaires (comportement standard PostgreSQL pour
-- une contrainte UNIQUE sur une colonne nullable) : une facture SANS
-- bon_livraison_id n'est jamais concernée.
ALTER TABLE factures
  ADD CONSTRAINT factures_bon_livraison_id_unique UNIQUE (bon_livraison_id);

COMMENT ON CONSTRAINT factures_bon_livraison_id_unique ON factures IS 'Durcissement sécurité (0014, section 2, identifié en auto-relecture du correctif du point 4b) : un bon de livraison ne peut être référencé que par UNE SEULE facture, empêchant la réutilisation d''un même BL pour faire passer plusieurs factures sans décrément de stock supplémentaire (double-facturation d''une seule sortie physique). NULL autorisé en plusieurs exemplaires (comportement standard PostgreSQL pour une colonne nullable).';

-- NOTE POUR LA PERSONNE QUI APPLIQUE CETTE MIGRATION : si l'audit sécurité a
-- laissé en base des données de test où plusieurs factures partagent déjà
-- le même bon_livraison_id (ex. le test reproduit dans l'en-tête de ce
-- fichier, rejoué plusieurs fois), cet ALTER TABLE échouera avec une erreur
-- "duplicate key value violates unique constraint" — c'est le comportement
-- ATTENDU (la contrainte fait exactement son travail). Il faut alors
-- d'abord nettoyer/dé-dupliquer ces données de test avant de réappliquer
-- cette migration, par exemple :
--   UPDATE factures SET bon_livraison_id = NULL
--   WHERE id NOT IN (
--     SELECT DISTINCT ON (bon_livraison_id) id FROM factures
--     WHERE bon_livraison_id IS NOT NULL ORDER BY bon_livraison_id, created_at
--   );


-- =============================================================================
-- SECTION 3 — CORRECTIF IMPORTANT : nettoyage d'un bon de livraison orphelin
-- par l'agent qui l'a créé (audit expert-securite, point 4a)
-- =============================================================================
--
-- Problème (moins grave que la section 1, déjà signalé par dev-frontend-agent) :
-- lib/actions/bons-livraison.ts (L76-96) tente de supprimer un BL orphelin
-- (0 ligne) créé par l'agent lui-même quand l'insertion de ses lignes échoue
-- (ex. erreur réseau, stock insuffisant sur une ligne suivante déclenchant
-- l'exception de gerer_ligne_bon_livraison — cf. 0013 section 15.7 — après
-- qu'une ou plusieurs lignes précédentes ont déjà réussi puis, selon le
-- design applicatif, été retirées/annulées côté frontend). Or AUCUNE policy
-- DELETE n'existe pour l'agent sur bons_livraison (0013, section 5 :
-- seulement bons_livraison_admin_all pour ALL, bons_livraison_lecture_
-- agent_propre pour SELECT, bons_livraison_creation_agent pour INSERT) : le
-- DELETE tenté par le frontend échoue silencieusement (RLS deny-by-default,
-- 0 ligne affectée, sans erreur PostgREST puisque DELETE sur 0 ligne visible
-- n'est pas en soi une erreur), laissant un BL fantôme : numéro de séquence
-- consommé (bl_sequences, 0013 section 5), statut 'livre_non_paye', 0 ligne,
-- visible dans les listings admin sans jamais correspondre à une vraie
-- livraison.
--
-- Correctif : policy DELETE étroite, réservée à l'agent propriétaire, et
-- UNIQUEMENT si le BL n'a ENCORE AUCUNE LIGNE au moment de la suppression.
-- Cette condition est cruciale : un BL avec au moins une ligne a, par
-- construction (gerer_ligne_bon_livraison, 0013 section 15.7), déjà
-- décrémenté du stock réel — le supprimer directement (sans passer par la
-- suppression de ses lignes une à une, qui restaure le stock ligne par
-- ligne) romprait la traçabilité stock/mouvements_stock. Un BL à 0 ligne n'a
-- en revanche eu AUCUN effet sur le stock : sa suppression est strictement
-- sans risque, quel que soit son âge.
--
-- Vérification du GRANT table-level (demandée explicitement) : 0013,
-- section 16.1, accorde déjà
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ..., bons_livraison, ... TO authenticated;
-- Le DELETE est donc déjà ouvert au niveau GRANT pour `authenticated` (agent
-- ET admin) — SEULE la policy RLS manquait pour l'agent (le filtrage par
-- ligne). Aucun nouveau GRANT n'est donc nécessaire ici, conformément au
-- pattern GRANT (table-level) + RLS (row-level) déjà établi par ce projet
-- (0001 section 17 et suivants) : sans la policy ci-dessous, le GRANT
-- table-level restait sans effet pratique pour l'agent (RLS deny-by-default
-- en l'absence de policy DELETE correspondante).
CREATE POLICY bons_livraison_suppression_agent_orphelin
  ON bons_livraison FOR DELETE
  USING (
    is_agent_actif() AND agent_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM lignes_bon_livraison l WHERE l.bon_livraison_id = bons_livraison.id)
  );

COMMENT ON POLICY bons_livraison_suppression_agent_orphelin ON bons_livraison IS 'Correctif audit sécurité (IMPORTANT, 0014 section 3, point 4a) : permet à l''agent propriétaire de nettoyer un bon de livraison orphelin (0 ligne, donc sans aucun effet sur le stock) créé par erreur (ex. échec d''insertion des lignes). Ne s''applique jamais à un BL ayant au moins une ligne (qui a déjà décrémenté du stock réel) — cette condition NOT EXISTS est la seule garde nécessaire, aucune restriction d''âge/statut supplémentaire n''est requise.';

-- Ne rentre pas en conflit avec bons_livraison_admin_all (FOR ALL, 0013
-- section 5) : les policies RLS d'un même rôle/opération sont combinées par
-- OR — l'admin garde un accès total (y compris DELETE sur un BL non
-- orphelin), l'agent obtient un accès DELETE strictement additionnel et
-- borné par la condition ci-dessus. Aucune policy DELETE n'existait
-- auparavant pour l'agent : il n'y a donc rien à DROP/remplacer ici,
-- uniquement un CREATE POLICY (comme 0013 l'a fait pour chaque nouvelle
-- table).


-- =============================================================================
-- SECTION 4 — CHECKLIST DE VÉRIFICATION MANUELLE
-- =============================================================================
--
-- [ ] REPRODUCTION DE L'EXPLOIT (doit désormais ÉCHOUER) — Avec un produit à
--     stock_entrepot.quantite_stock=50 (Siège), créer une facture brouillon
--     entrepot_id=Siège avec une ligne quantite=20. Exécuter directement :
--       UPDATE factures SET statut = 'validee', bon_livraison_id = '<id d''un
--       BL existant, vide OU d''un autre client OU d''un autre entrepôt>'
--       WHERE id = '<id facture>';
--     -> DOIT échouer avec "Bon de livraison lié (...) introuvable ou
--     incohérent..." (mismatch client/entrepôt/BL vide) OU "...ne couvre pas
--     les quantités facturées..." (BL insuffisant). La facture doit rester
--     au statut 'brouillon' (transaction annulée), quantite_stock toujours
--     50.
--
-- [ ] CAS LÉGITIME (ne doit RIEN casser) — Créer un BL (même client, même
--     entrepot_id que la facture) avec une ligne quantite=20 sur le même
--     produit (décrémente stock_entrepot à 30 via gerer_ligne_bon_livraison,
--     0013). Créer une facture brouillon (même client/entrepot) avec une
--     ligne quantite=20 sur ce même produit, puis :
--       UPDATE factures SET statut='validee', bon_livraison_id='<id du BL>'
--       WHERE id='<id facture>';
--     -> DOIT réussir, date_validation renseignée, ET stock_entrepot.
--     quantite_stock DOIT rester à 30 (pas de second décrément).
--
-- [ ] LIGNES DUPLIQUÉES (edge case) — Facture avec DEUX lignes du même
--     produit (10 + 10 = 20 à couvrir). BL avec une seule ligne quantite=15
--     sur ce produit (insuffisant au total) : la validation DOIT échouer
--     ("ne couvre pas les quantités facturées"). Avec une ligne BL
--     quantite=20 (ou deux lignes BL totalisant 20) : DOIT réussir.
--
-- [ ] RÉUTILISATION D'UN BL DÉJÀ LIÉ (règle du durcissement, section 2) —
--     Après le cas légitime ci-dessus (BL déjà lié à une facture A), créer
--     une SECONDE facture B (même client/entrepot, mêmes quantités
--     couvertes en théorie) et tenter :
--       UPDATE factures SET statut='validee', bon_livraison_id='<même id de BL>'
--       WHERE id='<id facture B>';
--     -> DOIT échouer avec une violation de contrainte unique
--     ("duplicate key value violates unique constraint
--     factures_bon_livraison_id_unique"), AVANT même que le trigger n'ait
--     besoin de s'en soucier (la vérification de couverture aurait pourtant
--     réussi isolément pour B — c'est exactement ce que ce durcissement
--     empêche).
--
-- [ ] NETTOYAGE BL ORPHELIN (point 4a) — Connecté en tant qu'agent A, créer
--     un bons_livraison (client_id/entrepot_id quelconques, agent_id=A) SANS
--     lui ajouter de ligne. Exécuter `DELETE FROM bons_livraison WHERE
--     id='<id>';` en tant qu'agent A : DOIT réussir (1 ligne supprimée).
--     Répéter avec un BL qui a AU MOINS une ligne : DOIT échouer (0 ligne
--     affectée, RLS deny). Répéter avec le BL orphelin d'un AUTRE agent (B) :
--     DOIT échouer pour A (agent_id différent).
--
-- [ ] NON-RÉGRESSION — Rejouer la checklist complète de
--     0013_avenant_credit_entrepots.sql (section 17), en particulier les
--     items "STOCK PAR ENTREPÔT", "STOCK INSUFFISANT PAR ENTREPÔT" et
--     "FACTURE LIÉE À UN BL" : tous doivent continuer à se comporter à
--     l'identique (ce correctif ajoute des contrôles, il ne change aucun
--     comportement déjà validé par cette checklist pour le cas légitime).
--
-- =============================================================================
-- ÉCARTS PAR RAPPORT AU BROUILLON DE L'AGENT EXPERT-SECURITE
-- =============================================================================
-- 1. Noms de colonnes/tables du brouillon vérifiés EXACTS par relecture
--    directe de 0013_avenant_credit_entrepots.sql (bons_livraison.client_id/
--    entrepot_id, lignes_bon_livraison.bon_livraison_id/produit_id/quantite,
--    lignes_facture.facture_id/produit_id/quantite) : aucune correction de
--    nommage nécessaire, le brouillon était déjà juste sur ce point.
-- 2. AJOUT d'un verrouillage explicite (`PERFORM ... FOR UPDATE` sur
--    lignes_bon_livraison) avant le calcul de couverture, absent du
--    brouillon : ferme une fenêtre de concurrence entre le calcul et le
--    commit (cf. section 1, "Verrouillage anti-concurrence").
-- 3. AJOUT de la contrainte UNIQUE sur factures.bon_livraison_id (section 2),
--    absente du brouillon et non demandée explicitement par le brief de
--    correction, mais identifiée en auto-relecture comme fermant un
--    contournement résiduel réel (réutilisation d'un même BL par plusieurs
--    factures) — signalée explicitement pour validation par le métier/
--    expert-securite, avec une note opérationnelle sur le risque de conflit
--    avec des données de test déjà en base.
-- 4. Policy DELETE (section 3) reprise QUASI À L'IDENTIQUE du brouillon
--    (seul ajout : COMMENT ON POLICY documentant le raisonnement) ; GRANT
--    table-level vérifié déjà présent depuis 0013 (aucun nouveau GRANT
--    nécessaire, confirmé par lecture de 0013 section 16.1).
-- =============================================================================
-- FIN DE LA MIGRATION 0014
-- =============================================================================
