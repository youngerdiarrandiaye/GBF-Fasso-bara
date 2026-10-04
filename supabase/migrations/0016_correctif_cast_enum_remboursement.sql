-- =============================================================================
-- GFB-STOCK — Correctif BLOQUANT : cast enum manquant dans
-- appliquer_remboursement()
-- Fichier : supabase/migrations/0016_correctif_cast_enum_remboursement.sql
-- Auteur  : architecte-bdd (agent)
-- Objet   : corrige le bug BLOQUANT relevé par l'agent qa-testeur lors de la
--           recette complète de l'avenant (après le correctif de sécurité
--           0014) : TOUT enregistrement de remboursement (INSERT, mais aussi
--           UPDATE/DELETE, cf. plus bas) échoue systématiquement, quel que
--           soit l'appelant (agent ou admin), avec :
--             ERROR: column "statut" is of type statut_credit but
--                    expression is of type text
--           Ce fichier NE MODIFIE NI 0001 NI 0013 NI 0014 NI 0015 NI AUCUNE
--           autre migration existante : uniquement un
--           CREATE OR REPLACE FUNCTION appliquer_remboursement(), même
--           méthode déjà utilisée par 0014 pour corriger
--           decrementer_stock_entrepot() sans toucher au fichier 0013 qui
--           l'a introduite.
--
-- =============================================================================
-- LE BUG — POURQUOI, PAS SEULEMENT QUOI
-- =============================================================================
-- appliquer_remboursement() (0013, section 8, ~lignes 712-717) contenait :
--
--   UPDATE credits
--   SET montant_rembourse = v_total_rembourse,
--       statut = CASE WHEN v_total_rembourse >= v_credit.montant_total
--                     THEN 'solde' ELSE 'en_cours' END,
--       ...
--
-- `credits.statut` est de type `statut_credit` (ENUM custom, 0013 section 1).
-- Le piège tient à un point précis (et peu intuitif) de l'algorithme de
-- résolution de type de PostgreSQL pour l'expression `CASE` :
--
--   1. Un littéral de chaîne SANS annotation de type explicite (ex. 'solde')
--      n'est PAS immédiatement de type `text` : il est de type "unknown"
--      (littéral non typé), et PostgreSQL sait le convertir IMPLICITEMENT
--      vers PRESQUE n'importe quel type cible, y compris un ENUM custom
--      — À CONDITION que le contexte d'affectation soit connu au moment de
--      la résolution.
--
--   2. Ce contexte est bien connu et propagé pour :
--      - `INSERT INTO t (enum_col) VALUES ('x')` (le type de la colonne
--        cible guide directement la résolution du littéral 'x') ;
--      - `UPDATE t SET enum_col = 'x'` SANS CASE (même raisonnement, cf.
--        `traiter_transfert_stock()`, 0013 section 15.8, qui fait
--        `statut = 'en_transit'` etc. — mais toujours via un UPDATE émis
--        directement par l'appelant, jamais via un CASE à l'intérieur d'un
--        trigger : cf. audit de non-régression plus bas) ;
--      - `INSERT INTO alertes_stock (..., type, ...) VALUES (..., CASE WHEN
--        ... THEN 'rupture' ELSE 'stock_bas' END, ...)` (0013,
--        verifier_seuil_stock_entrepot()/scanner_alertes_stock_quotidien())
--        — MAIS cette colonne `alertes_stock.type` est un `text` avec une
--        CHECK (0001, section 12), PAS un ENUM custom : le mécanisme de
--        coercition d'un littéral "unknown" vers `text` fonctionne
--        toujours nativement (c'est le type "par défaut" de repli), donc ce
--        cas particulier n'a jamais été exposé au bug, INSERT ou pas.
--
--   3. MAIS un `CASE WHEN ... THEN 'x' ELSE 'y' END` est résolu comme une
--      expression AUTONOME, AVANT que PostgreSQL ne sache dans quel
--      contexte (colonne cible) le résultat sera utilisé. Quand TOUTES les
--      branches d'un CASE sont des littéraux "unknown" (ce qui est le cas
--      ici : 'solde' et 'en_cours'), la règle de résolution de type du CASE
--      (identique à celle de UNION/COALESCE) retombe sur le type par DÉFAUT
--      des littéraux non typés, qui est... `text`. Le CASE produit donc une
--      vraie valeur `text`, PAS "unknown".
--
--   4. Une fois que l'expression est devenue un `text` CONCRET (et non plus
--      un littéral "unknown"), la coercition implicite vers un ENUM custom
--      n'est PLUS disponible : PostgreSQL ne définit PAS de cast
--      d'affectation (assignment cast) `text -> <enum custom>` par défaut
--      (contrairement à `unknown -> <n'importe quel type>`, qui est un
--      mécanisme distinct, réservé aux littéraux non typés). D'où l'erreur
--      "column ... is of type statut_credit but expression is of type
--      text" : PAS un problème de valeur, un problème de TYPE de
--      l'expression produite par le CASE lui-même, qui reste 'text' même si
--      sa VALEUR ('solde' ou 'en_cours') est syntaxiquement identique à une
--      étiquette valide de l'enum.
--
-- En clair : le problème n'est pas spécifique à `UPDATE` vs `INSERT` (comme
-- une première lecture pourrait le laisser penser) — il est spécifique à
-- `CASE` avec des branches "unknown" affecté à une colonne ENUM, quel que
-- soit le type d'instruction SQL qui l'entoure. `INSERT INTO t (enum_col)
-- VALUES (CASE WHEN ... THEN 'x' ELSE 'y' END)` échouerait EXACTEMENT de la
-- même façon — ce n'est donc heureusement pas un piège qui menace tous les
-- `CASE` du fichier, seulement ceux dont le résultat est affecté à une
-- colonne de type ENUM CUSTOM (jamais `text`, jamais les types Postgres
-- natifs comme `boolean`/`numeric`/`timestamptz`, qui n'ont pas ce problème
-- de cast d'affectation manquant).
--
-- =============================================================================
-- IMPACT RÉEL AVANT CE CORRECTIF
-- =============================================================================
-- Le trigger trg_appliquer_remboursement (0013, section 8) est déclenché
-- `AFTER INSERT OR UPDATE OR DELETE ON remboursements_credit` : l'erreur
-- ci-dessus se produit donc pour LES TROIS opérations (pas seulement
-- l'INSERT), puisque le même UPDATE fautif sur `credits` s'exécute dans les
-- trois cas. Conséquence : la règle métier 14 (recouvrement quotidien,
-- passage automatique à 'solde') était totalement INOPÉRANTE — toute
-- tentative d'enregistrer, corriger ou supprimer un remboursement échouait
-- avec une exception PostgreSQL, annulant systématiquement la transaction
-- (donc AUCUNE incohérence de données n'a pu être introduite en production :
-- le bug est bloquant mais sans danger pour l'intégrité, contrairement au
-- correctif 0014 qui traitait un contournement silencieux).
--
-- =============================================================================
-- AUDIT DE NON-RÉGRESSION — AUTRES OCCURRENCES DU MÊME PIÈGE DANS 0013
-- =============================================================================
-- Relecture exhaustive de TOUTES les occurrences de `CASE WHEN` dans
-- 0013_avenant_credit_entrepots.sql (grep, 5 occurrences au total) :
--
--   1. appliquer_remboursement() — `statut = CASE WHEN ... THEN 'solde'
--      ELSE 'en_cours' END` (colonne ENUM `statut_credit`) -> BUG, corrigé
--      ici.
--   2. appliquer_remboursement() — `date_solde = CASE WHEN ... THEN
--      COALESCE(v_credit.date_solde, now()) ELSE NULL END` (colonne
--      `timestamptz`, PAS un enum) -> PAS AFFECTÉ. Ses deux branches ne sont
--      de toute façon jamais des littéraux "unknown" ambigus : la branche
--      THEN est déjà un `timestamptz` concret (résultat de `COALESCE` sur
--      une colonne `timestamptz` et `now()`), et `NULL` se résout toujours
--      sans ambiguïté vers le type de l'autre branche. Aucun cast requis.
--   3. verifier_seuil_stock_entrepot() — `CASE WHEN NEW.quantite_stock <= 0
--      THEN 'rupture' ELSE 'stock_bas' END` -> colonne cible
--      `alertes_stock.type`, qui est un `text` (0001 section 12), PAS un
--      ENUM custom -> PAS AFFECTÉ (le repli par défaut d'un CASE
--      "unknown"/"unknown" est justement `text`, donc ce cas tombe
--      directement sur le bon type sans avoir besoin d'aucune coercition
--      supplémentaire).
--   4. scanner_alertes_stock_quotidien() — même expression que le point 3,
--      même colonne cible `text` -> PAS AFFECTÉ, pour la même raison.
--   5. traiter_transfert_stock() (0013, section 15.8) — AUCUNE occurrence de
--      `CASE` affectée à `NEW.statut` ou à `transferts_stock.statut` : les
--      transitions de statut de cette table sont TOUJOURS pilotées par un
--      littéral direct dans l'UPDATE émis par l'APPELANT (ex.
--      `UPDATE transferts_stock SET statut = 'en_transit' WHERE ...`,
--      jamais construit dans un CASE à l'intérieur du trigger lui-même) —
--      ce trigger ne fait QUE LIRE `OLD.statut`/`NEW.statut` par
--      comparaison (`IF OLD.statut = 'demande' AND NEW.statut =
--      'en_transit' THEN ...`), jamais les écrire via un CASE -> PAS
--      AFFECTÉ, aucune modification nécessaire.
--
-- Conclusion de l'audit : `appliquer_remboursement()` est le SEUL endroit de
-- 0013 touché par ce piège. Aucune autre migration (0001-0015) n'a été
-- inspectée à nouveau ici (hors périmètre de cette correction ciblée), mais
-- aucune autre fonction du projet n'a été identifiée comme suspecte lors des
-- relectures successives de 0013/0014/0015 qui ont précédé celle-ci.
-- =============================================================================


-- =============================================================================
-- SECTION 1 — CORRECTIF : casts explicites ::statut_credit sur les deux
-- branches du CASE affecté à credits.statut
-- =============================================================================

CREATE OR REPLACE FUNCTION appliquer_remboursement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit           credits%ROWTYPE;
  v_total_rembourse  numeric(14,2);
BEGIN
  SELECT * INTO v_credit
  FROM credits
  WHERE id = COALESCE(NEW.credit_id, OLD.credit_id)
  FOR UPDATE;

  IF v_credit.id IS NULL THEN
    RAISE EXCEPTION 'Crédit introuvable pour ce remboursement';
  END IF;

  IF TG_OP = 'INSERT' AND v_credit.statut <> 'en_cours' THEN
    RAISE EXCEPTION 'Impossible d''enregistrer un remboursement sur un crédit au statut % (déjà soldé)', v_credit.statut;
  END IF;

  SELECT COALESCE(SUM(montant), 0) INTO v_total_rembourse
  FROM remboursements_credit WHERE credit_id = v_credit.id;

  IF v_total_rembourse > v_credit.montant_total THEN
    RAISE EXCEPTION 'Le cumul des remboursements (%) dépasserait le montant total du crédit (%)', v_total_rembourse, v_credit.montant_total;
  END IF;

  -- CORRECTIF (0016) : ::statut_credit explicite sur CHAQUE branche du CASE.
  -- Un seul cast (sur l'une ou l'autre branche) suffirait techniquement à
  -- lever l'ambiguïté (PostgreSQL propage ensuite le type résolu à la
  -- branche restante), mais les DEUX branches sont annotées ici pour rendre
  -- l'intention explicite à la lecture et pour ne pas dépendre d'un
  -- comportement de propagation moins évident à auditer — cf. explication
  -- complète du piège en tête de fichier. `date_solde` (colonne
  -- `timestamptz`, pas un enum) n'a besoin d'AUCUN cast : audité
  -- explicitement en tête de fichier, laissé inchangé à l'identique de 0013.
  UPDATE credits
  SET montant_rembourse = v_total_rembourse,
      statut = CASE WHEN v_total_rembourse >= v_credit.montant_total THEN 'solde'::statut_credit ELSE 'en_cours'::statut_credit END,
      date_solde = CASE WHEN v_total_rembourse >= v_credit.montant_total THEN COALESCE(v_credit.date_solde, now()) ELSE NULL END,
      updated_at = now()
  WHERE id = v_credit.id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION appliquer_remboursement() IS 'Règle métier 14. Miroir de appliquer_paiement() (0001, section 11) : recalcule le cumul remboursé et bascule automatiquement le statut du crédit (en_cours <-> solde) à chaque INSERT/UPDATE/DELETE sur remboursements_credit. CORRECTIF BLOQUANT (0016, recette qa-testeur) : ajout de casts ::statut_credit explicites sur les deux branches du CASE affecté à `statut` — sans eux, PostgreSQL résout le CASE en `text` (type par défaut de deux littéraux non typés) avant la tentative d''affectation, et il n''existe pas de cast implicite text -> statut_credit (ENUM custom), d''où "column statut is of type statut_credit but expression is of type text" sur TOUT INSERT/UPDATE/DELETE de remboursements_credit (0013 original, désormais corrigé).';

-- Aucune modification de la définition du trigger lui-même : il pointe déjà
-- vers appliquer_remboursement() par son nom (0013, section 8) et récupère
-- donc automatiquement ce nouveau corps, exactement comme pour 0014 section 1.
-- CREATE TRIGGER trg_appliquer_remboursement
--   AFTER INSERT OR UPDATE OR DELETE ON remboursements_credit
--   FOR EACH ROW EXECUTE FUNCTION appliquer_remboursement();


-- =============================================================================
-- SECTION 2 — CHECKLIST DE VÉRIFICATION MANUELLE
-- (Le QA a déjà validé ce scénario dans une transaction annulée avant de
-- signaler le bug — cette checklist permet de le rejouer et de le committer
-- pour de bon après application de cette migration.)
-- =============================================================================
--
-- [ ] REPRODUCTION DU BUG (doit désormais RÉUSSIR) — Avec un crédit
--     'en_cours', montant_total=50000, montant_rembourse=0 : exécuter
--       INSERT INTO remboursements_credit (credit_id, montant) VALUES ('<id>', 20000);
--     -> DOIT réussir SANS l'erreur "column statut is of type statut_credit
--     but expression is of type text". Vérifier credits.statut='en_cours'
--     (inchangé, remboursement partiel), montant_rembourse=20000.
--
-- [ ] REMBOURSEMENT COMPLÉMENTAIRE EXACT -> SOLDE (règle 14) — Sur le même
--     crédit, insérer un second remboursement de 30000 : DOIT réussir,
--     credits.statut passe à 'solde', date_solde renseignée (non NULL).
--
-- [ ] DÉBLOCAGE IMMÉDIAT D'UN NOUVEAU CRÉDIT (règle 13/14) — Immédiatement
--     après le passage à 'solde' ci-dessus, tenter d'ouvrir un NOUVEAU
--     crédit 'en_cours' pour le MÊME client (montant_total dans la limite du
--     seuil global) : DOIT réussir (l'index unique partiel
--     credits_un_seul_en_cours_par_client, 0013 section 7, ne couvre que
--     statut='en_cours' — le crédit soldé ci-dessus ne le bloque plus).
--
-- [ ] UPDATE/DELETE sur remboursements_credit (non-régression du trigger
--     étendu, 0013 section 8) — Sur un crédit avec un unique remboursement
--     de 20000 (statut 'en_cours'), `DELETE FROM remboursements_credit
--     WHERE id = '<id>';` DOIT réussir, credits.montant_rembourse revient à
--     0, statut reste 'en_cours', date_solde reste NULL. Recréer un
--     remboursement soldant le crédit (statut='solde', date_solde
--     renseignée), puis `DELETE` ce remboursement : statut DOIT repasser à
--     'en_cours' ET date_solde DOIT repasser à NULL (cf. 0013 section 8,
--     logique déjà documentée, non modifiée par ce correctif).
--
-- [ ] NON-RÉGRESSION GÉNÉRALE — Rejouer la checklist « CRÉDIT » de
--     0013_avenant_credit_entrepots.sql (section 17) et la checklist de
--     0014_correctif_securite_bl_facture.sql (section 4) : aucun de ces
--     scénarios ne doit changer de comportement (ce correctif ne touche que
--     la mécanique interne d'affectation de `statut`, jamais la logique
--     métier elle-même).
--
-- =============================================================================
-- FIN DE LA MIGRATION 0016
-- =============================================================================
