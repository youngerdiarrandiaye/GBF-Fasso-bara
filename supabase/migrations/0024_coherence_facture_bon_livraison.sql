-- =============================================================================
-- GFB-STOCK — Cohérence statut facture <-> statut bon de livraison
-- =============================================================================
-- Avant : marquer un BL « livré, payé » ne touchait pas la facture liée, qui
-- restait « validée ». Les deux statuts divergeaient.
--
-- Règles (la facture reste la source de vérité de l'argent : son statut est
-- toujours dérivé des paiements, cf. 0018) :
--   1. BL -> « livré, payé » : le reste à payer de la facture liée est
--      enregistré comme paiement (espèces, référence « BL <numéro> »,
--      rattaché au BL via paiements.bon_livraison_id). Le trigger de
--      paiement fait passer la facture à « payée ».
--   2. BL -> « livré, non payé » : les paiements créés automatiquement par ce
--      BL sont supprimés. Refusé si la facture reste « payée » grâce à
--      d'autres paiements (à annuler d'abord).
--   3. Facture devenue « payée » (paiements manuels, remboursement du
--      crédit) : ses BL passent « livré, payé ». Si elle cesse d'être
--      payée : ses BL repassent « livré, non payé ».
--   4. Facture à crédit encore en cours : « livré, payé » refusé, le
--      règlement passe par le remboursement du crédit.

BEGIN;

ALTER TABLE paiements
  ADD COLUMN bon_livraison_id uuid REFERENCES bons_livraison(id) ON DELETE SET NULL;
CREATE INDEX idx_paiements_bon_livraison_id ON paiements(bon_livraison_id)
  WHERE bon_livraison_id IS NOT NULL;
COMMENT ON COLUMN paiements.bon_livraison_id IS
'Renseigné uniquement pour le paiement créé automatiquement quand un BL est marqué « livré, payé » (0024).';

-- ---------------------------------------------------------------------------
-- 1 & 2 : BL -> facture
-- ---------------------------------------------------------------------------
CREATE FUNCTION synchroniser_facture_depuis_bl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_facture factures%ROWTYPE;
  v_reste   numeric(14,2);
BEGIN
  IF NEW.facture_id IS NULL OR NEW.statut IS NOT DISTINCT FROM OLD.statut THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_facture FROM factures WHERE id = NEW.facture_id FOR UPDATE;
  IF v_facture.id IS NULL OR v_facture.statut NOT IN ('validee', 'payee_partielle', 'payee') THEN
    RETURN NEW;
  END IF;

  IF NEW.statut = 'livre_paye' THEN
    IF EXISTS (SELECT 1 FROM credits c WHERE c.facture_id = v_facture.id AND c.statut = 'en_cours') THEN
      RAISE EXCEPTION 'BL_FACTURE_CREDIT_EN_COURS';
    END IF;
    v_reste := v_facture.total_general - total_encaisse_facture(v_facture.id);
    IF v_reste > 0 THEN
      INSERT INTO paiements (facture_id, montant, mode_paiement, reference, date_paiement, utilisateur_id, bon_livraison_id)
      VALUES (v_facture.id, v_reste, 'especes', 'BL ' || NEW.numero, current_date, auth.uid(), NEW.id);
    END IF;
  ELSE
    DELETE FROM paiements WHERE bon_livraison_id = NEW.id;
    IF (SELECT statut FROM factures WHERE id = v_facture.id) = 'payee' THEN
      RAISE EXCEPTION 'BL_FACTURE_DEJA_PAYEE';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bl_synchroniser_facture
AFTER UPDATE OF statut ON bons_livraison
FOR EACH ROW EXECUTE FUNCTION synchroniser_facture_depuis_bl();

-- ---------------------------------------------------------------------------
-- 3 : facture -> BL
-- ---------------------------------------------------------------------------
CREATE FUNCTION synchroniser_bl_depuis_facture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.statut = 'payee' THEN
    UPDATE bons_livraison SET statut = 'livre_paye'
    WHERE facture_id = NEW.id AND statut <> 'livre_paye';
  ELSIF OLD.statut = 'payee' AND NEW.statut IN ('validee', 'payee_partielle') THEN
    UPDATE bons_livraison SET statut = 'livre_non_paye'
    WHERE facture_id = NEW.id AND statut <> 'livre_non_paye';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_facture_synchroniser_bl
AFTER UPDATE OF statut ON factures
FOR EACH ROW WHEN (OLD.statut IS DISTINCT FROM NEW.statut)
EXECUTE FUNCTION synchroniser_bl_depuis_facture();

-- ---------------------------------------------------------------------------
-- Rattrapage des données existantes : un BL « payé » dont la facture liée
-- n'est pas soldée reçoit le paiement manquant (sauf crédit en cours).
-- ---------------------------------------------------------------------------
INSERT INTO paiements (facture_id, montant, mode_paiement, reference, date_paiement, bon_livraison_id)
SELECT DISTINCT ON (f.id) f.id, f.total_general - total_encaisse_facture(f.id), 'especes', 'BL ' || b.numero, b.date_livraison, b.id
FROM bons_livraison b
JOIN factures f ON f.id = b.facture_id
WHERE b.statut = 'livre_paye'
  AND f.statut IN ('validee', 'payee_partielle')
  AND f.total_general - total_encaisse_facture(f.id) > 0
  AND NOT EXISTS (SELECT 1 FROM credits c WHERE c.facture_id = f.id AND c.statut = 'en_cours')
ORDER BY f.id, b.date_livraison;

COMMIT;
