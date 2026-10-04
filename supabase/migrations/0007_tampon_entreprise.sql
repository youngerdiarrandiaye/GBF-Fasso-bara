-- =============================================================================
-- GFB-STOCK — Ajout de l'image du tampon/signature officiel de l'entreprise
-- Fichier : supabase/migrations/0007_tampon_entreprise.sql
-- Auteur  : architecte-bdd (agent)
-- Objet   : ajoute la colonne entreprise_config.tampon_url, sur le même
--           modèle que entreprise_config.logo_url (0001, section 2, ligne
--           ~102), pour stocker l'URL publique de l'image du tampon officiel
--           GIE FASSO BARA ("GIE FASSO BARA / TEL: 77.117.72.15 / LE
--           PRESIDENT", encre bleue) à afficher dans la zone "Cachet et
--           signature" du PDF de facture.
--           Ce fichier NE MODIFIE NI 0001 NI 0002 NI 0003 NI 0004 NI 0005 NI
--           0006 (déjà livrés/potentiellement déjà appliqués) : il ne fait
--           qu'ajouter une colonne (ALTER TABLE) et étendre la vue publique
--           déjà créée par 0003 (CREATE OR REPLACE VIEW, méthode déjà
--           utilisée par 0004 pour DROP+CREATE des policies sans toucher aux
--           fichiers antérieurs).
--
-- --- Usage prévu ---------------------------------------------------------
--   - `tampon_url` contient l'URL publique (bucket Storage `logo`, cf.
--     0001 section 17) de l'image du tampon/signature officiel de
--     l'entreprise, à afficher par l'Edge Function generer-facture-pdf dans
--     la zone actuellement vide "Cachet et signature" du PDF de facture, au
--     même titre que `logo_url` est déjà lu par cette Edge Function pour
--     l'en-tête (cf. supabase/functions/generer-facture-pdf/index.ts,
--     fetchImageBytes(entreprise.logo_url)). CE FICHIER NE MODIFIE PAS
--     supabase/functions/ (hors périmètre de cette migration, en cours de
--     refonte v2 par l'agent dev-backend-edge en parallèle) : à
--     dev-backend-edge de lire `entreprise.tampon_url` et de l'intégrer au
--     PDF de façon symétrique à `logo_url`, une fois cette colonne en place.
--   - Upload prévu depuis l'écran Paramètres (dev-frontend-admin), réservé à
--     l'admin (règle métier 8 : "admin : accès total en lecture/écriture" —
--     seul l'admin peut modifier entreprise_config, cf.
--     entreprise_config_ecriture_admin, 0001 section 3), dans le bucket
--     Storage `logo` DÉJÀ EXISTANT (0001, section 17) — pas de nouveau
--     bucket créé par cette migration.
--
-- --- Vérification de la policy Storage existante sur le bucket `logo` ----
--   Les 4 policies posées en 0001 (section 17 : logo_lecture_publique,
--   logo_ecriture_admin, logo_maj_admin, logo_suppression_admin) filtrent
--   UNIQUEMENT sur `bucket_id = 'logo'` (+ `is_admin()` en écriture), SANS
--   aucune contrainte sur le nom de fichier ou un préfixe de chemin
--   (contrairement au bucket `factures`, qui contraint le premier segment de
--   `storage.foldername(name)` à `auth.uid()::text`, cf. 0001 section 17).
--   -> Ces policies couvrent donc DÉJÀ tout fichier déposé dans le bucket
--   `logo`, quel que soit son nom/chemin (logo ou tampon) : AUCUNE
--   modification de policy Storage n'est nécessaire pour cette migration.
--
--   Convention de nommage recommandée (documentaire uniquement, non
--   contrainte en base, à charge de dev-frontend-admin de la respecter à
--   l'upload) pour éviter toute collision/écrasement accidentel entre le
--   logo et le tampon dans ce bucket partagé :
--     - logo entreprise  : logo/logo-<timestamp ou uuid>.<ext>
--     - tampon officiel  : logo/tampon-<timestamp ou uuid>.<ext>
--   Cette convention par préfixe de nom de fichier suffit à distinguer les
--   deux usages sans complexifier les policies RLS Storage (qui restent
--   volontairement permissives à l'intérieur du bucket `logo`, celui-ci
--   n'accueillant que des images non sensibles à lecture publique).
-- =============================================================================


-- =============================================================================
-- SECTION 22 — entreprise_config.tampon_url
-- =============================================================================

-- --- 22.1 Ajout de la colonne -----------------------------------------------
-- Nullable comme logo_url (0001, ligne ~102) : une entreprise peut ne pas
-- encore avoir uploadé l'image de son tampon, auquel cas la zone "Cachet et
-- signature" du PDF reste vide (comportement déjà en place pour le logo
-- absent, cf. supabase/functions/generer-facture-pdf/README.md,
-- "Les photos produit et le logo entreprise sont optionnels à l'affichage").
ALTER TABLE entreprise_config
  ADD COLUMN tampon_url text;

COMMENT ON COLUMN entreprise_config.tampon_url IS
  'URL publique (bucket Storage "logo", cf. 0001 section 17) de l''image du tampon/signature officiel de GIE FASSO BARA ("GIE FASSO BARA / TEL: 77.117.72.15 / LE PRESIDENT"), affichée par l''Edge Function generer-facture-pdf dans la zone "Cachet et signature" du PDF de facture. Nullable, sur le même modèle que logo_url : absence = zone laissée vide sur le PDF. Ajoutée par 0007_tampon_entreprise.sql.';

-- --- 22.2 Extension de la vue non sensible entreprise_config_public ---------
-- entreprise_config_public (0003, section 20.3) expose EXPLICITEMENT une
-- liste blanche de colonnes non sensibles (identité, adresses, téléphones,
-- email, NINEA/RC, logo, modalités, délai proforma) à tout authentifié, sans
-- jamais exposer les colonnes bancaires. `tampon_url` est une image
-- publique au même titre que `logo_url`, déjà présent dans cette liste :
-- elle n'a donc pas sa place parmi les colonnes sensibles exclues et est
-- ajoutée à la vue par CREATE OR REPLACE VIEW (méthode sans DROP, qui
-- préserve le GRANT SELECT déjà accordé à `authenticated` en 0003 section
-- 20.3 ainsi que les dépendances éventuelles côté PostgREST).
-- NB : Postgres interdit à CREATE OR REPLACE VIEW de renommer/réordonner des
-- colonnes existantes ("cannot change name of view column ... to ...") : la
-- nouvelle colonne `tampon_url` est donc ajoutée en DERNIÈRE position de la
-- liste (après `updated_at`), et non juste après `logo_url` comme dans la
-- table entreprise_config elle-même.
CREATE OR REPLACE VIEW entreprise_config_public AS
SELECT
  id,
  nom,
  activites,
  adresses,
  telephones,
  email,
  ninea,
  rc,
  logo_url,
  modalites_reglement,
  delai_disponibilite,
  validite_proforma_jours,
  created_at,
  updated_at,
  tampon_url
FROM entreprise_config;

COMMENT ON VIEW entreprise_config_public IS
  'Vue non sensible d''entreprise_config (identité, adresses, téléphones, email, NINEA/RC, logo, tampon, modalités, délai proforma) — AUCUNE colonne bancaire. Créée par 0003_correctifs_securite.sql (section 20), étendue par 0007_tampon_entreprise.sql (ajout de tampon_url, symétrique à logo_url) pour permettre un accès en lecture aux agents sans rouvrir la table entreprise_config complète.';

-- Aucune policy RLS/Storage supplémentaire requise :
--   - entreprise_config : la table a FORCE ROW LEVEL SECURITY (0001, section
--     2) et une nouvelle colonne d'une table existante hérite automatiquement
--     des policies déjà en place sur cette table (entreprise_config_lecture_
--     admin en lecture directe, 0003 section 20 ; entreprise_config_ecriture_
--     admin en écriture, 0001 section 3) : aucune policy n'est définie
--     colonne par colonne dans ce schéma, donc rien à ajouter ici.
--   - storage.objects / bucket `logo` : cf. analyse en tête de fichier —
--     les policies 0001 (section 17) couvrent déjà tout fichier du bucket
--     `logo`, tampon inclus, sans distinction de chemin.
-- =============================================================================
