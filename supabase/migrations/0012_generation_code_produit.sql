-- =============================================================================
-- GFB-STOCK — Génération automatique du code produit
-- Fichier : supabase/migrations/0012_generation_code_produit.sql
-- Objet   : le code produit ("Code produit" du formulaire /admin/stock/nouveau)
--           n'est plus saisi manuellement — il est généré côté serveur au
--           format GBF-XX (XX = compteur global, 2 chiffres minimum), sur le
--           même principe que generer_numero_facture() (0001, section 8) :
--           trigger BEFORE INSERT, SECURITY DEFINER, toujours cohérent même
--           en cas de créations concurrentes.
--
-- Portée volontairement minimale : ne régénère PAS les codes déjà attribués
-- (catalogue seedé — HYB1-3(⏀27mm), SV1(3/4''), S-307, S-316, PEHD ⏀63mm,
-- ⏀63mm — et deux produits créés manuellement via l'écran avant ce correctif,
-- GBF-02 et GBF-03) : seuls les codes déjà au format "GBF-XX" comptent pour
-- fixer le point de départ du compteur, afin de ne jamais entrer en collision
-- avec eux.
-- =============================================================================

-- Séquence globale (pas de partitionnement "par jour" comme
-- facture_sequences : un seul compteur suffit, aucune règle métier
-- n'exige une remise à zéro périodique pour un code produit).
-- Point de départ : 4, pour ne pas re-générer GBF-02/GBF-03 déjà existants
-- (vérifié : SELECT code FROM produits WHERE code LIKE 'GBF-%' -> GBF-02,
-- GBF-03, aucun autre).
CREATE SEQUENCE IF NOT EXISTS produits_code_seq START WITH 4;

CREATE OR REPLACE FUNCTION generer_code_produit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ne génère QUE si le code n'a pas été fourni explicitement (import futur,
  -- script de seed, ou saisie manuelle exceptionnelle restée possible côté
  -- base) — le formulaire Admin, lui, n'envoie plus jamais de code.
  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    NEW.code := 'GBF-' || lpad(nextval('produits_code_seq')::text, 2, '0');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION generer_code_produit() IS 'Génère produits.code au format GBF-XX (compteur global) si non fourni à l''INSERT — miroir de generer_numero_facture() (0001, section 8).';

CREATE TRIGGER trg_generer_code_produit
BEFORE INSERT ON produits
FOR EACH ROW EXECUTE FUNCTION generer_code_produit();

-- =============================================================================
-- VÉRIFICATION MANUELLE POST-MIGRATION
-- =============================================================================
-- INSERT INTO produits (nom, unite, type_ligne_produit, quantite_stock, seuil_alerte)
--   VALUES ('Test génération code', 'piece', 'vendu_separement', 0, 0)
--   RETURNING code;
-- Doit renvoyer 'GBF-04' (premier appel après cette migration) — supprimer
-- la ligne de test ensuite.

-- =============================================================================
-- FIN DU CORRECTIF
-- =============================================================================
