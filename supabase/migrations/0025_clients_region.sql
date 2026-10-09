-- =============================================================================
-- GFB-STOCK — Région du client
-- =============================================================================
-- Renseignée par l'import de la clientèle (fichiers découpés par région :
-- Dakar, Thiès, Saint-Louis, Kaolack…). Optionnelle : un client créé à la main
-- n'en a pas besoin. Aucune contrainte d'unicité : plusieurs clients par région.

BEGIN;

ALTER TABLE clients ADD COLUMN region text;

COMMENT ON COLUMN clients.region IS
'Région commerciale du client (ex. Dakar, Thiès). Renseignée par l''import de clientèle, modifiable ensuite.';

CREATE INDEX idx_clients_region ON clients(region) WHERE region IS NOT NULL;

COMMIT;
