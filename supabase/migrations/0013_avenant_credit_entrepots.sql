-- =============================================================================
-- GFB-STOCK — Avenant n°1 : Crédit client, Bon de Livraison, Multi-entrepôts
-- Fichier : supabase/migrations/0013_avenant_credit_entrepots.sql
-- Auteur  : architecte-bdd (agent)
-- Objet   : première extension majeure du schéma V1 (0001-0012, en production,
--           NON MODIFIÉES par ce fichier). Trois familles de règles métier
--           nouvelles, numérotées à la suite des règles 1-10 déjà utilisées
--           dans 0001 (règles 1-9) et 0009 (règle 10) :
--
--   11. Crédit client : un client peut acheter sans payer immédiatement, avec
--       un échéancier de remboursement journalier OU mensuel (un seul mode
--       par crédit, pas de mix — décision documentée section 7).
--   12. Seuil de crédit global : entreprise_config.seuil_credit_max borne la
--       somme des soldes restants de TOUS les crédits 'en_cours', tous
--       clients confondus (pas un seuil par client). Aucun nouveau crédit ne
--       peut faire dépasser ce plafond.
--   13. Un seul crédit 'en_cours' par client — garanti par un INDEX UNIQUE
--       PARTIEL PostgreSQL (WHERE statut = 'en_cours'), la SEULE garantie
--       vraiment opposable à tous les chemins d'écriture (y compris
--       service_role, qui bypass RLS mais jamais les contraintes d'unicité
--       du moteur de stockage). Le trigger bloquer_nouveau_credit() (section
--       7) fait aussi cette vérification, mais UNIQUEMENT pour donner un
--       message d'erreur clair au chemin normal — ce n'est jamais lui la
--       garantie finale.
--   14. Recouvrement quotidien : chaque remboursement enregistré (un ou
--       plusieurs par soir, par crédit) met à jour le cumul remboursé ; un
--       crédit passe automatiquement à 'solde' dès que le cumul atteint le
--       montant total, ce qui débloque IMMÉDIATEMENT un nouveau crédit pour
--       ce client (l'index partiel de la règle 13 ne considère que les
--       lignes statut='en_cours').
--   15. Bon de livraison : document distinct de la facture, numérotation
--       propre (BL+AAAAMMJJ+SEQ(3), même mécanique que generer_numero_facture,
--       0001 section 8), FK vers une facture OPTIONNELLE (peut exister seul,
--       avant ou après la facture), statut 'livre_non_paye'/'livre_paye',
--       précise l'entrepôt de départ, décrémente le stock de CET entrepôt dès
--       que ses lignes sont saisies (pas de cycle brouillon/validation
--       séparé comme pour les factures — un BL matérialise un fait physique
--       déjà survenu, cf. décision détaillée section 5).
--   16. Multi-entrepôts : le stock d'un produit est désormais suivi
--       indépendamment PAR ENTREPÔT (table stock_entrepot). Les transferts
--       entre entrepôts suivent un cycle demande -> en_transit -> receptionne
--       (+ annulation), avec décrément du stock source au départ (en_transit)
--       et incrément du stock destination à la réception. Toute facture/BL
--       précise un entrepôt source obligatoire et ne décrémente QUE son
--       stock à lui. Les alertes de seuil bas se calculent désormais PAR
--       (produit, entrepôt), plus globalement par produit.
--
-- Ce fichier NE MODIFIE AUCUNE migration existante (0001-0012, déjà en
-- production). Toute évolution d'un comportement déjà livré (numérotation
-- facture->numéro BL, décrément de stock global->décrément par entrepôt,
-- alerte de stock global->alerte par entrepôt) est réalisée par
-- CREATE OR REPLACE FUNCTION / DROP TRIGGER + CREATE TRIGGER, exactement la
-- méthode déjà utilisée par 0003/0004/0007/0008/0010 pour faire évoluer un
-- comportement sans toucher au fichier historique qui l'a introduit.
--
-- =============================================================================
-- DEVENIR DE produits.quantite_stock / produits.seuil_alerte — DÉCISION
-- =============================================================================
-- Choix retenu : DÉPRÉCIATION, PAS DE SUPPRESSION (voir section 13).
--   - Les deux colonnes restent en base, gelées à leur dernière valeur réelle
--     (celle-ci sert justement de source pour le backfill de stock_entrepot,
--     section 11) : aucun risque de perte de données.
--   - Elles ne sont plus jamais mises à jour par aucun trigger : les anciens
--     triggers decrementer_stock()/restaurer_stock_annulation() (0001,
--     section 14) sont détachés de la table factures (DROP TRIGGER,
--     section 14) et remplacés par leurs équivalents *_entrepot() ; l'ancien
--     RPC ajuster_stock_manuel() (0010) est neutralisé (CREATE OR REPLACE,
--     lève désormais systématiquement une exception qui pointe vers le
--     nouveau chemin), et les deux colonnes deviennent non éditables même
--     par un admin via UPDATE direct (REVOKE, section 13 — même esprit que
--     le verrouillage de quantite_stock déjà fait en 0010, étendu ici à
--     seuil_alerte).
--   - Pourquoi ne pas les DROP tout de suite : au moment de cette migration
--     (Phase A du plan en 7 phases), le frontend (Phase C) et les Edge
--     Functions existantes (Phase D, ex. alerte-stock-bas qui lit
--     actuellement produits.quantite_stock/seuil_alerte) n'ont pas encore
--     été adaptés pour lire stock_entrepot. Supprimer les colonnes
--     casserait immédiatement ces lectures (erreur 42703 "column does not
--     exist") avant même que les autres agents aient pu migrer leur code.
--     Une dépréciation propre (gelée, non éditable, abondamment commentée)
--     laisse le temps aux Phases C/D de migrer leurs lectures vers
--     stock_entrepot sans downtime, avec un DROP COLUMN prévu dans un futur
--     avenant une fois ces lectures confirmées migrées.
-- =============================================================================


-- =============================================================================
-- SECTION 1 — TYPES ÉNUMÉRÉS DE L'AVENANT
-- =============================================================================

CREATE TYPE statut_credit AS ENUM ('en_cours', 'solde');

-- Décision de conception (non tranchée par le brief) : un crédit avec
-- échéancier MIXTE (ex. partiellement journalier, partiellement mensuel)
-- n'est PAS supporté. Chaque crédit a UN SEUL mode d'échéance, choisi à
-- l'ouverture. Justification : le brief dit "journalier OU mensuel", ce qui
-- se lit naturellement comme un choix exclusif ; un échéancier mixte
-- introduirait une complexité (plusieurs sous-échéanciers par crédit) non
-- demandée et non nécessaire pour garantir la seule règle métier réellement
-- vérifiée en base ici (14 : cumul des remboursements -> statut). La
-- fréquence choisie reste aujourd'hui purement INFORMATIVE côté données
-- (aucune règle SQL n'empêche un remboursement "journalier" un jour où le
-- crédit est en échéancier "mensuel" — le rythme réel de recouvrement dépend
-- de l'agent/admin sur le terrain, pas d'un calendrier généré par la base).
-- Si un futur besoin exige un échéancier généré/imposé avec des dates dues
-- précises, une table dédiée `echeances_credit` sera nécessaire : hors
-- périmètre de cet avenant.
CREATE TYPE frequence_echeance_credit AS ENUM ('journalier', 'mensuel');

-- Cycle de vie d'un transfert inter-entrepôts (règle 16). 'annule' est
-- atteignable depuis 'demande' ET 'en_transit' (cf. traiter_transfert_stock,
-- section 15) mais jamais depuis 'receptionne', qui est un état terminal
-- (décision documentée section 4).
CREATE TYPE statut_transfert_stock AS ENUM ('demande', 'en_transit', 'receptionne', 'annule');

-- Décision de conception (non tranchée par le brief) : un bon de livraison
-- n'a PAS d'état "brouillon" ou "en préparation" — il matérialise un fait
-- physique déjà survenu (la marchandise a quitté l'entrepôt), donc il naît
-- directement à 'livre_non_paye'. C'est cette absence de cycle
-- brouillon/validation (contrairement à factures) qui justifie que le
-- décrément de stock se fasse dès l'ajout d'une ligne (trigger
-- gerer_ligne_bon_livraison, section 15), et non à un hypothétique passage
-- de statut ultérieur.
CREATE TYPE statut_bon_livraison AS ENUM ('livre_non_paye', 'livre_paye');


-- =============================================================================
-- SECTION 2 — TABLE entrepots + RLS
-- =============================================================================

CREATE TABLE entrepots (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom        text NOT NULL UNIQUE,
  adresse    text,
  actif      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE entrepots IS 'Règle métier 16 : sites physiques de stockage GFB (ex. Siège/Mboro, Notto, Dakar, Keur Massar). Le stock d''un produit est suivi indépendamment par entrepôt via stock_entrepot.';

ALTER TABLE entrepots ENABLE ROW LEVEL SECURITY;
ALTER TABLE entrepots FORCE ROW LEVEL SECURITY;

CREATE TRIGGER trg_entrepots_updated_at
BEFORE UPDATE ON entrepots
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Admin : accès total, y compris création/modification d'un entrepôt (brief :
-- "seul admin crée/modifie un entrepôt").
CREATE POLICY entrepots_admin_all
  ON entrepots FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Agent : lecture de TOUS les entrepôts (brief : "un agent peut lire tous les
-- entrepôts et leur stock"), aucune policy INSERT/UPDATE/DELETE -> refus par
-- défaut pour ce rôle, conformément au reste de la règle 8 originelle.
CREATE POLICY entrepots_lecture_agent
  ON entrepots FOR SELECT
  USING (is_agent_actif());


-- =============================================================================
-- SECTION 3 — TABLE stock_entrepot + RLS
-- Remplace produits.quantite_stock/seuil_alerte comme source de vérité du
-- stock (règle 16). Voir décision de dépréciation en tête de fichier.
-- =============================================================================

CREATE TABLE stock_entrepot (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id     uuid NOT NULL REFERENCES produits(id) ON DELETE RESTRICT,
  entrepot_id    uuid NOT NULL REFERENCES entrepots(id) ON DELETE RESTRICT,
  quantite_stock numeric(12,2) NOT NULL DEFAULT 0 CHECK (quantite_stock >= 0),
  seuil_alerte   numeric(12,2) NOT NULL DEFAULT 0 CHECK (seuil_alerte >= 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_entrepot_produit_entrepot_unique UNIQUE (produit_id, entrepot_id)
);

COMMENT ON TABLE stock_entrepot IS 'Règle métier 16 : quantité en stock et seuil d''alerte d''un produit, PAR entrepôt (une ligne = un couple produit/entrepôt). Remplace produits.quantite_stock/seuil_alerte (dépréciées, cf. en-tête de 0013_avenant_credit_entrepots.sql).';

CREATE INDEX idx_stock_entrepot_produit_id ON stock_entrepot(produit_id);
CREATE INDEX idx_stock_entrepot_entrepot_id ON stock_entrepot(entrepot_id);

ALTER TABLE stock_entrepot ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_entrepot FORCE ROW LEVEL SECURITY;

CREATE TRIGGER trg_stock_entrepot_updated_at
BEFORE UPDATE ON stock_entrepot
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- RLS stock_entrepot ------------------------------------------------------
-- Lecture : admin ET agent (brief : "un agent peut lire tous les entrepôts et
-- leur stock").
CREATE POLICY stock_entrepot_lecture_authenticated
  ON stock_entrepot FOR SELECT
  USING (is_admin() OR is_agent_actif());

-- Écriture : policy FOR ALL réservée à l'admin posée ici par cohérence avec
-- le reste du schéma (défense en profondeur / documentation d'intention),
-- MAIS elle est actuellement INATTEIGNABLE en pratique : aucun GRANT
-- INSERT/UPDATE/DELETE table-level n'est accordé à `authenticated` sur cette
-- table (section 16, GRANTS) — contrairement à produits.seuil_alerte (encore
-- directement modifiable par UPDATE depuis 0010), TOUTE écriture sur
-- stock_entrepot (quantité OU seuil d'alerte) passe exclusivement par les
-- fonctions SECURITY DEFINER dédiées : ajuster_stock_manuel_entrepot() et
-- definir_seuil_alerte_entrepot() (section 15), qui journalisent
-- systématiquement un mouvement_stock et vérifient is_admin() en interne.
-- Choix plus strict que le pattern hérité de produits (0010) : stock_entrepot
-- est une table entièrement nouvelle, sans écran existant à préserver, donc
-- rien ne justifie de garder un chemin d'écriture directe même pour l'admin —
-- cela simplifie aussi la surface de test (un seul chemin d'écriture testé).
CREATE POLICY stock_entrepot_admin_all
  ON stock_entrepot FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());


-- =============================================================================
-- SECTION 4 — TABLE transferts_stock + RLS
-- Règle métier 16 : cycle demande -> en_transit -> receptionne (+ annule).
-- Le trigger qui applique réellement les mouvements de stock
-- (traiter_transfert_stock) est différé section 15 : il dépend de
-- mouvements_stock.entrepot_id/reference_transfert_id, ajoutées section 10.
-- =============================================================================

CREATE TABLE transferts_stock (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id            uuid NOT NULL REFERENCES produits(id) ON DELETE RESTRICT,
  entrepot_source_id      uuid NOT NULL REFERENCES entrepots(id) ON DELETE RESTRICT,
  entrepot_destination_id uuid NOT NULL REFERENCES entrepots(id) ON DELETE RESTRICT,
  quantite              numeric(12,2) NOT NULL CHECK (quantite > 0),
  statut                statut_transfert_stock NOT NULL DEFAULT 'demande',
  demande_par_id        uuid NOT NULL REFERENCES utilisateurs(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  receptionne_par_id    uuid REFERENCES utilisateurs(id) ON DELETE RESTRICT,
  date_demande          timestamptz NOT NULL DEFAULT now(),
  date_transit          timestamptz,
  date_reception         timestamptz,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transferts_stock_source_destination_distincts CHECK (entrepot_source_id <> entrepot_destination_id)
);

COMMENT ON TABLE transferts_stock IS 'Règle métier 16 : transfert d''une quantité d''un produit entre deux entrepôts. Décrément du stock source au passage en_transit, incrément du stock destination au passage receptionne (trigger traiter_transfert_stock, section 15). receptionne est un état terminal (décision documentée section 15) : pour corriger un transfert déjà réceptionné, créer un nouveau transfert en sens inverse.';

CREATE INDEX idx_transferts_stock_produit_id ON transferts_stock(produit_id);
CREATE INDEX idx_transferts_stock_statut ON transferts_stock(statut);
CREATE INDEX idx_transferts_stock_entrepot_source_id ON transferts_stock(entrepot_source_id);
CREATE INDEX idx_transferts_stock_entrepot_destination_id ON transferts_stock(entrepot_destination_id);

ALTER TABLE transferts_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE transferts_stock FORCE ROW LEVEL SECURITY;

CREATE TRIGGER trg_transferts_stock_updated_at
BEFORE UPDATE ON transferts_stock
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- RLS transferts_stock -----------------------------------------------------
CREATE POLICY transferts_stock_admin_all
  ON transferts_stock FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Agent : lecture de tous les transferts (visibilité opérationnelle utile,
-- même raisonnement que la lecture de tous les entrepôts/stock).
CREATE POLICY transferts_stock_lecture_agent
  ON transferts_stock FOR SELECT
  USING (is_agent_actif());

-- Agent : peut CRÉER une demande de transfert (statut 'demande' uniquement),
-- mais ne peut jamais la faire progresser lui-même (brief : "créer des
-- demandes de transfert mais PAS les réceptionner, réservé admin"). Décision
-- étendue ici : par cohérence avec "aucun accès en écriture directe au
-- stock" (règle 8 originelle), TOUTE transition de statut (demande ->
-- en_transit -> receptionne, ou annulation), pas seulement la réception, est
-- réservée à l'admin — aucune policy UPDATE n'est créée pour l'agent, donc
-- refus par défaut. demande_par_id est vérifié par le WITH CHECK (pas de
-- trigger de forçage nécessaire, même pattern que factures_creation_agent,
-- 0001 section 8 : un WITH CHECK sur une colonne = auth.uid() suffit à lui
-- seul à bloquer toute usurpation).
CREATE POLICY transferts_stock_creation_agent
  ON transferts_stock FOR INSERT
  WITH CHECK (is_agent_actif() AND statut = 'demande' AND demande_par_id = auth.uid());


-- =============================================================================
-- SECTION 5 — TABLE TECHNIQUE bl_sequences + TABLE bons_livraison + RLS +
-- trigger generer_numero_bon_livraison()
-- Règle métier 15. Miroir exact de facture_sequences/generer_numero_facture
-- (0001, sections 7 et 8).
-- =============================================================================

CREATE TABLE bl_sequences (
  jour           date PRIMARY KEY,
  dernier_numero integer NOT NULL DEFAULT 0
);

ALTER TABLE bl_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE bl_sequences FORCE ROW LEVEL SECURITY;

-- Même politique que facture_sequences (0001, section 7) : aucun accès
-- direct via l'API hormis lecture admin à titre de diagnostic ; les écritures
-- ne passent QUE par la fonction SECURITY DEFINER generer_numero_bon_livraison().
CREATE POLICY bl_sequences_lecture_admin
  ON bl_sequences FOR SELECT
  USING (is_admin());

CREATE TABLE bons_livraison (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero       text UNIQUE NOT NULL DEFAULT '',   -- toujours réécrit par le trigger avant insertion
  -- Décision de conception (non tranchée par le brief) : client_id est
  -- NOT NULL — une livraison est toujours destinée à un client identifié,
  -- même en l'absence de toute facture (le brief autorise l'absence de FK
  -- facture, pas l'absence de destinataire). facture_id, lui, reste
  -- explicitement optionnel (brief : "peut être émis avant ou après la
  -- facture... doit pouvoir exister seul ou rattaché à une facture").
  client_id    uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  facture_id   uuid REFERENCES factures(id) ON DELETE SET NULL,
  entrepot_id  uuid NOT NULL REFERENCES entrepots(id) ON DELETE RESTRICT,
  agent_id     uuid NOT NULL REFERENCES utilisateurs(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  statut       statut_bon_livraison NOT NULL DEFAULT 'livre_non_paye',
  date_livraison date NOT NULL DEFAULT current_date,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN bons_livraison.numero IS 'Format BL+AAAAMMJJ+SEQ(3), ex BL20260821001. Toujours régénéré côté serveur par generer_numero_bon_livraison(), miroir exact de factures.numero (règle 1/0001) — règle 15.';
COMMENT ON COLUMN bons_livraison.facture_id IS 'FK optionnelle : un BL peut exister seul (aucune facture émise) ou être rattaché à une facture existante, avant ou après sa création (règle 15).';

CREATE INDEX idx_bons_livraison_client_id ON bons_livraison(client_id);
CREATE INDEX idx_bons_livraison_facture_id ON bons_livraison(facture_id);
CREATE INDEX idx_bons_livraison_entrepot_id ON bons_livraison(entrepot_id);
CREATE INDEX idx_bons_livraison_agent_id ON bons_livraison(agent_id);
CREATE INDEX idx_bons_livraison_statut ON bons_livraison(statut);

ALTER TABLE bons_livraison ENABLE ROW LEVEL SECURITY;
ALTER TABLE bons_livraison FORCE ROW LEVEL SECURITY;

CREATE TRIGGER trg_bons_livraison_updated_at
BEFORE UPDATE ON bons_livraison
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- Règle métier 15 : numérotation atomique BL, miroir de generer_numero_facture
CREATE OR REPLACE FUNCTION generer_numero_bon_livraison()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jour date := CURRENT_DATE;
  v_seq  integer;
BEGIN
  -- Même mécanique de verrouillage que generer_numero_facture() (0001,
  -- section 8) : INSERT ... ON CONFLICT DO UPDATE prend un verrou de ligne
  -- sur bl_sequences(jour), sérialisant deux créations concurrentes de BL le
  -- même jour sans collision possible (règle 15, calquée sur la règle 1).
  -- Compteur INDÉPENDANT de facture_sequences (0001) : un BL et une facture
  -- créés le même jour peuvent tous les deux porter le numéro "001" dans
  -- leurs préfixes respectifs (FP.../BL...), ce qui est sans ambiguïté
  -- puisque les préfixes diffèrent.
  INSERT INTO bl_sequences (jour, dernier_numero)
  VALUES (v_jour, 1)
  ON CONFLICT (jour) DO UPDATE
    SET dernier_numero = bl_sequences.dernier_numero + 1
  RETURNING dernier_numero INTO v_seq;

  IF v_seq > 999 THEN
    RAISE EXCEPTION 'Limite quotidienne de 999 bons de livraison atteinte pour le %', v_jour;
  END IF;

  NEW.numero := 'BL' || to_char(v_jour, 'YYYYMMDD') || lpad(v_seq::text, 3, '0');

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generer_numero_bon_livraison
BEFORE INSERT ON bons_livraison
FOR EACH ROW EXECUTE FUNCTION generer_numero_bon_livraison();

-- --- RLS bons_livraison -------------------------------------------------------
CREATE POLICY bons_livraison_admin_all
  ON bons_livraison FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Agent : ne voit que SES PROPRES bons de livraison (même périmètre restreint
-- que factures_lecture_agent_propre, 0001 section 8).
CREATE POLICY bons_livraison_lecture_agent_propre
  ON bons_livraison FOR SELECT
  USING (is_agent_actif() AND agent_id = auth.uid());

-- Agent : création autorisée pour lui-même (brief : "agent... créer un bon de
-- livraison").
CREATE POLICY bons_livraison_creation_agent
  ON bons_livraison FOR INSERT
  WITH CHECK (is_agent_actif() AND agent_id = auth.uid());

-- Décision de conception (non tranchée par le brief) : AUCUNE policy
-- UPDATE/DELETE pour l'agent, même sur son propre BL -> refus par défaut. Un
-- BL matérialise une livraison physique déjà survenue (pas de cycle
-- brouillon comme les factures, cf. section 1) ; le corriger nécessite une
-- intervention admin (qui dispose de bons_livraison_admin_all). Seul le
-- statut de paiement ('livre_non_paye' -> 'livre_paye') ou une correction de
-- fond restent donc des opérations admin, cohérent avec le traitement déjà
-- réservé à l'admin pour les changements de statut des transferts (section 4).


-- =============================================================================
-- SECTION 6 — TABLE lignes_bon_livraison + RLS
-- Le trigger qui décrémente réellement le stock (gerer_ligne_bon_livraison)
-- est différé section 15 : il dépend de mouvements_stock.entrepot_id/
-- reference_bon_livraison_id, ajoutées section 10.
-- =============================================================================

CREATE TABLE lignes_bon_livraison (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bon_livraison_id uuid NOT NULL REFERENCES bons_livraison(id) ON DELETE CASCADE,
  produit_id       uuid NOT NULL REFERENCES produits(id) ON DELETE RESTRICT,
  quantite         numeric(12,2) NOT NULL CHECK (quantite > 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE lignes_bon_livraison IS 'Règle métier 15/16 : quantité livrée par produit sur un bon de livraison. Pas de prix (document logistique, pas commercial) — décrémente le stock de bons_livraison.entrepot_id dès l''INSERT (trigger gerer_ligne_bon_livraison, section 15), il n''existe pas d''étape de validation séparée comme pour lignes_facture.';

CREATE INDEX idx_lignes_bon_livraison_bon_livraison_id ON lignes_bon_livraison(bon_livraison_id);
CREATE INDEX idx_lignes_bon_livraison_produit_id ON lignes_bon_livraison(produit_id);

ALTER TABLE lignes_bon_livraison ENABLE ROW LEVEL SECURITY;
ALTER TABLE lignes_bon_livraison FORCE ROW LEVEL SECURITY;

CREATE TRIGGER trg_lignes_bon_livraison_updated_at
BEFORE UPDATE ON lignes_bon_livraison
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE POLICY lignes_bon_livraison_admin_all
  ON lignes_bon_livraison FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY lignes_bon_livraison_lecture_agent_propre
  ON lignes_bon_livraison FOR SELECT
  USING (
    is_agent_actif() AND EXISTS (
      SELECT 1 FROM bons_livraison bl
      WHERE bl.id = lignes_bon_livraison.bon_livraison_id AND bl.agent_id = auth.uid()
    )
  );

-- Agent : peut ajouter une ligne à son propre BL (aucune restriction de
-- statut : contrairement à lignes_facture, il n'existe pas d'état
-- 'brouillon' pour un BL, cf. section 1). Aucune policy UPDATE/DELETE pour
-- l'agent : une ligne déjà saisie a déjà décrémenté le stock (trigger
-- section 15), la corriger nécessite une intervention admin qui restaure
-- explicitement le stock (cf. trigger, branche DELETE).
CREATE POLICY lignes_bon_livraison_creation_agent_propre
  ON lignes_bon_livraison FOR INSERT
  WITH CHECK (
    is_agent_actif() AND EXISTS (
      SELECT 1 FROM bons_livraison bl
      WHERE bl.id = lignes_bon_livraison.bon_livraison_id AND bl.agent_id = auth.uid()
    )
  );


-- =============================================================================
-- SECTION 7 — TABLE credits + RLS + INDEX UNIQUE PARTIEL (règle 13) +
-- trigger bloquer_nouveau_credit() (règles 12/13)
-- =============================================================================

CREATE TABLE credits (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  -- FK optionnelle : un crédit peut naître d'une facture précise (achat à
  -- crédit identifié) OU être ouvert sans lien direct à une facture (simple
  -- ardoise/compte courant vis-à-vis du client) — décision de conception non
  -- tranchée par le brief, tranchée ici en faveur de la souplesse maximale,
  -- cohérente avec le fait que bons_livraison.facture_id est également
  -- optionnel (règle 15).
  facture_id          uuid REFERENCES factures(id) ON DELETE SET NULL,
  agent_id            uuid NOT NULL REFERENCES utilisateurs(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  montant_total       numeric(14,2) NOT NULL CHECK (montant_total > 0),
  -- Maintenu exclusivement par le trigger appliquer_remboursement() (section
  -- 8), jamais par écriture directe (règle 8 étendue : un montant financier
  -- calculé ne doit jamais pouvoir être désynchronisé de la somme réelle des
  -- remboursements — même philosophie que factures.total_ht, maintenu par
  -- calculer_totaux_facture(), 0001 section 9).
  montant_rembourse   numeric(14,2) NOT NULL DEFAULT 0 CHECK (montant_rembourse >= 0),
  -- Colonne générée (règle 14) : jamais négative grâce à la CHECK
  -- credits_rembourse_ne_depasse_pas_total ci-dessous.
  solde_restant       numeric(14,2) GENERATED ALWAYS AS (montant_total - montant_rembourse) STORED,
  frequence_echeance  frequence_echeance_credit NOT NULL DEFAULT 'journalier',
  statut              statut_credit NOT NULL DEFAULT 'en_cours',
  date_ouverture      date NOT NULL DEFAULT current_date,
  date_solde          timestamptz,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credits_rembourse_ne_depasse_pas_total CHECK (montant_rembourse <= montant_total)
);

COMMENT ON TABLE credits IS 'Règles métier 11-14 : achat à crédit d''un client, remboursable selon un échéancier journalier ou mensuel. montant_rembourse/statut/date_solde sont exclusivement maintenus par appliquer_remboursement() (section 8) — ne jamais les écrire directement.';

CREATE INDEX idx_credits_client_id ON credits(client_id);
CREATE INDEX idx_credits_agent_id ON credits(agent_id);
CREATE INDEX idx_credits_facture_id ON credits(facture_id);
CREATE INDEX idx_credits_statut ON credits(statut);

-- --- RÈGLE MÉTIER 13 — LA garantie anti-double-crédit ------------------------
-- Index unique PARTIEL : au plus une ligne credits.client_id par valeur de
-- client_id, PARMI les lignes statut='en_cours'. Un client peut avoir
-- plusieurs crédits 'solde' historiques (aucune limite), mais JAMAIS deux
-- 'en_cours' simultanément. C'est un INDEX, pas une policy RLS ni une
-- vérification applicative : il est donc opposable à TOUT chemin d'écriture,
-- y compris un INSERT direct par service_role (qui bypass RLS mais jamais
-- les contraintes d'unicité du moteur de stockage Postgres) ou un admin
-- connecté directement en SQL. Dès qu'un crédit passe à 'solde' (trigger
-- appliquer_remboursement, section 8), il sort immédiatement du périmètre de
-- cet index -> un nouveau crédit 'en_cours' redevient possible pour ce
-- client sans délai (règle 14).
CREATE UNIQUE INDEX credits_un_seul_en_cours_par_client
  ON credits (client_id)
  WHERE statut = 'en_cours';

COMMENT ON INDEX credits_un_seul_en_cours_par_client IS 'Règle métier 13 : garantie DB-level (pas seulement applicative/RLS) qu''un client ne peut jamais avoir deux crédits en_cours simultanément. Résiste à service_role et à tout accès SQL direct.';

ALTER TABLE credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credits FORCE ROW LEVEL SECURITY;

CREATE TRIGGER trg_credits_updated_at
BEFORE UPDATE ON credits
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- Règles métier 12/13 : plafond global + message d'erreur anti-double-crédit
-- Note d'organisation (référence forward, même pattern que 0001 section 2
-- pour entreprise_config_ecriture_admin) : le corps de cette fonction lit
-- entreprise_config.seuil_credit_max, colonne ajoutée seulement en SECTION 9
-- (après celle-ci). C'est SANS DANGER : PostgreSQL ne valide PAS les
-- références aux tables/colonnes à l'intérieur d'un corps plpgsql au moment
-- du CREATE FUNCTION (seule la syntaxe est vérifiée) — la validation réelle
-- n'a lieu qu'au premier appel de la fonction, qui ne peut survenir
-- qu'après la fin de cette migration (aucun INSERT INTO credits n'est fait
-- pendant la migration elle-même), donc après que la section 9 a ajouté la
-- colonne. Ordonné ainsi (credits avant seuil_credit_max) pour garder
-- ensemble tout ce qui concerne directement la table credits (7) avant de
-- passer aux remboursements (8), puis regrouper en fin de fichier les
-- ajouts à entreprise_config déjà existante (9) à la suite des extensions
-- similaires de 0003/0007.
CREATE OR REPLACE FUNCTION bloquer_nouveau_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seuil    numeric(14,2);
  v_en_cours numeric(14,2);
BEGIN
  -- Sérialisation des ouvertures de crédit concurrentes : verrouille la
  -- ligne SINGLETON entreprise_config (0001, section 2 — il n'en existe
  -- qu'une seule, id=true) pour la durée de la transaction. Réutilise cette
  -- ligne déjà existante comme mutex global plutôt que de créer une table de
  -- verrouillage dédiée : sans ce verrou, deux ouvertures de crédit
  -- simultanées pourraient chacune lire la même somme SUM(solde_restant) des
  -- crédits en_cours AVANT que l'une des deux n'ait inséré sa ligne, et
  -- toutes deux passeraient le contrôle de seuil alors que, prises
  -- ensemble, elles le dépassent (classique race condition sur agrégat,
  -- même risque que celui déjà neutralisé pour la numérotation de facture
  -- via facture_sequences, 0001 section 7-8).
  PERFORM 1 FROM entreprise_config WHERE id = true FOR UPDATE;

  SELECT seuil_credit_max INTO v_seuil FROM entreprise_config WHERE id = true;

  -- Règle 13 (message clair, complément non-substitutif de l'index unique
  -- partiel credits_un_seul_en_cours_par_client ci-dessus, qui reste SEUL
  -- responsable de la garantie réellement opposable à tous les chemins
  -- d'écriture — cette vérification applicative améliore seulement le
  -- message d'erreur renvoyé au chemin normal, ex. PostgREST/frontend, où un
  -- message "duplicate key value violates unique constraint" serait peu
  -- exploitable côté UI).
  IF EXISTS (SELECT 1 FROM credits WHERE client_id = NEW.client_id AND statut = 'en_cours') THEN
    RAISE EXCEPTION 'Ce client a déjà un crédit en cours : impossible d''en ouvrir un second tant qu''il n''est pas soldé';
  END IF;

  -- Règle 12 : le nouveau crédit ne doit jamais faire dépasser le plafond
  -- global (tous clients confondus), calculé sur la somme des SOLDES
  -- RESTANTS (pas des montants totaux : un crédit déjà partiellement
  -- remboursé pèse moins sur le plafond) de tous les crédits 'en_cours'.
  SELECT COALESCE(SUM(solde_restant), 0) INTO v_en_cours
  FROM credits WHERE statut = 'en_cours';

  IF v_en_cours + NEW.montant_total > v_seuil THEN
    RAISE EXCEPTION 'Seuil de crédit global dépassé : encours actuel %, seuil autorisé %, ce crédit porterait l''encours total à % (dépassement de %)',
      v_en_cours, v_seuil, v_en_cours + NEW.montant_total, (v_en_cours + NEW.montant_total) - v_seuil;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION bloquer_nouveau_credit() IS 'Règles métier 12 (plafond global) et 13 (message clair, complément non-substitutif de l''index unique partiel credits_un_seul_en_cours_par_client qui reste la seule garantie opposable à tous les chemins d''écriture).';

CREATE TRIGGER trg_bloquer_nouveau_credit
BEFORE INSERT ON credits
FOR EACH ROW EXECUTE FUNCTION bloquer_nouveau_credit();

-- --- RLS credits ---------------------------------------------------------
CREATE POLICY credits_admin_all
  ON credits FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Décision de conception (extension de périmètre agent au-delà de la règle 8
-- originelle "agent : lecture sur produits/clients [uniquement]") : l'agent
-- peut lire TOUS les crédits (tous clients, pas seulement les siens), pas
-- seulement les produits/clients. Justifié par la règle 14 ("l'agent/admin
-- enregistre chaque soir les montants récupérés sur un ou plusieurs crédits
-- en cours") : le recouvrement quotidien est une tournée qui peut concerner
-- des clients dont le crédit a été ouvert par un autre agent. À VALIDER avec
-- le métier si cette visibilité doit finalement être restreinte (cf. rapport
-- de livraison, section décisions non spécifiées).
CREATE POLICY credits_lecture_agent
  ON credits FOR SELECT
  USING (is_agent_actif());

-- Agent : peut ouvrir un crédit pour lui-même (agent_id = auth.uid(), même
-- pattern anti-usurpation que factures_creation_agent, 0001 section 8).
CREATE POLICY credits_creation_agent
  ON credits FOR INSERT
  WITH CHECK (is_agent_actif() AND agent_id = auth.uid());

-- Aucune policy UPDATE/DELETE pour l'agent : montant_rembourse/statut/
-- date_solde ne doivent JAMAIS être modifiés autrement que par
-- appliquer_remboursement() (section 8) ; une correction de montant_total/
-- frequence_echeance reste une action admin.


-- =============================================================================
-- SECTION 8 — TABLE remboursements_credit + RLS + trigger
-- appliquer_remboursement() (règle 14)
-- =============================================================================

CREATE TABLE remboursements_credit (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id         uuid NOT NULL REFERENCES credits(id) ON DELETE RESTRICT,
  montant           numeric(14,2) NOT NULL CHECK (montant > 0),
  date_remboursement date NOT NULL DEFAULT current_date,
  utilisateur_id    uuid REFERENCES utilisateurs(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE remboursements_credit IS 'Règle métier 14 : un remboursement enregistré chaque soir sur un crédit en_cours. Pas de updated_at (log financier immuable, même modèle que paiements, 0001 section 11) — une correction se fait par UPDATE/DELETE, répercutés par appliquer_remboursement().';

CREATE INDEX idx_remboursements_credit_credit_id ON remboursements_credit(credit_id);

ALTER TABLE remboursements_credit ENABLE ROW LEVEL SECURITY;
ALTER TABLE remboursements_credit FORCE ROW LEVEL SECURITY;

-- --- Règle métier 14 : cumul des remboursements -> statut automatique -------
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
  FROM remboursements_credit WHERE credit_id = v_credit.id;

  -- Garde-fou : le cumul ne doit jamais dépasser le montant total du crédit
  -- (en complément de la CHECK credits_rembourse_ne_depasse_pas_total, qui
  -- lèverait de toute façon une erreur moins explicite si ce garde-fou
  -- applicatif était retiré).
  IF v_total_rembourse > v_credit.montant_total THEN
    RAISE EXCEPTION 'Le cumul des remboursements (%) dépasserait le montant total du crédit (%)', v_total_rembourse, v_credit.montant_total;
  END IF;

  -- Règle 14 : passage automatique à 'solde' dès que le cumul atteint le
  -- montant total -> débloque IMMÉDIATEMENT un nouveau crédit pour ce client
  -- (l'index unique partiel de la section 7 ne couvre que statut='en_cours').
  -- date_solde est effacé (remis à NULL) si un remboursement est supprimé/
  -- corrigé après coup et fait redescendre le cumul sous le montant total :
  -- le crédit redevient alors 'en_cours'. Dans ce cas précis, si le client a
  -- entre-temps ouvert un NOUVEAU crédit (autorisé pendant que l'ancien était
  -- 'solde'), cet UPDATE échouera avec une violation de
  -- credits_un_seul_en_cours_par_client — comportement VOLONTAIRE : il
  -- protège l'intégrité des données en forçant une résolution manuelle par
  -- un admin plutôt que de laisser deux crédits 'en_cours' coexister
  -- silencieusement pour le même client.
  UPDATE credits
  SET montant_rembourse = v_total_rembourse,
      statut = CASE WHEN v_total_rembourse >= v_credit.montant_total THEN 'solde' ELSE 'en_cours' END,
      date_solde = CASE WHEN v_total_rembourse >= v_credit.montant_total THEN COALESCE(v_credit.date_solde, now()) ELSE NULL END,
      updated_at = now()
  WHERE id = v_credit.id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION appliquer_remboursement() IS 'Règle métier 14. Miroir de appliquer_paiement() (0001, section 11) : recalcule le cumul remboursé et bascule automatiquement le statut du crédit (en_cours <-> solde) à chaque INSERT/UPDATE/DELETE sur remboursements_credit.';

-- Étendu à UPDATE/DELETE (pas seulement INSERT), même raisonnement que
-- appliquer_paiement (0001, section 11) : le statut du crédit doit rester
-- cohérent si un admin corrige/supprime un remboursement erroné.
CREATE TRIGGER trg_appliquer_remboursement
AFTER INSERT OR UPDATE OR DELETE ON remboursements_credit
FOR EACH ROW EXECUTE FUNCTION appliquer_remboursement();

-- --- RLS remboursements_credit ------------------------------------------------
CREATE POLICY remboursements_credit_admin_all
  ON remboursements_credit FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Agent : lecture de tous les remboursements (même raisonnement que
-- credits_lecture_agent : recoupement nécessaire pour la tournée de
-- recouvrement quotidien).
CREATE POLICY remboursements_credit_lecture_agent
  ON remboursements_credit FOR SELECT
  USING (is_agent_actif());

-- Agent : peut enregistrer un remboursement sur N'IMPORTE QUEL crédit
-- en_cours (pas seulement ceux qu'il a lui-même ouverts) — reflète la
-- réalité opérationnelle du recouvrement quotidien décrite par le brief,
-- où l'agent qui passe collecter le soir n'est pas nécessairement celui qui
-- a vendu à crédit. utilisateur_id reste forcé à auth.uid() par le WITH
-- CHECK (anti-usurpation, même pattern que credits_creation_agent).
CREATE POLICY remboursements_credit_creation_agent
  ON remboursements_credit FOR INSERT
  WITH CHECK (is_agent_actif() AND utilisateur_id = auth.uid());


-- =============================================================================
-- SECTION 9 — entreprise_config.seuil_credit_max (règle 12) + extension de la
-- vue publique entreprise_config_public
-- =============================================================================

-- Défaut 0 = fail-safe volontaire : le crédit reste DÉSACTIVÉ (aucun crédit
-- ne peut être ouvert, cf. bloquer_nouveau_credit() : v_en_cours + montant >
-- 0 sera toujours vrai pour un montant_total > 0) tant qu'un admin n'a pas
-- explicitement configuré un plafond réel depuis l'écran Paramètres. Choisir
-- un défaut non-nul et arbitraire aurait autorisé silencieusement l'ouverture
-- de crédits avant toute décision consciente de la direction GFB — écart
-- volontaire par rapport à un simple "grand nombre par défaut".
ALTER TABLE entreprise_config
  ADD COLUMN seuil_credit_max numeric(14,2) NOT NULL DEFAULT 0 CHECK (seuil_credit_max >= 0);

COMMENT ON COLUMN entreprise_config.seuil_credit_max IS 'Règle métier 12 : plafond global (tous clients confondus) de l''encours de crédit autorisé. Défaut 0 = crédit désactivé tant qu''un admin ne l''a pas explicitement configuré (fail-safe volontaire). Modifiable uniquement par l''admin (policy entreprise_config_ecriture_admin, 0001 section 3).';

-- Extension de la vue non sensible (0003 section 20.3, étendue par 0007 pour
-- tampon_url) : seuil_credit_max N'EST PAS une donnée bancaire, c'est une
-- politique commerciale utile à l'agent pour anticiper si un crédit pourra
-- être ouvert avant de le proposer au client -> ajoutée à la liste blanche,
-- en dernière position (CREATE OR REPLACE VIEW ne permet pas de réordonner
-- des colonnes existantes, même contrainte déjà documentée en 0007).
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
  tampon_url,
  seuil_credit_max
FROM entreprise_config;

COMMENT ON VIEW entreprise_config_public IS 'Vue non sensible d''entreprise_config (identité, adresses, téléphones, email, NINEA/RC, logo, tampon, modalités, délai proforma, seuil de crédit global) — AUCUNE colonne bancaire. Étendue par 0013_avenant_credit_entrepots.sql (ajout de seuil_credit_max, règle 12) après 0003 (création) et 0007 (tampon_url).';


-- =============================================================================
-- SECTION 10 — ALTER des tables existantes (0001) pour le multi-entrepôts
-- Colonnes ajoutées NULLABLE ici, backfillées section 11, puis contraintes
-- NOT NULL en section 12 (là où la règle métier l'exige).
-- =============================================================================

-- --- 10.1 mouvements_stock : traçabilité par entrepôt + par document --------
-- entrepot_id : sur QUEL entrepôt porte ce mouvement (règle 16). Référence
-- bons_livraison/transferts_stock : ces deux tables viennent d'être créées
-- (sections 5 et 4), donc les FK peuvent être posées maintenant.
ALTER TABLE mouvements_stock
  ADD COLUMN entrepot_id             uuid REFERENCES entrepots(id) ON DELETE RESTRICT,
  ADD COLUMN reference_bon_livraison_id uuid REFERENCES bons_livraison(id) ON DELETE SET NULL,
  ADD COLUMN reference_transfert_id  uuid REFERENCES transferts_stock(id) ON DELETE SET NULL;

COMMENT ON COLUMN mouvements_stock.entrepot_id IS 'Règle métier 16 : entrepôt sur lequel porte ce mouvement. NOT NULL après backfill (section 12) — tout mouvement, historique compris, est désormais rattaché à un entrepôt (Siège pour l''historique antérieur à cet avenant).';
COMMENT ON COLUMN mouvements_stock.reference_transfert_id IS 'Règle métier 16 : renseigné pour les mouvements sortie/entree générés par traiter_transfert_stock() (départ/réception d''un transfert inter-entrepôts). Type réutilisé (entree/sortie) plutôt qu''une nouvelle valeur d''enum type_mouvement_stock, pour rester compatible avec la CHECK existante mouvements_stock_quantite_coherente (0001) sans ALTER TYPE.';
COMMENT ON COLUMN mouvements_stock.reference_bon_livraison_id IS 'Règle métier 15 : renseigné pour les mouvements sortie générés par gerer_ligne_bon_livraison() (décrément à l''ajout d''une ligne de BL) ou entree (restauration si une ligne de BL est supprimée par un admin).';

-- --- 10.2 factures : entrepôt source obligatoire + lien BL optionnel --------
-- entrepot_id : NULLABLE ici (backfillé section 11 vers Siège pour les
-- factures déjà existantes), rendu NOT NULL en section 12 (règle 16 : "toute
-- facture ... précise l'entrepôt source", obligatoire pour toute nouvelle
-- facture).
ALTER TABLE factures
  ADD COLUMN entrepot_id      uuid REFERENCES entrepots(id) ON DELETE RESTRICT,
  ADD COLUMN bon_livraison_id uuid REFERENCES bons_livraison(id) ON DELETE SET NULL;

COMMENT ON COLUMN factures.entrepot_id IS 'Règle métier 16 : entrepôt source de cette facture — decrementer_stock_entrepot() (section 15) ne décrémente QUE le stock de cet entrepôt. NOT NULL après backfill (section 12).';
COMMENT ON COLUMN factures.bon_livraison_id IS 'FK optionnelle vers le bon de livraison correspondant à cette facture (règle 15). DÉCISION DE CONCEPTION (non tranchée par le brief, cf. rapport de livraison) : si renseignée, la validation de cette facture NE décrémente PAS le stock une seconde fois (decrementer_stock_entrepot, section 15) — le BL a déjà matérialisé la sortie physique. Évite un double-décompte lorsqu''un agent émet BL puis facture pour la même livraison.';

CREATE INDEX idx_factures_entrepot_id ON factures(entrepot_id);
CREATE INDEX idx_factures_bon_livraison_id ON factures(bon_livraison_id);
CREATE INDEX idx_mouvements_stock_entrepot_id ON mouvements_stock(entrepot_id);
CREATE INDEX idx_mouvements_stock_reference_bon_livraison_id ON mouvements_stock(reference_bon_livraison_id);
CREATE INDEX idx_mouvements_stock_reference_transfert_id ON mouvements_stock(reference_transfert_id);

-- --- 10.3 alertes_stock : alertes désormais scopées par entrepôt (règle 16) -
ALTER TABLE alertes_stock
  ADD COLUMN entrepot_id uuid REFERENCES entrepots(id) ON DELETE CASCADE;

COMMENT ON COLUMN alertes_stock.entrepot_id IS 'Règle métier 16 : une alerte de stock bas est désormais scopée par (produit, entrepôt), plus seulement par produit. NOT NULL après backfill (section 12).';


-- =============================================================================
-- SECTION 11 — BACKFILL DES DONNÉES EXISTANTES : entrepôt "Siège"
-- Aucune donnée V1 n'est perdue : tout le stock/l''historique existant avant
-- cet avenant est rattaché à un entrepôt "Siège" créé ici, qui représente le
-- site historique unique sur lequel portait tout le stock avant le
-- multi-entrepôts (adresse Mboro, siège social de GIE FASSO BARA d''après
-- entreprise_config.adresses, cf. supabase/seed.sql).
-- =============================================================================

DO $$
DECLARE
  v_siege_id uuid;
BEGIN
  INSERT INTO entrepots (nom, adresse, actif)
  VALUES ('Siège', 'Mboro', true)
  ON CONFLICT (nom) DO NOTHING;

  SELECT id INTO v_siege_id FROM entrepots WHERE nom = 'Siège';

  -- 1) stock_entrepot : une ligne Siège par produit existant, reprenant TEL
  --    QUEL quantite_stock/seuil_alerte déjà en place sur produits (aucune
  --    perte de données — ces valeurs deviennent ensuite la source figée/
  --    dépréciée sur produits, cf. section 13).
  INSERT INTO stock_entrepot (produit_id, entrepot_id, quantite_stock, seuil_alerte)
  SELECT id, v_siege_id, quantite_stock, seuil_alerte FROM produits
  ON CONFLICT (produit_id, entrepot_id) DO NOTHING;

  -- 2) factures.entrepot_id : toutes les factures déjà existantes sont
  --    rattachées rétroactivement au Siège (seul entrepôt qui existait avant
  --    cette migration — leur stock a réellement été décrémenté/restauré
  --    depuis ce site unique par les anciens triggers 0001).
  UPDATE factures SET entrepot_id = v_siege_id WHERE entrepot_id IS NULL;

  -- 3) mouvements_stock.entrepot_id : tout l'historique de mouvements
  --    antérieur à cette migration provient également du Siège.
  UPDATE mouvements_stock SET entrepot_id = v_siege_id WHERE entrepot_id IS NULL;

  -- 4) alertes_stock.entrepot_id : idem pour l'historique d'alertes déjà en
  --    base.
  UPDATE alertes_stock SET entrepot_id = v_siege_id WHERE entrepot_id IS NULL;
END $$;


-- =============================================================================
-- SECTION 12 — CONTRAINTES NOT NULL (post-backfill) + index
-- =============================================================================

ALTER TABLE factures ALTER COLUMN entrepot_id SET NOT NULL;
ALTER TABLE mouvements_stock ALTER COLUMN entrepot_id SET NOT NULL;
ALTER TABLE alertes_stock ALTER COLUMN entrepot_id SET NOT NULL;

CREATE INDEX idx_alertes_stock_entrepot_id ON alertes_stock(entrepot_id);

-- Au plus une alerte NON LUE par couple (produit, entrepôt) — renforce en
-- contrainte DB ce qui n'était jusqu'ici (0001, alertes_stock) qu'une
-- vérification faite dans le corps du trigger verifier_seuil_stock(). Même
-- rigueur que credits_un_seul_en_cours_par_client (section 7) appliquée ici
-- à un cas moins critique (une alerte est un signal, pas une garantie
-- financière), mais peu coûteuse à garantir et cohérente avec l'esprit du
-- schéma ("le contournement de l'interface ne doit jamais violer la règle").
CREATE UNIQUE INDEX alertes_stock_un_non_lue_par_produit_entrepot
  ON alertes_stock (produit_id, entrepot_id)
  WHERE lue = false;


-- =============================================================================
-- SECTION 13 — DÉPRÉCIATION de produits.quantite_stock / produits.seuil_alerte
-- Voir décision complète en tête de fichier ("DEVENIR DE
-- produits.quantite_stock / produits.seuil_alerte"). Colonnes CONSERVÉES
-- (aucun DROP COLUMN), gelées à leur dernière valeur réelle, non éditables.
-- =============================================================================

COMMENT ON COLUMN produits.quantite_stock IS
  'DÉPRÉCIÉE depuis l''avenant multi-entrepôts (0013_avenant_credit_entrepots.sql, règle 16) : NE PLUS LIRE NI ÉCRIRE cette colonne. Gelée à sa dernière valeur réelle au moment de la migration (utilisée comme source du backfill de stock_entrepot, section 11) ; plus jamais mise à jour ensuite (les triggers decrementer_stock()/restaurer_stock_annulation() qui l''alimentaient ont été détachés de factures, section 14). Verrouillée en écriture directe depuis 0010 (REVOKE UPDATE sur cette colonne pour authenticated) : ceci reste vrai et n''a pas besoin d''être répété ici. La source de vérité du stock est désormais stock_entrepot (section 3). À DROP dans un futur avenant une fois les lectures Phase C (frontend) / Phase D (Edge Functions, ex. alerte-stock-bas) migrées vers stock_entrepot.';

COMMENT ON COLUMN produits.seuil_alerte IS
  'DÉPRÉCIÉE depuis l''avenant multi-entrepôts (0013_avenant_credit_entrepots.sql, règle 16) : NE PLUS LIRE NI ÉCRIRE cette colonne. Gelée à sa dernière valeur réelle (source du backfill de stock_entrepot, section 11). Verrouillée en écriture directe par cette même migration (section 13, REVOKE ci-dessous — elle ne l''était PAS encore par 0010, qui l''avait laissée éditable). Le seuil d''alerte réel est désormais stock_entrepot.seuil_alerte, par entrepôt (section 3).';

-- --- Verrouillage écriture directe de seuil_alerte (quantite_stock l'était déjà depuis 0010) ---
-- Même méthode empiriquement vérifiée que 0010 (section 3) : les privilèges
-- table-level et column-level sont ADDITIFS en Postgres, donc un simple
-- REVOKE UPDATE (seuil_alerte) seul ne suffirait pas tant que le GRANT
-- UPDATE table-level de 0010 reste en place pour cette colonne. Il faut
-- retirer le GRANT UPDATE table-level en entier puis le rouvrir colonne par
-- colonne, cette fois SANS seuil_alerte (qui s'ajoute à quantite_stock,
-- déjà exclue depuis 0010).
REVOKE UPDATE ON produits FROM authenticated;

GRANT UPDATE (
  code,
  nom,
  description,
  categorie_id,
  unite,
  type_ligne_produit,
  kit_parent_id,
  prix_unitaire,
  photos_urls,
  actif
) ON produits TO authenticated;

-- --- Neutralisation du RPC ajuster_stock_manuel() (0010) --------------------
-- CREATE OR REPLACE (ne modifie pas le fichier 0010, seulement le corps de
-- la fonction, exactement la méthode déjà utilisée pour
-- entreprise_config_public à travers 0003/0007/0013 section 9) : la
-- signature reste identique (uuid, numeric, text) pour ne pas casser un
-- éventuel appel existant côté Edge Function/RPC déjà déployé, mais le corps
-- lève désormais TOUJOURS une exception explicite. Objectif : empêcher
-- silencieusement toute écriture sur la colonne gelée produits.quantite_stock
-- qui donnerait l'illusion d'un ajustement de stock fonctionnel alors que
-- plus rien (alerte, décrément facture, etc.) ne lit cette colonne — une
-- erreur explicite et immédiate est très préférable à une opération qui
-- "réussit" silencieusement sans effet réel sur le stock consulté ailleurs.
CREATE OR REPLACE FUNCTION ajuster_stock_manuel(
  p_produit_id uuid,
  p_nouvelle_quantite numeric,
  p_motif text
)
RETURNS TABLE (ancienne_quantite numeric, nouvelle_quantite numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'ajuster_stock_manuel(uuid, numeric, text) est déprécié depuis l''avenant multi-entrepôts (0013_avenant_credit_entrepots.sql) : produits.quantite_stock n''est plus la source de vérité du stock. Utiliser ajuster_stock_manuel_entrepot(p_produit_id, p_entrepot_id, p_nouvelle_quantite, p_motif) à la place.';
END;
$$;

COMMENT ON FUNCTION ajuster_stock_manuel(uuid, numeric, text) IS 'DÉPRÉCIÉE (0013_avenant_credit_entrepots.sql) : lève désormais systématiquement une exception. Remplacée par ajuster_stock_manuel_entrepot(produit_id, entrepot_id, nouvelle_quantite, motif), section 15.';


-- =============================================================================
-- SECTION 14 — DÉTACHEMENT des anciens triggers de stock GLOBAL (0001)
-- Ne supprime AUCUNE fonction (conservées, COMMENT les marque dépréciées) :
-- seuls les triggers qui les attachaient à une table sont retirés, remplacés
-- section 15 par leurs équivalents *_entrepot(). Décision : DROP TRIGGER +
-- CREATE TRIGGER est une évolution normale déjà pratiquée par ce projet
-- (0004 l'a fait pour des policies) ; elle ne modifie pas le fichier 0001
-- lui-même, seulement l'état vivant de la base.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_decrementer_stock ON factures;
DROP TRIGGER IF EXISTS trg_restaurer_stock_annulation ON factures;
DROP TRIGGER IF EXISTS trg_verifier_seuil_stock_update ON produits;
DROP TRIGGER IF EXISTS trg_verifier_seuil_stock_insert ON produits;

COMMENT ON FUNCTION decrementer_stock() IS 'DÉPRÉCIÉE (0013_avenant_credit_entrepots.sql, règle 16) : plus attachée à aucun trigger depuis cet avenant (DROP TRIGGER trg_decrementer_stock). Conservée pour l''historique/audit uniquement. Remplacée par decrementer_stock_entrepot(), section 15.';
COMMENT ON FUNCTION restaurer_stock_annulation() IS 'DÉPRÉCIÉE (0013_avenant_credit_entrepots.sql, règle 16) : plus attachée à aucun trigger depuis cet avenant (DROP TRIGGER trg_restaurer_stock_annulation). Conservée pour l''historique/audit uniquement. Remplacée par restaurer_stock_annulation_entrepot(), section 15.';
COMMENT ON FUNCTION verifier_seuil_stock() IS 'DÉPRÉCIÉE (0013_avenant_credit_entrepots.sql, règle 16) : plus attachée à aucun trigger depuis cet avenant (DROP TRIGGER trg_verifier_seuil_stock_update/insert). Conservée pour l''historique/audit uniquement. Remplacée par verifier_seuil_stock_entrepot(), section 15.';
-- gerer_ajustement_stock_manuel() (0001) et son trigger trg_gerer_ajustement_stock_manuel
-- (AFTER UPDATE OF quantite_stock ON produits) restent en place TELS QUELS,
-- volontairement non touchés : ce trigger ne peut de toute façon plus jamais
-- se déclencher en pratique, puisque plus rien ne met à jour
-- produits.quantite_stock (ni les triggers détachés ci-dessus, ni le RPC
-- neutralisé section 13, ni un UPDATE direct verrouillé depuis 0010) — il
-- devient inerte de lui-même, sans qu'il soit nécessaire de le DROP.


-- =============================================================================
-- SECTION 15 — TRIGGERS MÉTIER TRANSVERSES DE L'AVENANT
-- Regroupés ici (même principe que 0001 section 14) car ils dépendent tous de
-- mouvements_stock.entrepot_id/reference_bon_livraison_id/reference_transfert_id
-- (section 10) et/ou de alertes_stock.entrepot_id (section 10), ajoutées
-- après la création des tables sections 2-9.
-- =============================================================================

-- --- 15.1 Règle métier 16 (admin) : ajustement manuel du stock PAR ENTREPÔT -
-- Miroir de ajuster_stock_manuel() (0010), étendu avec un couple
-- (produit, entrepôt) et un upsert (le couple peut ne pas encore exister
-- dans stock_entrepot, ex. première mise en stock d'un produit dans un
-- entrepôt qui n'en avait jamais reçu).
CREATE OR REPLACE FUNCTION ajuster_stock_manuel_entrepot(
  p_produit_id uuid,
  p_entrepot_id uuid,
  p_nouvelle_quantite numeric,
  p_motif text
)
RETURNS TABLE (ancienne_quantite numeric, nouvelle_quantite numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ancienne numeric(12,2);
  v_trouve   boolean;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  IF p_motif IS NULL OR length(trim(p_motif)) = 0 THEN
    RAISE EXCEPTION 'Le motif est obligatoire pour un ajustement de stock';
  END IF;

  IF p_nouvelle_quantite < 0 THEN
    RAISE EXCEPTION 'La nouvelle quantité en stock ne peut pas être négative';
  END IF;

  SELECT quantite_stock INTO v_ancienne
  FROM stock_entrepot
  WHERE produit_id = p_produit_id AND entrepot_id = p_entrepot_id
  FOR UPDATE;
  v_trouve := FOUND;

  IF NOT v_trouve THEN
    -- Première mise en stock de ce produit dans cet entrepôt : ancienne
    -- quantité conventionnellement 0.
    v_ancienne := 0;
    INSERT INTO stock_entrepot (produit_id, entrepot_id, quantite_stock)
    VALUES (p_produit_id, p_entrepot_id, p_nouvelle_quantite);
  ELSE
    IF v_ancienne = p_nouvelle_quantite THEN
      RAISE EXCEPTION 'La nouvelle quantité est identique au stock actuel : aucun ajustement à enregistrer';
    END IF;
    UPDATE stock_entrepot
    SET quantite_stock = p_nouvelle_quantite, updated_at = now()
    WHERE produit_id = p_produit_id AND entrepot_id = p_entrepot_id;
  END IF;

  INSERT INTO mouvements_stock (produit_id, entrepot_id, type, quantite, motif, reference_facture_id, utilisateur_id)
  VALUES (p_produit_id, p_entrepot_id, 'ajustement', p_nouvelle_quantite - v_ancienne, p_motif, NULL, auth.uid());

  INSERT INTO journal_activites (utilisateur_id, action, table_cible, avant, apres)
  VALUES (
    auth.uid(), 'ajustement_stock_manuel_entrepot', 'stock_entrepot',
    jsonb_build_object('produit_id', p_produit_id, 'entrepot_id', p_entrepot_id, 'quantite_stock', v_ancienne),
    jsonb_build_object('produit_id', p_produit_id, 'entrepot_id', p_entrepot_id, 'quantite_stock', p_nouvelle_quantite, 'motif', p_motif)
  );

  RETURN QUERY SELECT v_ancienne, p_nouvelle_quantite;
END;
$$;

COMMENT ON FUNCTION ajuster_stock_manuel_entrepot(uuid, uuid, numeric, text) IS 'Règle métier 16. Seul chemin autorisé pour modifier stock_entrepot.quantite_stock hors validation/annulation de facture, réception de transfert ou saisie de ligne de bon de livraison. SECURITY DEFINER : vérifie is_admin() en interne, motif obligatoire, verrouille la ligne (FOR UPDATE) pour éviter toute race condition entre deux ajustements concurrents. Remplace ajuster_stock_manuel() (0010, neutralisée section 13).';

REVOKE ALL ON FUNCTION ajuster_stock_manuel_entrepot(uuid, uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ajuster_stock_manuel_entrepot(uuid, uuid, numeric, text) TO authenticated;

-- --- 15.2 Modification du seuil d'alerte PAR ENTREPÔT (admin uniquement) ----
-- Dédiée et distincte de ajuster_stock_manuel_entrepot() : ne touche jamais
-- quantite_stock, n'insère jamais de mouvements_stock (ce n'est pas un
-- mouvement de stock), upsert également défensif.
CREATE OR REPLACE FUNCTION definir_seuil_alerte_entrepot(
  p_produit_id uuid,
  p_entrepot_id uuid,
  p_seuil numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  IF p_seuil < 0 THEN
    RAISE EXCEPTION 'Le seuil d''alerte ne peut pas être négatif';
  END IF;

  INSERT INTO stock_entrepot (produit_id, entrepot_id, quantite_stock, seuil_alerte)
  VALUES (p_produit_id, p_entrepot_id, 0, p_seuil)
  ON CONFLICT (produit_id, entrepot_id)
    DO UPDATE SET seuil_alerte = p_seuil, updated_at = now();
END;
$$;

COMMENT ON FUNCTION definir_seuil_alerte_entrepot(uuid, uuid, numeric) IS 'Règle métier 16. Seul chemin autorisé pour modifier stock_entrepot.seuil_alerte (admin uniquement), distinct de ajuster_stock_manuel_entrepot() car ne constitue jamais un mouvement de stock.';

REVOKE ALL ON FUNCTION definir_seuil_alerte_entrepot(uuid, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION definir_seuil_alerte_entrepot(uuid, uuid, numeric) TO authenticated;

-- --- 15.3 Règle métier 6 (adaptée règle 16) : alerte PAR (produit, entrepôt)
CREATE OR REPLACE FUNCTION verifier_seuil_stock_entrepot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nom          text;
  v_entrepot_nom text;
BEGIN
  SELECT nom INTO v_nom FROM produits WHERE id = NEW.produit_id;
  SELECT nom INTO v_entrepot_nom FROM entrepots WHERE id = NEW.entrepot_id;

  IF NEW.quantite_stock <= NEW.seuil_alerte THEN
    IF NOT EXISTS (
      SELECT 1 FROM alertes_stock
      WHERE produit_id = NEW.produit_id AND entrepot_id = NEW.entrepot_id AND lue = false
    ) THEN
      INSERT INTO alertes_stock (produit_id, entrepot_id, type, message, lue)
      VALUES (
        NEW.produit_id, NEW.entrepot_id,
        CASE WHEN NEW.quantite_stock <= 0 THEN 'rupture' ELSE 'stock_bas' END,
        format('Stock bas pour "%s" à l''entrepôt "%s" : %s restant(s), seuil d''alerte %s',
               v_nom, v_entrepot_nom, NEW.quantite_stock, NEW.seuil_alerte),
        false
      );
    END IF;
  ELSE
    UPDATE alertes_stock
    SET lue = true, updated_at = now()
    WHERE produit_id = NEW.produit_id AND entrepot_id = NEW.entrepot_id AND lue = false;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION verifier_seuil_stock_entrepot() IS 'Règle métier 6, adaptée à la règle 16 : alerte automatique quand stock_entrepot.quantite_stock <= seuil_alerte, désormais PAR (produit, entrepôt). Remplace verifier_seuil_stock() (0001, détachée section 14).';

CREATE TRIGGER trg_verifier_seuil_stock_entrepot
AFTER INSERT OR UPDATE OF quantite_stock, seuil_alerte ON stock_entrepot
FOR EACH ROW EXECUTE FUNCTION verifier_seuil_stock_entrepot();

-- Diffusion temps réel des nouvelles alertes stock_entrepot (alertes_stock
-- est déjà dans supabase_realtime depuis 0001 section 12 -> rien à ajouter
-- ici, l'ajout de la colonne entrepot_id ne change pas la publication).

-- --- 15.4 Adaptation du scan quotidien (règle 6/16) --------------------------
-- CREATE OR REPLACE conserve exactement le même nom de fonction : le job
-- pg_cron 'scan-alertes-stock-quotidien' déjà planifié par 0001 (section 16,
-- '0 6 * * *') continue de fonctionner SANS aucune modification de
-- cron.schedule() — seul le corps de la fonction change de source
-- (stock_entrepot au lieu de produits).
CREATE OR REPLACE FUNCTION scanner_alertes_stock_quotidien()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT se.produit_id, se.entrepot_id, se.quantite_stock, se.seuil_alerte,
           p.nom, p.code, e.nom AS entrepot_nom
    FROM stock_entrepot se
    JOIN produits p ON p.id = se.produit_id AND p.actif = true
    JOIN entrepots e ON e.id = se.entrepot_id AND e.actif = true
    WHERE se.quantite_stock <= se.seuil_alerte
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM alertes_stock
      WHERE produit_id = r.produit_id AND entrepot_id = r.entrepot_id AND lue = false
    ) THEN
      INSERT INTO alertes_stock (produit_id, entrepot_id, type, message, lue)
      VALUES (
        r.produit_id, r.entrepot_id,
        CASE WHEN r.quantite_stock <= 0 THEN 'rupture' ELSE 'stock_bas' END,
        format('[Scan quotidien 06h00] Stock bas pour "%s" (%s) à l''entrepôt "%s" : %s restant(s), seuil %s',
               r.nom, r.code, r.entrepot_nom, r.quantite_stock, r.seuil_alerte),
        false
      );
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION scanner_alertes_stock_quotidien() IS 'Règle métier 6, adaptée à la règle 16 (0013_avenant_credit_entrepots.sql) : scanne désormais stock_entrepot au lieu de produits. Filet de sécurité quotidien en complément du trigger temps réel verifier_seuil_stock_entrepot(). Nom de fonction inchangé -> le job pg_cron existant (0001 section 16) continue de l''appeler sans reconfiguration.';

-- --- 15.5 Règle métier 4 (adaptée règle 16) : décrément PAR ENTREPÔT --------
CREATE OR REPLACE FUNCTION decrementer_stock_entrepot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        RECORD;
  v_dispo  numeric(12,2);
BEGIN
  -- DÉCISION DE CONCEPTION (non tranchée par le brief, cf. rapport de
  -- livraison) : si cette facture est rattachée à un bon de livraison
  -- (bon_livraison_id), le stock a déjà été décrémenté par
  -- gerer_ligne_bon_livraison() (section 15.6) au moment de la saisie des
  -- lignes du BL — le BL matérialise la sortie physique, la facture n'est
  -- ici qu'un document commercial qui vient facturer un flux déjà compté.
  -- On se contente donc de valider la facture (date_validation) SANS
  -- décrémenter le stock une seconde fois pour les mêmes marchandises.
  IF NEW.bon_livraison_id IS NOT NULL THEN
    NEW.date_validation := now();
    RETURN NEW;
  END IF;

  -- 1) Vérification de disponibilité, PAR ENTREPÔT (NEW.entrepot_id), avec
  --    verrouillage ligne par ligne (FOR UPDATE) pour empêcher deux
  --    validations concurrentes de dépasser le stock réellement disponible
  --    DANS CET ENTREPÔT (même logique de concurrence que decrementer_stock()
  --    original, 0001 section 14, mais scopée à un entrepôt).
  FOR r IN
    SELECT lf.produit_id, p.nom, lf.quantite AS quantite_demandee
    FROM lignes_facture lf
    JOIN produits p ON p.id = lf.produit_id
    WHERE lf.facture_id = NEW.id
  LOOP
    SELECT quantite_stock INTO v_dispo
    FROM stock_entrepot
    WHERE produit_id = r.produit_id AND entrepot_id = NEW.entrepot_id
    FOR UPDATE;

    IF NOT FOUND OR v_dispo < r.quantite_demandee THEN
      RAISE EXCEPTION 'Stock insuffisant pour le produit "%" dans l''entrepôt sélectionné : disponible %, demandé %',
        r.nom, COALESCE(v_dispo, 0), r.quantite_demandee;
    END IF;
  END LOOP;

  -- 2) Décrément effectif, borné à NEW.entrepot_id (règle 16 : "ne décrémente
  --    que son stock à lui").
  UPDATE stock_entrepot se
  SET quantite_stock = se.quantite_stock - lf.quantite,
      updated_at = now()
  FROM lignes_facture lf
  WHERE lf.facture_id = NEW.id AND se.produit_id = lf.produit_id AND se.entrepot_id = NEW.entrepot_id;

  -- 3) Traçabilité : un mouvement de sortie par ligne de facture, rattaché à
  --    l'entrepôt source.
  INSERT INTO mouvements_stock (produit_id, entrepot_id, type, quantite, motif, reference_facture_id, utilisateur_id)
  SELECT lf.produit_id, NEW.entrepot_id, 'sortie', lf.quantite,
         'Validation facture ' || NEW.numero, NEW.id, auth.uid()
  FROM lignes_facture lf
  WHERE lf.facture_id = NEW.id;

  NEW.date_validation := now();

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION decrementer_stock_entrepot() IS 'Règle métier 4, adaptée à la règle 16 : décrémente stock_entrepot (produit, factures.entrepot_id) au lieu de produits.quantite_stock, avec blocage si insuffisant. Ignore le décrément si la facture est rattachée à un bon_livraison_id (décision documentée dans le corps de la fonction). Remplace decrementer_stock() (0001, détachée section 14).';

CREATE TRIGGER trg_decrementer_stock_entrepot
BEFORE UPDATE ON factures
FOR EACH ROW
WHEN (NEW.statut = 'validee' AND OLD.statut IS DISTINCT FROM 'validee')
EXECUTE FUNCTION decrementer_stock_entrepot();

-- --- 15.6 Règle métier 5 (adaptée règle 16) : restauration PAR ENTREPÔT -----
CREATE OR REPLACE FUNCTION restaurer_stock_annulation_entrepot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Symétrique de decrementer_stock_entrepot() (15.5) : si la facture était
  -- rattachée à un bon_livraison_id, elle n'avait rien décrémenté à sa
  -- validation -> rien à restaurer ici non plus. La restauration éventuelle
  -- du stock du BL lui-même se fait, si besoin, via la suppression de ses
  -- lignes par un admin (gerer_ligne_bon_livraison, section 15.7).
  IF OLD.statut = 'validee' AND OLD.bon_livraison_id IS NULL THEN
    UPDATE stock_entrepot se
    SET quantite_stock = se.quantite_stock + lf.quantite,
        updated_at = now()
    FROM lignes_facture lf
    WHERE lf.facture_id = NEW.id AND se.produit_id = lf.produit_id AND se.entrepot_id = OLD.entrepot_id;

    INSERT INTO mouvements_stock (produit_id, entrepot_id, type, quantite, motif, reference_facture_id, utilisateur_id)
    SELECT lf.produit_id, OLD.entrepot_id, 'entree', lf.quantite,
           'Annulation facture ' || NEW.numero, NEW.id, auth.uid()
    FROM lignes_facture lf
    WHERE lf.facture_id = NEW.id;
  END IF;

  -- Règle 9 (0001) : la journalisation de l'annulation elle-même reste
  -- inchangée, déjà garantie par le trigger DISTINCT
  -- trg_restaurer_stock_annulation... qui vient d'être détaché (section 14).
  -- On la réintroduit donc ici, à l'identique, pour ne pas perdre cette
  -- garantie de traçabilité.
  INSERT INTO journal_activites (utilisateur_id, action, table_cible, avant, apres)
  VALUES (auth.uid(), 'annulation_facture', 'factures', to_jsonb(OLD), to_jsonb(NEW));

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION restaurer_stock_annulation_entrepot() IS 'Règle métier 5, adaptée à la règle 16 : restaure stock_entrepot (produit, factures.entrepot_id, capturé via OLD car inchangé après validation) au lieu de produits.quantite_stock. Remplace restaurer_stock_annulation() (0001, détachée section 14) — reprend aussi sa journalisation (règle 9).';

CREATE TRIGGER trg_restaurer_stock_annulation_entrepot
BEFORE UPDATE ON factures
FOR EACH ROW
WHEN (NEW.statut = 'annulee' AND OLD.statut IS DISTINCT FROM 'annulee')
EXECUTE FUNCTION restaurer_stock_annulation_entrepot();

-- --- 15.7 Règle métier 15 : décrément à la saisie d'une ligne de BL ---------
CREATE OR REPLACE FUNCTION gerer_ligne_bon_livraison()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entrepot_id uuid;
  v_numero      text;
  v_dispo       numeric(12,2);
  v_nom         text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT entrepot_id, numero INTO v_entrepot_id, v_numero
    FROM bons_livraison WHERE id = OLD.bon_livraison_id;

    -- Restauration : la suppression d'une ligne de BL (réservée à l'admin,
    -- cf. RLS section 6) signifie que la marchandise n'est finalement pas
    -- partie -> on la restitue au stock de l'entrepôt source. Miroir, au
    -- niveau ligne, de restaurer_stock_annulation_entrepot() (15.6).
    UPDATE stock_entrepot
    SET quantite_stock = quantite_stock + OLD.quantite, updated_at = now()
    WHERE produit_id = OLD.produit_id AND entrepot_id = v_entrepot_id;

    INSERT INTO mouvements_stock (produit_id, entrepot_id, type, quantite, motif, reference_bon_livraison_id, utilisateur_id)
    VALUES (OLD.produit_id, v_entrepot_id, 'entree', OLD.quantite,
            'Suppression d''une ligne du bon de livraison ' || v_numero, OLD.bon_livraison_id, auth.uid());

    RETURN OLD;
  END IF;

  -- TG_OP = 'INSERT'
  SELECT entrepot_id, numero INTO v_entrepot_id, v_numero
  FROM bons_livraison WHERE id = NEW.bon_livraison_id;

  IF v_entrepot_id IS NULL THEN
    RAISE EXCEPTION 'Bon de livraison % introuvable', NEW.bon_livraison_id;
  END IF;

  -- Vérification de disponibilité + verrouillage, même logique que
  -- decrementer_stock_entrepot() (15.5) : un BL matérialise un fait physique,
  -- il ne peut donc jamais faire sortir plus que le stock réellement présent
  -- dans l'entrepôt de départ.
  SELECT se.quantite_stock, p.nom INTO v_dispo, v_nom
  FROM stock_entrepot se JOIN produits p ON p.id = se.produit_id
  WHERE se.produit_id = NEW.produit_id AND se.entrepot_id = v_entrepot_id
  FOR UPDATE OF se;

  IF v_dispo IS NULL OR v_dispo < NEW.quantite THEN
    RAISE EXCEPTION 'Stock insuffisant pour "%" dans l''entrepôt de départ du bon de livraison : disponible %, demandé %',
      COALESCE(v_nom, NEW.produit_id::text), COALESCE(v_dispo, 0), NEW.quantite;
  END IF;

  UPDATE stock_entrepot
  SET quantite_stock = quantite_stock - NEW.quantite, updated_at = now()
  WHERE produit_id = NEW.produit_id AND entrepot_id = v_entrepot_id;

  INSERT INTO mouvements_stock (produit_id, entrepot_id, type, quantite, motif, reference_bon_livraison_id, utilisateur_id)
  VALUES (NEW.produit_id, v_entrepot_id, 'sortie', NEW.quantite,
          'Bon de livraison ' || v_numero, NEW.bon_livraison_id, auth.uid());

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION gerer_ligne_bon_livraison() IS 'Règle métier 15/16 : décrémente le stock de l''entrepôt de départ du BL dès l''ajout d''une ligne (bloque si insuffisant), le restaure si une ligne est supprimée (admin uniquement, cf. RLS section 6). Il n''existe pas d''étape de validation séparée pour un BL (contrairement aux factures) : le décrément est immédiat.';

CREATE TRIGGER trg_gerer_ligne_bon_livraison
BEFORE INSERT OR DELETE ON lignes_bon_livraison
FOR EACH ROW EXECUTE FUNCTION gerer_ligne_bon_livraison();

-- --- 15.8 Règle métier 16 : cycle de vie d'un transfert inter-entrepôts ------
CREATE OR REPLACE FUNCTION traiter_transfert_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dispo numeric(12,2);
  v_nom   text;
BEGIN
  IF OLD.statut = 'receptionne' THEN
    -- DÉCISION DE CONCEPTION EXPLICITEMENT SIGNALÉE COMME OUVERTE PAR LE
    -- BRIEF ("comportement si un transfert est annulé après avoir été en
    -- transit") : un transfert 'receptionne' est un état TERMINAL. Le stock
    -- destination a déjà été incrémenté et peut, entre-temps, avoir été
    -- consommé par une facture/un BL/un autre transfert sortant de ce même
    -- entrepôt -> "annuler" un transfert déjà réceptionné en décrémentant
    -- rétroactivement la destination pourrait faire passer son stock sous 0.
    -- Pour corriger un transfert réceptionné par erreur, il faut créer un
    -- NOUVEAU transfert en sens inverse (destination -> source), qui repasse
    -- par le même contrôle de disponibilité que n'importe quel autre
    -- transfert. À valider avec le métier (cf. rapport de livraison).
    RAISE EXCEPTION 'Un transfert déjà réceptionné est définitif : créez un nouveau transfert en sens inverse pour le corriger';
  END IF;

  IF OLD.statut = 'annule' THEN
    RAISE EXCEPTION 'Un transfert annulé ne peut plus changer de statut';
  END IF;

  IF OLD.statut = 'demande' AND NEW.statut = 'en_transit' THEN
    -- DÉCISION DE CONCEPTION (non tranchée par le brief) : le départ
    -- physique (donc le décrément du stock source) est modélisé comme
    -- survenant au passage 'demande' -> 'en_transit', pas à la création de
    -- la demande elle-même (une simple demande n'a aucun effet physique) ni
    -- seulement à la réception (qui ne concerne que la destination). C'est
    -- l'analogue, pour un transfert, de ce que gerer_ligne_bon_livraison()
    -- fait pour un BL.
    SELECT se.quantite_stock, p.nom INTO v_dispo, v_nom
    FROM stock_entrepot se JOIN produits p ON p.id = se.produit_id
    WHERE se.produit_id = NEW.produit_id AND se.entrepot_id = NEW.entrepot_source_id
    FOR UPDATE OF se;

    IF v_dispo IS NULL OR v_dispo < NEW.quantite THEN
      RAISE EXCEPTION 'Stock insuffisant pour transférer "%" depuis l''entrepôt source : disponible %, demandé %',
        COALESCE(v_nom, NEW.produit_id::text), COALESCE(v_dispo, 0), NEW.quantite;
    END IF;

    UPDATE stock_entrepot
    SET quantite_stock = quantite_stock - NEW.quantite, updated_at = now()
    WHERE produit_id = NEW.produit_id AND entrepot_id = NEW.entrepot_source_id;

    INSERT INTO mouvements_stock (produit_id, entrepot_id, type, quantite, motif, reference_transfert_id, utilisateur_id)
    VALUES (NEW.produit_id, NEW.entrepot_source_id, 'sortie', NEW.quantite,
            'Départ transfert vers un autre entrepôt', NEW.id, auth.uid());

    NEW.date_transit := now();

  ELSIF OLD.statut = 'en_transit' AND NEW.statut = 'receptionne' THEN
    -- Réception : incrémente le stock destination. Upsert défensif
    -- (INSERT ... ON CONFLICT) car il est possible qu'aucune ligne
    -- stock_entrepot n'existe encore pour ce couple (produit, entrepôt
    -- destination) — ex. premier transfert de ce produit vers un entrepôt
    -- qui n'en avait jamais reçu.
    INSERT INTO stock_entrepot (produit_id, entrepot_id, quantite_stock)
    VALUES (NEW.produit_id, NEW.entrepot_destination_id, NEW.quantite)
    ON CONFLICT (produit_id, entrepot_id)
      DO UPDATE SET quantite_stock = stock_entrepot.quantite_stock + NEW.quantite, updated_at = now();

    INSERT INTO mouvements_stock (produit_id, entrepot_id, type, quantite, motif, reference_transfert_id, utilisateur_id)
    VALUES (NEW.produit_id, NEW.entrepot_destination_id, 'entree', NEW.quantite,
            'Réception transfert depuis un autre entrepôt', NEW.id, auth.uid());

    NEW.date_reception := now();
    NEW.receptionne_par_id := auth.uid();

    -- Règle 9 : réception d'un transfert = action sensible impactant le
    -- stock, journalisée (même esprit que ajustement_stock_manuel).
    INSERT INTO journal_activites (utilisateur_id, action, table_cible, avant, apres)
    VALUES (auth.uid(), 'transfert_stock_receptionne', 'transferts_stock', to_jsonb(OLD), to_jsonb(NEW));

  ELSIF NEW.statut = 'annule' THEN
    IF OLD.statut = 'en_transit' THEN
      -- Le stock source avait déjà été décrémenté au passage en_transit : on
      -- le restitue (la marchandise n'a finalement pas quitté l'entrepôt, ou
      -- y est revenue). Décision de conception documentée en tête de
      -- fichier (règle 16) : autorisée UNIQUEMENT depuis 'en_transit', pas
      -- depuis 'receptionne' (bloqué plus haut).
      UPDATE stock_entrepot
      SET quantite_stock = quantite_stock + NEW.quantite, updated_at = now()
      WHERE produit_id = NEW.produit_id AND entrepot_id = NEW.entrepot_source_id;

      INSERT INTO mouvements_stock (produit_id, entrepot_id, type, quantite, motif, reference_transfert_id, utilisateur_id)
      VALUES (NEW.produit_id, NEW.entrepot_source_id, 'entree', NEW.quantite,
              'Annulation du transfert (retour au stock source)', NEW.id, auth.uid());
    END IF;
    -- Si OLD.statut = 'demande' : aucun mouvement de stock n'a encore eu
    -- lieu (le décrément ne survient qu'au passage en_transit ci-dessus),
    -- rien à restituer.

    INSERT INTO journal_activites (utilisateur_id, action, table_cible, avant, apres)
    VALUES (auth.uid(), 'transfert_stock_annule', 'transferts_stock', to_jsonb(OLD), to_jsonb(NEW));

  ELSE
    RAISE EXCEPTION 'Transition de statut non autorisée pour un transfert de stock : % -> %', OLD.statut, NEW.statut;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION traiter_transfert_stock() IS 'Règle métier 16 : applique les mouvements de stock associés à chaque transition de statut d''un transfert (demande->en_transit : décrément source ; en_transit->receptionne : incrément destination ; annulation depuis demande/en_transit). receptionne est terminal (décision documentée dans le corps de la fonction) — réservé à l''admin par RLS (aucune policy UPDATE agent, section 4).';

CREATE TRIGGER trg_traiter_transfert_stock
BEFORE UPDATE OF statut ON transferts_stock
FOR EACH ROW
WHEN (NEW.statut IS DISTINCT FROM OLD.statut)
EXECUTE FUNCTION traiter_transfert_stock();


-- =============================================================================
-- SECTION 16 — GRANTS (table-level ; le filtrage fin reste assuré par RLS,
-- même principe que 0001 section 17 / 0005 / 0011)
-- =============================================================================

-- --- 16.1 `authenticated` (agent + admin, filtré par RLS) --------------------
-- stock_entrepot est délibérément ABSENTE de ce GRANT large : SEUL SELECT lui
-- est accordé plus bas (16.2), aucune écriture directe n'est jamais ouverte
-- (cf. section 3) — toute écriture passe par ajuster_stock_manuel_entrepot()/
-- definir_seuil_alerte_entrepot() (SECURITY DEFINER, section 15), qui
-- s'exécutent avec les droits du propriétaire (postgres) indépendamment de ce
-- GRANT, exactement comme les triggers de decrement/restauration de stock
-- depuis 0001.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  entrepots,
  transferts_stock,
  credits,
  remboursements_credit,
  bons_livraison,
  lignes_bon_livraison
TO authenticated;

GRANT SELECT ON stock_entrepot TO authenticated;
GRANT SELECT ON bl_sequences TO authenticated;

-- --- 16.2 `service_role` -----------------------------------------------------
-- Anticipe deux Edge Functions du plan en 7 phases (brief, Phase D) :
--   - generer-bon-livraison-pdf (future) : lira bons_livraison (+ jointures
--     client/agent/entrepot déjà couvertes par les GRANT existants sur
--     clients/utilisateurs, 0005/0011) et lignes_bon_livraison (+ produits,
--     déjà accordé en 0005), ainsi qu'entrepots pour l'adresse affichée sur
--     le PDF.
--   - alerte-stock-bas (existante, à adapter Phase D pour lire stock_entrepot
--     au lieu de produits.quantite_stock/seuil_alerte) : lira stock_entrepot
--     et entrepots pour construire un message par entrepôt.
-- Choix SELECT uniquement, même raisonnement que 0005/0011 : service_role
-- bypass RLS, donc aucun GRANT d'écriture n'est accordé ici (les seules
-- écritures sur ces tables restent les fonctions SECURITY DEFINER de ce
-- fichier + les Server Actions `authenticated`, filtrées par RLS).
GRANT SELECT ON entrepots, stock_entrepot, bons_livraison, lignes_bon_livraison TO service_role;

-- Aucun droit accordé au rôle anon (règle 8 : authentification obligatoire),
-- cohérent avec 0001 section 17.


-- =============================================================================
-- SECTION 17 — CHECKLIST DE VÉRIFICATION MANUELLE
-- =============================================================================
--
-- [ ] BACKFILL (règle 16) — `SELECT nom, adresse FROM entrepots WHERE nom =
--     'Siège';` doit renvoyer 1 ligne. `SELECT COUNT(*) FROM stock_entrepot
--     WHERE entrepot_id = (SELECT id FROM entrepots WHERE nom='Siège');`
--     doit être égal au nombre de lignes de `produits`. `SELECT COUNT(*)
--     FROM factures WHERE entrepot_id IS NULL;` doit renvoyer 0 (contrainte
--     NOT NULL déjà appliquée, cette requête est un test de non-régression).
--
-- [ ] DÉPRÉCIATION (décision documentée) — `SELECT
--     ajuster_stock_manuel('<id existant>', 5, 'test');` doit lever
--     l'exception de dépréciation, quel que soit le rôle appelant (y compris
--     admin). `UPDATE produits SET seuil_alerte = 1 WHERE id = '<id>';`
--     connecté en tant qu'admin doit échouer avec "permission denied for
--     column seuil_alerte" (colonne désormais verrouillée, comme
--     quantite_stock l'était déjà depuis 0010).
--
-- [ ] STOCK PAR ENTREPÔT (règle 4/16) — Sur un produit avec
--     stock_entrepot.quantite_stock=50 au Siège, créer une facture avec
--     entrepot_id=Siège et une ligne quantite=3, la passer à 'validee' :
--     vérifier stock_entrepot.quantite_stock=47 au Siège UNIQUEMENT (un
--     éventuel stock du même produit dans un autre entrepôt reste
--     inchangé), et qu'un mouvements_stock (type='sortie', entrepot_id=Siège)
--     a été créé. Annuler la même facture : vérifier la restauration à 50 et
--     un mouvements_stock type='entree'.
--
-- [ ] STOCK INSUFFISANT PAR ENTREPÔT (règle 4/16) — Créer un second entrepôt
--     "Dakar" (vide, aucune ligne stock_entrepot pour ce produit). Créer une
--     facture avec entrepot_id=Dakar et une ligne sur un produit qui a du
--     stock au Siège mais pas à Dakar : la validation doit échouer avec
--     "Stock insuffisant..." malgré la disponibilité au Siège (le décrément
--     ne regarde JAMAIS un autre entrepôt que celui de la facture).
--
-- [ ] BON DE LIVRAISON (règle 15) — Insérer un bon_livraison SANS facture_id
--     (client_id + entrepot_id renseignés) : vérifier que `numero` est bien
--     BLAAAAMMJJ001 (ou le numéro suivant si un autre BL existe déjà ce
--     jour-là). Ajouter une ligne (produit avec stock suffisant dans cet
--     entrepôt) : vérifier le décrément immédiat de stock_entrepot ET la
--     création d'un mouvements_stock (type='sortie',
--     reference_bon_livraison_id renseigné). Supprimer cette ligne en tant
--     qu'admin : vérifier la restauration du stock.
--
-- [ ] FACTURE LIÉE À UN BL (décision de conception, non double-décompte) —
--     Créer un BL avec une ligne (décrémente le stock). Créer ensuite une
--     facture avec bon_livraison_id pointant vers ce BL et une ligne
--     équivalente, la passer à 'validee' : vérifier que stock_entrepot N'EST
--     PAS décrémenté une seconde fois (seul le décrément du BL doit être
--     visible). Annuler cette même facture : vérifier qu'aucune restauration
--     n'a lieu non plus (rien n'avait été décrémenté par elle).
--
-- [ ] TRANSFERT (règle 16) — Créer un transfert 'demande' (produit avec
--     stock suffisant au Siège) Siège -> Dakar. Le faire passer à
--     'en_transit' : vérifier le décrément au Siège + mouvements_stock
--     (sortie, reference_transfert_id renseigné). Le faire passer à
--     'receptionne' : vérifier l'incrément à Dakar (création de la ligne
--     stock_entrepot si elle n'existait pas) + mouvements_stock (entree) +
--     une ligne journal_activites (action='transfert_stock_receptionne').
--     Tenter ensuite un UPDATE de statut sur ce même transfert (ex. retour à
--     'en_transit') : doit échouer ("transfert déjà réceptionné est
--     définitif").
--
-- [ ] TRANSFERT ANNULÉ EN TRANSIT (décision de conception) — Créer un second
--     transfert, le faire passer à 'en_transit' (décrément source), puis à
--     'annule' : vérifier que le stock source est restitué et qu'une ligne
--     journal_activites (action='transfert_stock_annule') existe.
--
-- [ ] CRÉDIT — SEUIL GLOBAL (règle 12) — Avec seuil_credit_max=0 (valeur par
--     défaut) : toute tentative `INSERT INTO credits (client_id,
--     montant_total) VALUES (...)` doit échouer ("Seuil de crédit global
--     dépassé"). Configurer `UPDATE entreprise_config SET seuil_credit_max =
--     100000;`, retenter avec montant_total=50000 : doit réussir. Retenter
--     un second crédit pour un AUTRE client avec montant_total=60000 (total
--     cumulé 110000 > 100000) : doit échouer.
--
-- [ ] CRÉDIT — UN SEUL EN COURS PAR CLIENT (règle 13, LA garantie DB-level) —
--     Avec un crédit 'en_cours' déjà ouvert pour le client A, tenter d'en
--     ouvrir un second pour A : doit échouer avec le message applicatif
--     clair (trigger). Vérifier ENSUITE que l'index lui-même protège même en
--     cas de contournement du trigger, ex. en désactivant temporairement le
--     trigger dans une session de test
--     (`ALTER TABLE credits DISABLE TRIGGER trg_bloquer_nouveau_credit;`,
--     PUIS réessayer l'INSERT : doit échouer avec "duplicate key value
--     violates unique constraint credits_un_seul_en_cours_par_client" —
--     RÉACTIVER le trigger ensuite avec ENABLE TRIGGER, ne jamais laisser
--     cette désactivation en place).
--
-- [ ] CRÉDIT — REMBOURSEMENT ET SOLDE AUTOMATIQUE (règle 14) — Sur un crédit
--     montant_total=50000 : insérer un remboursement de 20000 (statut reste
--     'en_cours', montant_rembourse=20000). Insérer un second remboursement
--     de 30000 : vérifier statut='solde', date_solde renseignée. Vérifier
--     qu'un NOUVEAU crédit peut immédiatement être ouvert pour ce même
--     client (débloqué par l'index partiel).
--
-- [ ] RLS AGENT — Connecté en tant qu'agent : `UPDATE stock_entrepot SET
--     quantite_stock = 999 WHERE id = '<id>';` doit échouer (0 ligne
--     affectée, aucun GRANT UPDATE table-level). `INSERT INTO
--     transferts_stock (..., statut) VALUES (..., 'en_transit')` (en
--     tentant de sauter l'étape 'demande') doit échouer (WITH CHECK exige
--     statut='demande'). `UPDATE transferts_stock SET statut='receptionne'
--     WHERE id='<id>';` doit échouer (aucune policy UPDATE agent). `SELECT
--     ajuster_stock_manuel_entrepot('<id>', '<entrepot_id>', 5, 'test');`
--     doit lever "Réservé aux administrateurs".
--
-- [ ] GRANTS service_role — `SELECT grantee, table_name, privilege_type FROM
--     information_schema.role_table_grants WHERE grantee = 'service_role'
--     AND table_name IN ('entrepots','stock_entrepot','bons_livraison',
--     'lignes_bon_livraison') ORDER BY table_name;` doit renvoyer
--     exactement SELECT pour chacune des 4 tables (aucun INSERT/UPDATE/
--     DELETE).
--
-- =============================================================================
-- FIN DE LA MIGRATION 0013 — AVENANT CRÉDIT / BON DE LIVRAISON /
-- MULTI-ENTREPÔTS
--
-- Prêt à être repris par les autres agents (Phase B design system, Phase C
-- frontend admin/agent, Phase D Edge Functions — notamment l'adaptation
-- d'alerte-stock-bas pour lire stock_entrepot et la création de
-- generer-bon-livraison-pdf, Phase E audit sécurité). Voir le rapport de
-- livraison pour la liste des décisions de conception non explicitement
-- spécifiées par le brief et à faire valider par le métier.
-- =============================================================================
