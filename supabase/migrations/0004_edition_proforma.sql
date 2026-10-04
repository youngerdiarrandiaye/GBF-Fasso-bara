-- =============================================================================
-- GFB-STOCK — Correctif fonctionnel : édition/annulation des factures au
-- statut 'proforma'
-- Fichier : supabase/migrations/0004_edition_proforma.sql
-- Auteur  : architecte-bdd (agent)
-- Objet   : corrige un bug bloquant confirmé par test manuel réel (navigateur,
--           stack Supabase local) : une fois qu'une facture passe au statut
--           'proforma', PERSONNE ne peut plus la modifier ni l'annuler via
--           l'UI actuelle — ni l'agent propriétaire, ni même l'admin par les
--           chemins d'écriture censés lui rester ouverts. Ce fichier NE
--           MODIFIE NI 0001, NI 0002, NI 0003 (déjà livrés/potentiellement
--           déjà appliqués) : il ne fait que DROP+CREATE les 4 policies RLS
--           fautives, à l'identique de la méthode déjà utilisée par
--           0003_correctifs_securite.sql.
--
-- --- Cause racine ------------------------------------------------------------
-- Les 4 policies RLS d'écriture agent posées en 0001 (sections 8 et 9)
-- restreignaient explicitement l'écriture au SEUL statut 'brouillon' :
--   - factures_maj_agent_propre_brouillon        (UPDATE factures)
--   - lignes_facture_creation_agent_propre_brouillon (INSERT lignes_facture)
--   - lignes_facture_maj_agent_propre_brouillon      (UPDATE lignes_facture)
--   - lignes_facture_suppression_agent_propre_brouillon (DELETE lignes_facture)
-- Dès qu'une facture quittait 'brouillon' pour 'proforma' (workflow normal
-- EF-FAC-12 : une proforma est éditable et convertible en facture définitive
-- SANS ressaisie), le USING de ces 4 policies devenait faux pour TOUT rôle
-- agent, quel qu'il soit -> 0 ligne visible en écriture -> UPDATE/DELETE
-- silencieusement no-op côté PostgREST -> impossible de modifier ni
-- d'annuler la proforma, y compris pour l'agent propriétaire.
-- (L'admin dispose bien de `factures_admin_all`/`lignes_facture_admin_all`
-- USING (is_admin()) sans restriction de statut : côté base, l'admin n'a
-- donc jamais été bloqué par RLS. Le blocage observé pour un compte admin
-- vient de l'UI actuelle, qui n'affiche pas encore les actions
-- Modifier/Annuler pour le statut 'proforma' — cf. note de fin de fichier à
-- destination de dev-frontend-agent.)
--
-- --- Règle métier applicable (déjà documentée dans le Cahier des Charges) ---
--   EF-FAC-02 : une facture (proforma incluse) peut être annulée à tout
--               moment avant paiement complet.
--   EF-FAC-12 : une proforma peut être convertie en facture définitive sans
--               ressaisie, ce qui implique qu'elle reste éditable (client,
--               lignes, forfait transport, notes...) tant qu'elle n'a pas
--               franchi l'étape de validation.
--
-- --- Pourquoi ce correctif est sûr (aucun impact sur le stock) --------------
-- Le décrément de stock (règle métier 4, trigger decrementer_stock() posé en
-- 0001 section 14) ne se déclenche QUE sur le passage à 'validee'
-- (WHEN (NEW.statut = 'validee' AND OLD.statut IS DISTINCT FROM 'validee')).
-- Tant qu'une facture reste au statut 'proforma', aucun mouvement de stock
-- n'a été créé et aucune quantité n'a été décrémentée : modifier ses lignes
-- (quantité, produit, prix) ou l'annuler directement depuis 'proforma' est
-- donc strictement sans risque pour la cohérence du stock. Le verrou déjà en
-- place dans le trigger gerer_ligne_facture() (0001, section 9,
-- `IF v_statut NOT IN ('brouillon', 'proforma')`) autorisait d'ailleurs déjà
-- explicitement l'édition des lignes en 'proforma' au niveau trigger : SEULE
-- la couche RLS n'avait pas été alignée sur cette même liste de statuts.
-- Ce correctif corrige donc une incohérence entre deux couches de sécurité
-- censées appliquer la même règle, pas une règle métier nouvelle.
--
-- Statuts volontairement TOUJOURS exclus de l'écriture agent après ce
-- correctif : 'validee', 'payee_partielle', 'payee', 'annulee'. Une fois le
-- stock décrémenté (validee et au-delà) ou un paiement enregistré, toute
-- modification a posteriori des lignes/du montant serait dangereuse
-- (désynchronisation stock/facture, comptabilité). Ces statuts restent donc
-- définitivement verrouillés pour l'agent — seul un admin peut y toucher
-- (et seulement via les triggers dédiés : appliquer_paiement(),
-- restaurer_stock_annulation(), jamais par UPDATE arbitraire des lignes).
--
-- --- Vérification de non-régression applicative faite avant ce correctif ---
-- lib/actions/factures.ts : ni `enregistrerBrouillon` (UPDATE ne portant que
-- sur client_id/forfait_transport/tva_taux/notes), ni `validerFacture`, ni
-- `annulerBrouillon` ne forcent explicitement `statut = 'brouillon'` dans un
-- payload UPDATE de facture existante. Étendre les policies à 'proforma' ne
-- casse donc aucun comportement applicatif déjà livré ; ça débloque
-- uniquement des écritures qui étaient jusqu'ici rejetées à tort par RLS.
--
-- --- Sur le nom historique des policies -------------------------------------
-- Les 4 policies conservent leur nom historique se terminant par
-- "_agent_propre_brouillon", qui ne décrit plus exactement leur portée
-- (elles couvrent désormais 'brouillon' ET 'proforma'). Renommer ces
-- policies est possible (DROP + CREATE sous un nouveau nom, ex.
-- "..._agent_propre_editable") mais volontairement laissé de côté ici : le
-- nom d'une policy PostgreSQL n'a aucune incidence fonctionnelle (seul son
-- USING/WITH CHECK compte), et le conserver limite le diff de cette
-- migration au strict nécessaire pour corriger le bug, réduisant le risque
-- de régression et facilitant la revue. Un renommage pourra être fait dans
-- une migration ultérieure dédiée à la lisibilité si l'équipe le souhaite.
-- =============================================================================


-- =============================================================================
-- SECTION 22 — CORRECTIF FONCTIONNEL : édition/annulation agent en 'proforma'
-- Référence bug : proforma verrouillée en écriture pour tout le monde,
-- contredit EF-FAC-02 / EF-FAC-12 (cf. en-tête de fichier).
-- =============================================================================

-- --- 22.1 factures : UPDATE agent (section 8 de 0001) -----------------------
-- USING étendu à 'brouillon' ET 'proforma' : une facture quittant l'un de ces
-- deux statuts (passage à validee/annulee) redevient immédiatement
-- non-modifiable pour l'agent, exactement comme avant pour 'brouillon' seul.
-- WITH CHECK inchangé : il autorisait déjà les statuts cibles
-- ('brouillon', 'proforma', 'validee', 'annulee') que l'agent peut demander
-- via ses Server Actions (enregistrerBrouillon reste en 'brouillon' ou
-- 'proforma', validerFacture passe à 'validee', annulerBrouillon passe à
-- 'annulee') ; 'payee_partielle'/'payee' restent hors de portée de l'agent
-- car ils ne peuvent provenir que du trigger appliquer_paiement().
DROP POLICY IF EXISTS factures_maj_agent_propre_brouillon ON factures;

CREATE POLICY factures_maj_agent_propre_brouillon
  ON factures FOR UPDATE
  USING (
    is_agent_actif() AND agent_id = auth.uid()
    AND statut IN ('brouillon', 'proforma')
  )
  WITH CHECK (
    is_agent_actif() AND agent_id = auth.uid()
    AND statut IN ('brouillon', 'proforma', 'validee', 'annulee')
  );

-- --- 22.2 lignes_facture : INSERT agent (section 9 de 0001) -----------------
-- Permet à un agent d'ajouter une ligne à sa propre facture tant qu'elle est
-- encore en 'brouillon' OU 'proforma' (EF-FAC-12 : édition sans ressaisie
-- avant conversion en facture définitive).
DROP POLICY IF EXISTS lignes_facture_creation_agent_propre_brouillon ON lignes_facture;

CREATE POLICY lignes_facture_creation_agent_propre_brouillon
  ON lignes_facture FOR INSERT
  WITH CHECK (
    is_agent_actif() AND EXISTS (
      SELECT 1 FROM factures f
      WHERE f.id = lignes_facture.facture_id
        AND f.agent_id = auth.uid() AND f.statut IN ('brouillon', 'proforma')
    )
  );

-- --- 22.3 lignes_facture : UPDATE agent (section 9 de 0001) -----------------
DROP POLICY IF EXISTS lignes_facture_maj_agent_propre_brouillon ON lignes_facture;

CREATE POLICY lignes_facture_maj_agent_propre_brouillon
  ON lignes_facture FOR UPDATE
  USING (
    is_agent_actif() AND EXISTS (
      SELECT 1 FROM factures f
      WHERE f.id = lignes_facture.facture_id
        AND f.agent_id = auth.uid() AND f.statut IN ('brouillon', 'proforma')
    )
  )
  WITH CHECK (
    is_agent_actif() AND EXISTS (
      SELECT 1 FROM factures f
      WHERE f.id = lignes_facture.facture_id
        AND f.agent_id = auth.uid() AND f.statut IN ('brouillon', 'proforma')
    )
  );

-- --- 22.4 lignes_facture : DELETE agent (section 9 de 0001) -----------------
DROP POLICY IF EXISTS lignes_facture_suppression_agent_propre_brouillon ON lignes_facture;

CREATE POLICY lignes_facture_suppression_agent_propre_brouillon
  ON lignes_facture FOR DELETE
  USING (
    is_agent_actif() AND EXISTS (
      SELECT 1 FROM factures f
      WHERE f.id = lignes_facture.facture_id
        AND f.agent_id = auth.uid() AND f.statut IN ('brouillon', 'proforma')
    )
  );

-- Note : aucune modification apportée au trigger gerer_ligne_facture() (0001,
-- section 9) ni à decrementer_stock()/restaurer_stock_annulation() (0001,
-- section 14) : ils appliquaient déjà correctement la règle 'brouillon' OU
-- 'proforma' côté trigger. Seule la couche RLS était en retard sur eux.


-- =============================================================================
-- FIN DU CORRECTIF — supabase/migrations/0004_edition_proforma.sql
-- =============================================================================
