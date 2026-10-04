-- =============================================================================
-- GFB-STOCK — Date d'échéance de paiement par facture
-- =============================================================================
-- Avant : une facture est "en retard" 10 jours après sa validation (règle
-- métier 10, fixe). Désormais l'agent peut fixer une échéance explicite.
--
-- Rétrocompatible : `date_echeance` est facultative. NULL => la règle des
-- 10 jours après validation s'applique toujours (aucune facture existante
-- ne change de situation). Toutes les lectures du retard passent par la vue
-- `v_factures_retard_paiement` (écrans, alertes 0009, Edge Function
-- alerte-facture-impayee) : seule cette vue est à adapter.

BEGIN;

ALTER TABLE factures ADD COLUMN date_echeance date;

ALTER TABLE factures ADD CONSTRAINT factures_date_echeance_apres_date_facture
  CHECK (date_echeance IS NULL OR date_echeance >= date_facture);

COMMENT ON COLUMN factures.date_echeance IS
'Échéance de paiement choisie (facultative). NULL => date_validation + 10 jours (règle métier 10). Depuis 0020.';

-- Colonnes existantes inchangées et dans le même ordre (CREATE OR REPLACE
-- VIEW n'autorise que l'ajout en fin de liste) : `date_echeance_effective`
-- est ajoutée à la fin.
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
  CURRENT_DATE - e.echeance                                       AS jours_de_retard,
  e.echeance                                                      AS date_echeance_effective
FROM factures f
JOIN clients c ON c.id = f.client_id
JOIN utilisateurs u ON u.id = f.agent_id
CROSS JOIN LATERAL (
  SELECT COALESCE(f.date_echeance, f.date_validation::date + 10) AS echeance
) e
WHERE f.statut IN ('validee', 'payee_partielle')
  AND f.date_validation IS NOT NULL
  AND CURRENT_DATE > e.echeance
  AND (f.total_general - total_encaisse_facture(f.id)) > 0;

COMMENT ON VIEW v_factures_retard_paiement IS
'Règle métier 10 : factures validées/partiellement payées dont le solde reste dû après l''échéance. Échéance = factures.date_echeance si renseignée, sinon date_validation + 10 jours (0020). Solde = total - total_encaisse_facture() (0019).';

GRANT SELECT ON v_factures_retard_paiement TO authenticated;

COMMIT;
