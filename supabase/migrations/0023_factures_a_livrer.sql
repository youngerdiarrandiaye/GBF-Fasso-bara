-- =============================================================================
-- GFB-STOCK — Factures validées en attente de livraison
-- =============================================================================
-- Liste « À livrer » (accueil Agent, tableau de bord Admin). Une facture est
-- à livrer si elle est validée/payée, sans bon de livraison, ET si elle n'a
-- pas déjà retiré du stock sous l'ancienne règle (factures antérieures à
-- 0017 : creer_bon_livraison_atomique les refuse avec
-- BL_FACTURE_STOCK_HISTORIQUE). Les agents ne lisent pas mouvements_stock
-- (RLS admin) : SECURITY DEFINER, avec le même filtre de propriété que les
-- policies de factures (agent : ses factures ; admin : toutes).

BEGIN;

CREATE FUNCTION factures_a_livrer()
RETURNS TABLE (
  id uuid,
  numero text,
  statut statut_facture,
  client_nom text,
  total_general numeric,
  date_validation timestamptz,
  entrepot_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id, f.numero, f.statut, c.nom, f.total_general, f.date_validation, f.entrepot_id
  FROM factures f
  JOIN clients c ON c.id = f.client_id
  WHERE auth.uid() IS NOT NULL
    AND (is_admin() OR (is_agent_actif() AND f.agent_id = auth.uid()))
    AND f.statut IN ('validee', 'payee_partielle', 'payee')
    AND f.bon_livraison_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM bons_livraison b WHERE b.facture_id = f.id)
    AND NOT EXISTS (
      SELECT 1 FROM mouvements_stock m
      WHERE m.reference_facture_id = f.id
      GROUP BY m.produit_id, m.entrepot_id
      HAVING sum(CASE m.type WHEN 'sortie' THEN m.quantite WHEN 'entree' THEN -m.quantite ELSE 0 END) > 0
    )
  ORDER BY f.date_validation ASC NULLS LAST, f.id;
$$;

COMMENT ON FUNCTION factures_a_livrer() IS
'Factures validées sans BL et sans sortie de stock historique, visibles par l''appelant (0023). Même règle que creer_bon_livraison_atomique.';

REVOKE ALL ON FUNCTION factures_a_livrer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION factures_a_livrer() TO authenticated;

COMMIT;
