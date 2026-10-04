-- =============================================================================
-- GFB-STOCK — Synchronisation recouvrement crédit <-> statut facture
-- =============================================================================
-- Une facture vendue à crédit est liée à `credits.facture_id`. Avant ce
-- correctif, les remboursements du crédit mettaient bien à jour `credits`,
-- mais la facture liée pouvait rester au statut `validee`.
--
-- Règle : le statut financier de la facture est recalculé depuis tout ce qui
-- encaisse réellement la facture :
--   - paiements directs (`paiements`)
--   - remboursements du crédit lié (`credits.montant_rembourse`)
--
-- 0 => validee, partiel => payee_partielle, solde complet => payee.

BEGIN;

CREATE OR REPLACE FUNCTION total_encaisse_facture(p_facture_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT SUM(p.montant) FROM paiements p WHERE p.facture_id = p_facture_id), 0)
    +
    COALESCE((SELECT SUM(c.montant_rembourse) FROM credits c WHERE c.facture_id = p_facture_id), 0)
$$;

COMMENT ON FUNCTION total_encaisse_facture(uuid) IS
'Total encaissé pour une facture : paiements directs + remboursements du crédit lié.';

CREATE OR REPLACE FUNCTION recalculer_statut_paiement_facture(p_facture_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_facture        factures%ROWTYPE;
  v_total_encaisse numeric(14,2);
  v_nouveau_statut statut_facture;
BEGIN
  SELECT * INTO v_facture
  FROM factures
  WHERE id = p_facture_id
  FOR UPDATE;

  IF v_facture.id IS NULL THEN
    RAISE EXCEPTION 'Facture introuvable pour recalcul du statut de paiement';
  END IF;

  IF v_facture.statut NOT IN ('validee', 'payee_partielle', 'payee') THEN
    RETURN;
  END IF;

  SELECT total_encaisse_facture(v_facture.id) INTO v_total_encaisse;

  IF v_total_encaisse > v_facture.total_general THEN
    RAISE EXCEPTION 'Le cumul encaissé (%) dépasserait le total de la facture (%)',
      v_total_encaisse, v_facture.total_general;
  END IF;

  IF v_total_encaisse <= 0 THEN
    v_nouveau_statut := 'validee';
  ELSIF v_total_encaisse < v_facture.total_general THEN
    v_nouveau_statut := 'payee_partielle';
  ELSE
    v_nouveau_statut := 'payee';
  END IF;

  UPDATE factures
  SET statut = v_nouveau_statut, updated_at = now()
  WHERE id = v_facture.id;
END;
$$;

COMMENT ON FUNCTION recalculer_statut_paiement_facture(uuid) IS
'Recalcule le statut financier d''une facture avec paiements directs + remboursements du crédit lié.';

CREATE OR REPLACE FUNCTION appliquer_paiement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_facture factures%ROWTYPE;
BEGIN
  SELECT * INTO v_facture
  FROM factures
  WHERE id = COALESCE(NEW.facture_id, OLD.facture_id)
  FOR UPDATE;

  IF v_facture.id IS NULL THEN
    RAISE EXCEPTION 'Facture introuvable pour ce paiement';
  END IF;

  IF TG_OP = 'INSERT' AND v_facture.statut NOT IN ('validee', 'payee_partielle') THEN
    RAISE EXCEPTION 'Impossible d''enregistrer un paiement sur une facture au statut % (elle doit d''abord être validée)', v_facture.statut;
  END IF;

  PERFORM recalculer_statut_paiement_facture(v_facture.id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION appliquer_paiement() IS
'Recalcule le statut facture à chaque INSERT/UPDATE/DELETE de paiement, en tenant compte aussi du recouvrement du crédit lié.';

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
  FROM remboursements_credit
  WHERE credit_id = v_credit.id;

  IF v_total_rembourse > v_credit.montant_total THEN
    RAISE EXCEPTION 'Le cumul des remboursements (%) dépasserait le montant total du crédit (%)',
      v_total_rembourse, v_credit.montant_total;
  END IF;

  UPDATE credits
  SET montant_rembourse = v_total_rembourse,
      statut = CASE WHEN v_total_rembourse >= v_credit.montant_total THEN 'solde'::statut_credit ELSE 'en_cours'::statut_credit END,
      date_solde = CASE WHEN v_total_rembourse >= v_credit.montant_total THEN COALESCE(v_credit.date_solde, now()) ELSE NULL END,
      updated_at = now()
  WHERE id = v_credit.id;

  IF v_credit.facture_id IS NOT NULL THEN
    PERFORM recalculer_statut_paiement_facture(v_credit.facture_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION appliquer_remboursement() IS
'Recalcule le crédit puis synchronise la facture liée : recouvrement partiel => facture payee_partielle, solde => facture payee.';

COMMIT;
