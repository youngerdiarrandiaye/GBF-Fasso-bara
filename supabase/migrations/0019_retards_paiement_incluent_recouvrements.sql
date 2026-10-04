-- =============================================================================
-- GFB-STOCK — Retards de paiement cohérents avec les recouvrements crédit
-- =============================================================================
-- La vue des retards utilisait uniquement `paiements`. Depuis 0018, le statut
-- financier d'une facture additionne aussi les remboursements du crédit lié.
-- Cette vue doit suivre la même source de vérité pour éviter qu'une facture
-- soldée par recouvrement reste affichée comme "en retard".

BEGIN;

CREATE OR REPLACE VIEW v_factures_retard_paiement
WITH (security_invoker = true) AS
SELECT
  f.id                                                            AS facture_id,
  f.numero,
  f.client_id,
  c.nom                                                           AS client_nom,
  c.telephone                                                     AS client_telephone,
  f.agent_id,
  u.nom                                                           AS agent_nom,
  f.statut,
  f.total_general,
  f.total_general - total_encaisse_facture(f.id)                  AS solde_restant,
  f.date_facture,
  f.date_validation,
  GREATEST(0, (CURRENT_DATE - f.date_validation::date) - 10)      AS jours_de_retard
FROM factures f
JOIN clients c ON c.id = f.client_id
JOIN utilisateurs u ON u.id = f.agent_id
WHERE f.statut IN ('validee', 'payee_partielle')
  AND f.date_validation IS NOT NULL
  AND GREATEST(0, (CURRENT_DATE - f.date_validation::date) - 10) > 0
  AND (f.total_general - total_encaisse_facture(f.id)) > 0;

COMMENT ON VIEW v_factures_retard_paiement IS
'Règle métier 10 : factures validées/partiellement payées dont le solde reste dû plus de 10 jours après date_validation. Depuis 0019, le solde dû utilise total_encaisse_facture() : paiements directs + remboursements du crédit lié.';

GRANT SELECT ON v_factures_retard_paiement TO authenticated;

COMMIT;
