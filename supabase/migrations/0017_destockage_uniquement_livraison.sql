-- Une facture ne sort plus de marchandises. Le BL est la seule sortie physique.
-- Aucun stock historique n'est réécrit par cette migration.
BEGIN;

CREATE OR REPLACE FUNCTION decrementer_stock_entrepot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.date_validation := now();
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION decrementer_stock_entrepot() IS 'Validation commerciale uniquement ; aucun contrôle ni mouvement de stock depuis 0017.';

CREATE OR REPLACE FUNCTION restaurer_stock_annulation_entrepot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  -- Compatibilité : restituer seulement les sorties FACTURE réellement encore
  -- comptabilisées avant 0017. Une nouvelle facture n'a aucun tel mouvement.
  FOR r IN
    SELECT produit_id, entrepot_id,
           sum(CASE type WHEN 'sortie' THEN quantite WHEN 'entree' THEN -quantite ELSE 0 END) AS restant
    FROM mouvements_stock WHERE reference_facture_id = OLD.id
    GROUP BY produit_id, entrepot_id
    HAVING sum(CASE type WHEN 'sortie' THEN quantite WHEN 'entree' THEN -quantite ELSE 0 END) > 0
    ORDER BY produit_id, entrepot_id
  LOOP
    UPDATE stock_entrepot SET quantite_stock = quantite_stock + r.restant, updated_at = now()
    WHERE produit_id = r.produit_id AND entrepot_id = r.entrepot_id;
    INSERT INTO mouvements_stock (produit_id, entrepot_id, type, quantite, motif, reference_facture_id, utilisateur_id)
    VALUES (r.produit_id, r.entrepot_id, 'entree', r.restant,
            'Annulation facture historique ' || OLD.numero, OLD.id, auth.uid());
  END LOOP;
  INSERT INTO journal_activites (utilisateur_id, action, table_cible, avant, apres)
  VALUES (auth.uid(), 'annulation_facture', 'factures', to_jsonb(OLD), to_jsonb(NEW));
  RETURN NEW;
END;
$$;

-- Une création = une transaction : en-tête, copie des lignes et déstockage.
-- SECURITY DEFINER nécessaire car l'INSERT direct est fermé ci-dessous.
CREATE FUNCTION creer_bon_livraison_atomique(p_document jsonb)
RETURNS bons_livraison LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_facture factures%ROWTYPE;
  v_bl bons_livraison%ROWTYPE;
  v_facture_id uuid := nullif(p_document->>'facture_id', '')::uuid;
  v_client_id uuid := (p_document->>'client_id')::uuid;
  v_entrepot_id uuid := (p_document->>'entrepot_id')::uuid;
  v_lignes jsonb;
  v_attendues jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT (is_admin() OR is_agent_actif()) THEN
    RAISE EXCEPTION 'BL_ACCES_REFUSE';
  END IF;
  IF jsonb_typeof(p_document->'lignes') IS DISTINCT FROM 'array' OR jsonb_array_length(p_document->'lignes') = 0 THEN
    RAISE EXCEPTION 'BL_LIGNES_INVALIDES';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_document->'lignes') AS l(produit_id uuid, quantite numeric)
             WHERE produit_id IS NULL OR quantite IS NULL OR quantite <= 0 OR quantite <> round(quantite, 2)) THEN
    RAISE EXCEPTION 'BL_LIGNES_INVALIDES';
  END IF;
  SELECT jsonb_agg(to_jsonb(l) ORDER BY produit_id) INTO v_lignes FROM (
    SELECT produit_id, sum(quantite) AS quantite
    FROM jsonb_to_recordset(p_document->'lignes') AS x(produit_id uuid, quantite numeric)
    GROUP BY produit_id
  ) l;

  IF v_facture_id IS NOT NULL THEN
    -- Sérialise les doubles clics et les créations concurrentes pour une facture.
    SELECT * INTO v_facture FROM factures WHERE id = v_facture_id FOR UPDATE;
    IF NOT FOUND OR NOT (is_admin() OR v_facture.agent_id = auth.uid()) THEN
      RAISE EXCEPTION 'BL_FACTURE_INDISPONIBLE';
    END IF;
    IF v_facture.statut NOT IN ('validee', 'payee_partielle', 'payee') THEN
      RAISE EXCEPTION 'BL_FACTURE_NON_VALIDEE';
    END IF;
    IF v_facture.bon_livraison_id IS NOT NULL OR EXISTS (SELECT 1 FROM bons_livraison WHERE facture_id = v_facture_id) THEN
      RAISE EXCEPTION 'BL_FACTURE_DEJA_LIVREE';
    END IF;
    -- Les factures historiques déjà déstockées demandent une régularisation
    -- vérifiée. Ne jamais produire silencieusement une deuxième sortie.
    IF EXISTS (
      SELECT 1 FROM mouvements_stock WHERE reference_facture_id = v_facture_id
      GROUP BY produit_id, entrepot_id
      HAVING sum(CASE type WHEN 'sortie' THEN quantite WHEN 'entree' THEN -quantite ELSE 0 END) > 0
    ) THEN
      RAISE EXCEPTION 'BL_FACTURE_STOCK_HISTORIQUE';
    END IF;
    SELECT jsonb_agg(to_jsonb(l) ORDER BY produit_id) INTO v_attendues FROM (
      SELECT produit_id, sum(quantite) AS quantite FROM lignes_facture
      WHERE facture_id = v_facture_id GROUP BY produit_id
    ) l;
    IF v_client_id IS DISTINCT FROM v_facture.client_id OR v_entrepot_id IS DISTINCT FROM v_facture.entrepot_id
       OR v_lignes IS DISTINCT FROM v_attendues THEN
      RAISE EXCEPTION 'BL_FACTURE_DONNEES_MODIFIEES';
    END IF;
    v_lignes := v_attendues;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM entrepots WHERE id = v_entrepot_id AND actif) THEN
    RAISE EXCEPTION 'BL_ENTREPOT_INDISPONIBLE';
  END IF;
  INSERT INTO bons_livraison (client_id, entrepot_id, facture_id, agent_id, date_livraison, notes)
  VALUES (v_client_id, v_entrepot_id, v_facture_id, auth.uid(),
          (p_document->>'date_livraison')::date, nullif(p_document->>'notes', '')) RETURNING * INTO v_bl;
  INSERT INTO lignes_bon_livraison (bon_livraison_id, produit_id, quantite)
  SELECT v_bl.id, produit_id, quantite
  FROM jsonb_to_recordset(v_lignes) AS l(produit_id uuid, quantite numeric) ORDER BY produit_id;
  RETURN v_bl;
END;
$$;
REVOKE ALL ON FUNCTION creer_bon_livraison_atomique(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION creer_bon_livraison_atomique(jsonb) TO authenticated;
REVOKE INSERT ON bons_livraison, lignes_bon_livraison FROM authenticated;

-- L'entrepôt et les lignes d'un document déstocké ne peuvent être réécrits.
CREATE FUNCTION proteger_document_livre()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'lignes_bon_livraison' THEN
    IF (NEW.bon_livraison_id, NEW.produit_id, NEW.quantite) IS DISTINCT FROM
       (OLD.bon_livraison_id, OLD.produit_id, OLD.quantite) THEN
      RAISE EXCEPTION 'BL_DOCUMENT_IMMUABLE';
    END IF;
  ELSIF TG_TABLE_NAME = 'bons_livraison' THEN
    IF (NEW.client_id, NEW.entrepot_id, NEW.facture_id, NEW.agent_id) IS DISTINCT FROM
       (OLD.client_id, OLD.entrepot_id, OLD.facture_id, OLD.agent_id) THEN
      RAISE EXCEPTION 'BL_DOCUMENT_IMMUABLE';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM bons_livraison WHERE facture_id = OLD.id) OR OLD.bon_livraison_id IS NOT NULL THEN
    IF (NEW.client_id, NEW.entrepot_id, NEW.bon_livraison_id) IS DISTINCT FROM
       (OLD.client_id, OLD.entrepot_id, OLD.bon_livraison_id)
       OR NEW.statut IN ('brouillon', 'proforma') THEN
      RAISE EXCEPTION 'BL_DOCUMENT_IMMUABLE';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_proteger_ligne_livree BEFORE UPDATE ON lignes_bon_livraison
FOR EACH ROW EXECUTE FUNCTION proteger_document_livre();
CREATE TRIGGER trg_proteger_bon_livre BEFORE UPDATE ON bons_livraison
FOR EACH ROW EXECUTE FUNCTION proteger_document_livre();
CREATE TRIGGER trg_proteger_facture_livree BEFORE UPDATE ON factures
FOR EACH ROW EXECUTE FUNCTION proteger_document_livre();

COMMENT ON COLUMN bons_livraison.facture_id IS 'Lien canonique BL vers facture. Création atomique avec copie exacte des produits et quantités (0017).';
COMMENT ON COLUMN factures.bon_livraison_id IS 'Ancien lien conservé pour historique ; les nouvelles livraisons utilisent bons_livraison.facture_id.';
COMMIT;
