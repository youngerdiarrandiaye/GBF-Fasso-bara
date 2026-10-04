-- =============================================================================
-- GFB-STOCK — Limites de type et de taille sur les buckets Storage
-- =============================================================================
-- Audit (checklist sécurité 8.1-8.3) : aucun bucket ne limitait le type ni la
-- taille des fichiers. Le filtre `accept="image/*"` des formulaires n'est
-- qu'une aide navigateur, contournable par un appel direct à l'API Storage.
-- Risque principal : un SVG (image/svg+xml, peut contenir du script) déposé
-- dans un bucket PUBLIC (`produits-photos`, `logo`) puis ouvert depuis son URL.
--
-- Supabase Storage applique ces deux colonnes côté serveur à chaque upload,
-- quel que soit le client (y compris service_role). Les fichiers déjà
-- stockés ne sont pas touchés (vérifié : tous conformes au 2026-10-04).

BEGIN;

-- Images publiques : formats matriciels uniquement, jamais de SVG.
UPDATE storage.buckets
SET file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
WHERE id = 'produits-photos';

UPDATE storage.buckets
SET file_size_limit = 2 * 1024 * 1024,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
WHERE id = 'logo';

-- Documents générés par les Edge Functions.
UPDATE storage.buckets
SET file_size_limit = 10 * 1024 * 1024,
    allowed_mime_types = ARRAY['application/pdf']
WHERE id IN ('factures', 'bons-livraison');

UPDATE storage.buckets
SET file_size_limit = 10 * 1024 * 1024,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
WHERE id = 'rapports';

COMMIT;
