-- =============================================================================
-- GFB-STOCK — Schéma initial Supabase/PostgreSQL
-- Fichier : supabase/migrations/0001_schema_initial.sql
-- Auteur  : architecte-bdd (agent)
-- Objet   : tables, enums, contraintes, triggers métier et policies RLS
--           garantissant TOUTES les règles métier au niveau base de données
--           (un contournement du frontend ne doit jamais pouvoir les violer).
--
-- Numérotation des règles métier utilisée dans les commentaires ci-dessous
-- (reprise du prompt de référence GFB-STOCK-PROMPT-2026-V1) :
--   1. Numérotation facture FP+AAAAMMJJ+SEQ(3) unique, sans collision concurrente
--   2. Calcul des totaux (total_ht, total_general, tva_taux=0 par défaut)
--   3. Produits inclus dans un kit (prix_unitaire nullable, kit_parent_id)
--   4. Décrément de stock automatique à la validation + blocage si insuffisant
--   5. Restauration de stock automatique si facture validée -> annulée
--   6. Alertes de stock bas automatiques (quantite_stock <= seuil_alerte)
--   7. Statut de paiement automatique (payee_partielle / payee)
--   8. Sécurité RLS stricte, admin total / agent restreint, auth.uid() only
--   9. Journalisation des actions sensibles (journal_activites)
--
-- Note d'organisation : les CREATE TABLE et leurs policies RLS se suivent
-- immédiatement, table par table (consigne de méthode). Les triggers qui ne
-- dépendent que des tables déjà créées à ce stade sont posés juste après la
-- table concernée ; les triggers "transverses" qui doivent lire plusieurs
-- tables pas encore toutes créées à ce point (decrementer_stock,
-- restaurer_stock_annulation, gerer_ajustement_stock_manuel) sont regroupés
-- dans la section 11 "TRIGGERS MÉTIER TRANSVERSES", une fois que toutes les
-- tables dont ils dépendent existent. Chaque trigger reste néanmoins
-- entièrement commenté et référencé à la règle métier qu'il applique.
--
-- Écarts / ajouts documentés par rapport à la liste de référence :
--   - Table technique `facture_sequences` : nécessaire pour garantir la
--     règle 1 (numérotation atomique sans collision concurrente).
--   - Fonctions `is_admin()` / `is_agent_actif()` : nécessaires pour écrire
--     des policies RLS non récursives et lisibles (règle 8).
--   - Colonne `clients.created_by`, `factures.date_validation` : traçabilité.
--   - Trigger `gerer_ligne_facture()` : verrou d'intégrité empêchant la
--     modification des lignes d'une facture déjà validée/payée/annulée
--     (protège les règles 4/5 contre toute incohérence de stock, y compris
--     pour un compte admin — voir commentaire détaillé section 8).
--   - Trigger `gerer_ajustement_stock_manuel()` + colonne `type='ajustement'`
--     sur mouvements_stock : automatise la traçabilité de la règle 9 pour
--     tout ajustement de stock fait hors flux facture.
--   - `appliquer_paiement()` est étendu à UPDATE/DELETE sur paiements (en
--     plus de l'INSERT demandé) afin que le statut de paiement reste
--     toujours cohérent si un admin corrige/supprime un paiement erroné.
-- =============================================================================


-- =============================================================================
-- SECTION 0 — EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
-- pg_cron est activé en fin de fichier (section 15), certains projets Supabase
-- exigent une activation préalable manuelle depuis Dashboard > Database > Extensions.


-- =============================================================================
-- SECTION 1 — TYPES ÉNUMÉRÉS
-- =============================================================================

CREATE TYPE role_utilisateur AS ENUM ('admin', 'agent');

CREATE TYPE statut_facture AS ENUM (
  'brouillon', 'proforma', 'validee', 'payee_partielle', 'payee', 'annulee'
);

CREATE TYPE type_mouvement_stock AS ENUM ('entree', 'sortie', 'ajustement');

CREATE TYPE mode_paiement AS ENUM ('especes', 'virement', 'mobile_money', 'cheque');

CREATE TYPE type_client AS ENUM ('particulier', 'entreprise', 'cooperative');

CREATE TYPE unite_produit AS ENUM ('piece', 'kit', 'metre', 'rouleau', 'forfait');

CREATE TYPE type_ligne_produit AS ENUM ('vendu_separement', 'inclus_dans_kit');


-- =============================================================================
-- SECTION 2 — TABLE entreprise_config + RLS
-- Table "singleton" (une seule ligne, id booléen forcé à true) contenant les
-- informations légales/bancaires affichées sur chaque facture PDF.
-- =============================================================================

CREATE TABLE entreprise_config (
  id                      boolean PRIMARY KEY DEFAULT true,
  nom                     text NOT NULL,
  activites               text[] NOT NULL DEFAULT '{}',
  adresses                text[] NOT NULL DEFAULT '{}',   -- multi-sites (Mboro, Darou Salam, Thiès, Dakar, Keur Massar...)
  telephones              text[] NOT NULL DEFAULT '{}',
  email                   text,
  ninea                   text,
  rc                      text,
  banque_nom              text,
  banque_code             text,
  banque_agence           text,
  banque_numero_compte    text,
  banque_cle_rib          text,
  iban                    text,
  swift                   text,
  logo_url                text,
  modalites_reglement     text NOT NULL DEFAULT 'Règlement 100% à la commande.',
  delai_disponibilite     text,
  validite_proforma_jours integer NOT NULL DEFAULT 15 CHECK (validite_proforma_jours > 0),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entreprise_config_singleton CHECK (id)
);

COMMENT ON TABLE entreprise_config IS 'Ligne unique (singleton) : identité légale/bancaire de GIE FASSO BARA pour l''en-tête et le pied de page des factures PDF.';

ALTER TABLE entreprise_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE entreprise_config FORCE ROW LEVEL SECURITY;

-- Fonction générique de mise à jour de updated_at (utilisée par plusieurs tables).
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_entreprise_config_updated_at
BEFORE UPDATE ON entreprise_config
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS entreprise_config : tout utilisateur authentifié (admin ou agent) doit
-- pouvoir LIRE ces informations pour générer une facture PDF ; seule l'écriture
-- est réservée à l'admin (règle 8 : admin = accès total, agent = lecture seule
-- ici car il ne s'agit pas de produits/clients mais des données légales).
CREATE POLICY entreprise_config_lecture_authenticated
  ON entreprise_config FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- La policy d'écriture (réservée à l'admin) est créée en section 3, juste
-- après la définition de la fonction is_admin() dont elle dépend.


-- =============================================================================
-- SECTION 3 — TABLE utilisateurs + fonctions is_admin()/is_agent_actif() + RLS
-- =============================================================================

CREATE TABLE utilisateurs (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nom        text NOT NULL,
  role       role_utilisateur NOT NULL DEFAULT 'agent',
  actif      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE utilisateurs IS 'Profil métier (rôle, statut actif) lié 1-1 à auth.users. Toute vérification d''identité côté RLS passe par auth.uid(), jamais par une valeur envoyée par le client (règle 8).';

ALTER TABLE utilisateurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE utilisateurs FORCE ROW LEVEL SECURITY;

CREATE TRIGGER trg_utilisateurs_updated_at
BEFORE UPDATE ON utilisateurs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- Fonctions utilitaires SECURITY DEFINER --------------------------------
-- SECURITY DEFINER est indispensable ici : ces fonctions sont appelées DEPUIS
-- des policies RLS de la table utilisateurs elle-même. Sans SECURITY DEFINER,
-- la requête interne serait elle-même filtrée par RLS -> risque de récursion/
-- de blocage. En s'exécutant avec les droits du propriétaire (postgres), la
-- fonction lit la table sans repasser par RLS, ce qui est sûr car elle ne
-- fait QUE renvoyer un booléen dérivé de auth.uid(), jamais une valeur
-- envoyée par le client (règle 8).
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM utilisateurs
    WHERE id = auth.uid() AND role = 'admin' AND actif = true
  );
$$;

CREATE OR REPLACE FUNCTION is_agent_actif()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM utilisateurs
    WHERE id = auth.uid() AND role = 'agent' AND actif = true
  );
$$;

COMMENT ON FUNCTION is_admin() IS 'Vrai si auth.uid() correspond à un utilisateur actif de rôle admin. Utilisé par toutes les policies RLS (règle 8).';
COMMENT ON FUNCTION is_agent_actif() IS 'Vrai si auth.uid() correspond à un utilisateur actif de rôle agent. Utilisé par toutes les policies RLS (règle 8).';

-- Policy d'écriture entreprise_config (annoncée section 2), créée ici car
-- elle dépend de is_admin() qui vient d'être définie.
CREATE POLICY entreprise_config_ecriture_admin
  ON entreprise_config FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- --- Policies utilisateurs ---------------------------------------------------
-- Admin : accès total (règle 8).
CREATE POLICY utilisateurs_admin_all
  ON utilisateurs FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Un utilisateur (agent) peut lire sa propre fiche (pour connaître son rôle
-- et son statut actif côté frontend) mais aucune autre.
CREATE POLICY utilisateurs_self_select
  ON utilisateurs FOR SELECT
  USING (id = auth.uid());

-- Un utilisateur peut mettre à jour sa propre fiche (ex: changer son nom
-- affiché) mais JAMAIS son propre rôle ou son statut actif : ceci est
-- garanti par le trigger empecher_auto_promotion() ci-dessous, car une
-- policy RLS seule ne peut pas restreindre l'accès à certaines colonnes.
CREATE POLICY utilisateurs_self_update
  ON utilisateurs FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION empecher_auto_promotion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Complète la règle 8 (WITH CHECK sur tout INSERT/UPDATE) : RLS ne
  -- restreint pas au niveau colonne, ce trigger empêche donc explicitement
  -- toute auto-élévation de privilège par un agent qui modifierait sa
  -- propre ligne utilisateurs.
  IF NOT is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role OR NEW.actif IS DISTINCT FROM OLD.actif THEN
      RAISE EXCEPTION 'Seul un administrateur peut modifier le rôle ou le statut actif d''un utilisateur';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_empecher_auto_promotion
BEFORE UPDATE ON utilisateurs
FOR EACH ROW EXECUTE FUNCTION empecher_auto_promotion();

-- --- Provisionnement automatique du profil à la création d'un compte Auth --
CREATE OR REPLACE FUNCTION gerer_nouvel_utilisateur()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Rôle minimal par défaut ('agent') : toute élévation vers 'admin' doit
  -- être effectuée explicitement par un administrateur déjà existant, jamais
  -- automatiquement (règle 8 - voir aussi checklist de bootstrap en fin de
  -- fichier seed.sql).
  INSERT INTO utilisateurs (id, nom, role, actif)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nom', split_part(NEW.email, '@', 1)),
    'agent',
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION gerer_nouvel_utilisateur();


-- =============================================================================
-- SECTION 4 — TABLE categories_produits + RLS
-- =============================================================================

CREATE TABLE categories_produits (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom        text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE categories_produits ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories_produits FORCE ROW LEVEL SECURITY;

CREATE POLICY categories_produits_admin_all
  ON categories_produits FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Lecture : admin + agent (règle 8 : agent a lecture sur produits, dont les
-- catégories font partie).
CREATE POLICY categories_produits_lecture_agent
  ON categories_produits FOR SELECT
  USING (is_agent_actif());


-- =============================================================================
-- SECTION 5 — TABLE produits + RLS + trigger cohérence kit
-- =============================================================================

CREATE TABLE produits (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                text NOT NULL UNIQUE,
  nom                 text NOT NULL,
  description         text,
  categorie_id        uuid REFERENCES categories_produits(id) ON DELETE SET NULL,
  unite               unite_produit NOT NULL DEFAULT 'piece',
  prix_unitaire       numeric(12,2),                       -- nullable : règle 3
  type_ligne_produit  type_ligne_produit NOT NULL DEFAULT 'vendu_separement',
  kit_parent_id       uuid REFERENCES produits(id) ON DELETE RESTRICT,  -- règle 3
  quantite_stock      numeric(12,2) NOT NULL DEFAULT 0,
  seuil_alerte        numeric(12,2) NOT NULL DEFAULT 0,
  photos_urls         text[] NOT NULL DEFAULT '{}',
  actif               boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT produits_prix_unitaire_positif CHECK (prix_unitaire IS NULL OR prix_unitaire >= 0),
  CONSTRAINT produits_quantite_stock_positive CHECK (quantite_stock >= 0),
  CONSTRAINT produits_seuil_alerte_positif CHECK (seuil_alerte >= 0),
  CONSTRAINT produits_kit_pas_son_propre_parent CHECK (kit_parent_id IS NULL OR kit_parent_id <> id),
  -- règle 3 : un produit inclus_dans_kit doit obligatoirement référencer un kit_parent_id
  CONSTRAINT produits_inclus_dans_kit_a_un_parent CHECK (
    type_ligne_produit <> 'inclus_dans_kit' OR kit_parent_id IS NOT NULL
  ),
  -- règle 3 : un produit vendu_separement ne doit jamais avoir de kit_parent_id
  CONSTRAINT produits_vendu_separement_sans_parent CHECK (
    type_ligne_produit <> 'vendu_separement' OR kit_parent_id IS NULL
  )
);

COMMENT ON TABLE produits IS 'Catalogue produit. Un produit inclus_dans_kit (ex: vanne, end clip, crochet) a prix_unitaire NULL/0 et référence son kit_parent_id (règle 3).';
COMMENT ON COLUMN produits.prix_unitaire IS 'Nullable : produits inclus_dans_kit n''ont pas de prix propre, ils apparaissent à 0 FCFA sur la facture (règle 3).';

CREATE INDEX idx_produits_categorie_id ON produits(categorie_id);
CREATE INDEX idx_produits_kit_parent_id ON produits(kit_parent_id);

ALTER TABLE produits ENABLE ROW LEVEL SECURITY;
ALTER TABLE produits FORCE ROW LEVEL SECURITY;

CREATE TRIGGER trg_produits_updated_at
BEFORE UPDATE ON produits
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Admin : accès total, y compris écriture directe sur le stock (règle 8).
CREATE POLICY produits_admin_all
  ON produits FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Agent : LECTURE SEULE sur les produits actifs — aucun accès en écriture
-- directe au stock (règle 8 : "agent ... aucun accès en écriture directe au
-- stock"). Le stock n'est modifié pour un agent qu'indirectement, via les
-- triggers SECURITY DEFINER decrementer_stock()/restaurer_stock_annulation()
-- déclenchés par le changement de statut d'une facture.
CREATE POLICY produits_lecture_agent
  ON produits FOR SELECT
  USING (is_agent_actif() AND actif = true);

-- --- Cohérence de la hiérarchie kit (1 seul niveau, parent = vendu_separement)
CREATE OR REPLACE FUNCTION verifier_coherence_kit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Règle métier 3 : un kit_parent_id doit pointer vers un produit qui est
  -- lui-même vendu_separement et qui n'est pas déjà inclus dans un autre kit
  -- (un seul niveau d'imbrication autorisé, ex: HYB1-3 est le parent de
  -- SV1/S-307/S-316, mais ne peut pas avoir lui-même de parent).
  IF NEW.kit_parent_id IS NOT NULL THEN
    PERFORM 1 FROM produits
      WHERE id = NEW.kit_parent_id AND type_ligne_produit = 'vendu_separement';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Le produit parent (kit_parent_id) doit être un produit vendu_separement existant';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_verifier_coherence_kit
BEFORE INSERT OR UPDATE OF kit_parent_id, type_ligne_produit ON produits
FOR EACH ROW EXECUTE FUNCTION verifier_coherence_kit();


-- =============================================================================
-- SECTION 6 — TABLE clients + RLS
-- =============================================================================

CREATE TABLE clients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         text NOT NULL,
  type_client type_client NOT NULL DEFAULT 'particulier',
  adresse     text,
  telephone   text,
  email       text,
  ninea       text,
  created_by  uuid REFERENCES utilisateurs(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_created_by ON clients(created_by);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;

CREATE TRIGGER trg_clients_updated_at
BEFORE UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- created_by est toujours forcé à auth.uid() côté serveur, jamais une valeur
-- envoyée par le client (règle 8).
CREATE OR REPLACE FUNCTION forcer_createur_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.created_by := auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_forcer_createur_client
BEFORE INSERT ON clients
FOR EACH ROW EXECUTE FUNCTION forcer_createur_client();

CREATE POLICY clients_admin_all
  ON clients FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Agent : lecture de tous les clients (règle 8 : "lecture sur produits/clients").
CREATE POLICY clients_lecture_agent
  ON clients FOR SELECT
  USING (is_agent_actif());

-- Agent : création de clients autorisée (règle 8 : "création de
-- factures/lignes_facture/clients"). Pas de policy UPDATE/DELETE pour
-- l'agent -> modification/suppression refusées par défaut pour ce rôle.
CREATE POLICY clients_creation_agent
  ON clients FOR INSERT
  WITH CHECK (is_agent_actif());


-- =============================================================================
-- SECTION 7 — TABLE TECHNIQUE facture_sequences (support de la règle 1)
-- Compteur atomique par jour, jamais exposé directement au client. Le verrou
-- de ligne obtenu par INSERT ... ON CONFLICT DO UPDATE garantit qu'aucune
-- collision n'est possible même si deux agents valident une facture au même
-- instant (la seconde transaction attend le verrou de la première).
-- =============================================================================

CREATE TABLE facture_sequences (
  jour            date PRIMARY KEY,
  dernier_numero  integer NOT NULL DEFAULT 0
);

ALTER TABLE facture_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE facture_sequences FORCE ROW LEVEL SECURITY;

-- Aucun accès direct pour agent/admin via l'API : uniquement consultable par
-- l'admin à titre de diagnostic ; les écritures ne passent QUE par la
-- fonction SECURITY DEFINER generer_numero_facture() (section 8).
CREATE POLICY facture_sequences_lecture_admin
  ON facture_sequences FOR SELECT
  USING (is_admin());


-- =============================================================================
-- SECTION 8 — TABLE factures + RLS + trigger generer_numero_facture()
-- =============================================================================

CREATE TABLE factures (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero            text UNIQUE NOT NULL DEFAULT '',   -- toujours réécrit par le trigger avant insertion
  client_id         uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  agent_id          uuid NOT NULL REFERENCES utilisateurs(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  statut            statut_facture NOT NULL DEFAULT 'brouillon',
  total_ht          numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_ht >= 0),
  forfait_transport numeric(14,2) NOT NULL DEFAULT 0 CHECK (forfait_transport >= 0),
  tva_taux          numeric(5,4) NOT NULL DEFAULT 0 CHECK (tva_taux >= 0 AND tva_taux <= 1),  -- règle 2 : 0 par défaut
  -- règle 2 : total_general = total_ht + forfait_transport + (total_ht * tva_taux)
  -- Colonne générée : impossible à falsifier par le client (aucun INSERT/UPDATE
  -- direct n'est accepté par Postgres sur une colonne GENERATED ALWAYS), et
  -- toujours recalculée automatiquement dès que total_ht, forfait_transport ou
  -- tva_taux changent, quelle qu'en soit l'origine (ligne ajoutée ou admin qui
  -- édite le forfait transport).
  total_general     numeric(14,2) GENERATED ALWAYS AS (total_ht + forfait_transport + (total_ht * tva_taux)) STORED,
  date_facture      date NOT NULL DEFAULT current_date,
  date_validation   timestamptz,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN factures.numero IS 'Format FP+AAAAMMJJ+SEQ(3), ex FP20260611001. Toujours régénéré côté serveur par generer_numero_facture(), toute valeur envoyée par le client est ignorée (règle 1).';
COMMENT ON COLUMN factures.total_general IS 'Colonne générée : total_ht + forfait_transport + (total_ht * tva_taux). tva_taux=0 par défaut (règle 2).';

CREATE INDEX idx_factures_client_id ON factures(client_id);
CREATE INDEX idx_factures_agent_id ON factures(agent_id);
CREATE INDEX idx_factures_statut ON factures(statut);

ALTER TABLE factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE factures FORCE ROW LEVEL SECURITY;

CREATE TRIGGER trg_factures_updated_at
BEFORE UPDATE ON factures
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- Règle métier 1 : numérotation atomique -----------------------------
CREATE OR REPLACE FUNCTION generer_numero_facture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jour date := CURRENT_DATE;
  v_seq  integer;
BEGIN
  -- INSERT ... ON CONFLICT DO UPDATE prend un verrou de ligne sur
  -- facture_sequences(jour) : deux INSERT concurrents sur factures se
  -- sérialisent automatiquement ici, sans collision possible (règle 1).
  INSERT INTO facture_sequences (jour, dernier_numero)
  VALUES (v_jour, 1)
  ON CONFLICT (jour) DO UPDATE
    SET dernier_numero = facture_sequences.dernier_numero + 1
  RETURNING dernier_numero INTO v_seq;

  IF v_seq > 999 THEN
    RAISE EXCEPTION 'Limite quotidienne de 999 factures atteinte pour le %', v_jour;
  END IF;

  -- Toujours réécrit côté serveur, quelle que soit la valeur envoyée par le
  -- client (règle 1 + règle 8 : identité/valeurs sensibles jamais fournies
  -- par le client).
  NEW.numero := 'FP' || to_char(v_jour, 'YYYYMMDD') || lpad(v_seq::text, 3, '0');

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generer_numero_facture
BEFORE INSERT ON factures
FOR EACH ROW EXECUTE FUNCTION generer_numero_facture();

-- --- RLS factures -----------------------------------------------------------
-- Admin : accès total, y compris suppression et changement de statut libre
-- (règle 8).
CREATE POLICY factures_admin_all
  ON factures FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Agent : ne voit QUE ses propres factures (périmètre restreint explicite du
-- rôle agent, cf. contexte projet). Un agent ne peut ni lire ni modifier les
-- factures (brouillon ou non) d'un autre agent.
CREATE POLICY factures_lecture_agent_propre
  ON factures FOR SELECT
  USING (is_agent_actif() AND agent_id = auth.uid());

-- Agent : création autorisée uniquement pour lui-même et au statut brouillon.
CREATE POLICY factures_creation_agent
  ON factures FOR INSERT
  WITH CHECK (is_agent_actif() AND agent_id = auth.uid() AND statut = 'brouillon');

-- Agent : modification uniquement de ses propres factures ET tant qu'elles
-- sont encore au statut 'brouillon' (règle 8). Le USING porte sur l'état
-- AVANT modification (verrouille dès que le statut quitte 'brouillon',
-- l'agent perd alors tout droit d'écriture sur cette ligne) ; le WITH CHECK
-- empêche de changer le propriétaire et interdit de positionner directement
-- les statuts 'payee'/'payee_partielle', qui ne doivent provenir que du
-- trigger appliquer_paiement().
CREATE POLICY factures_maj_agent_propre_brouillon
  ON factures FOR UPDATE
  USING (is_agent_actif() AND agent_id = auth.uid() AND statut = 'brouillon')
  WITH CHECK (
    is_agent_actif() AND agent_id = auth.uid()
    AND statut IN ('brouillon', 'proforma', 'validee', 'annulee')
  );

-- Aucune policy DELETE pour l'agent -> suppression toujours refusée pour ce rôle.


-- =============================================================================
-- SECTION 9 — TABLE lignes_facture + RLS + triggers gerer_ligne_facture() et
-- calculer_totaux_facture()
-- =============================================================================

CREATE TABLE lignes_facture (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id   uuid NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  produit_id   uuid NOT NULL REFERENCES produits(id) ON DELETE RESTRICT,
  quantite     numeric(12,2) NOT NULL CHECK (quantite > 0),
  -- Pas de DEFAULT : NULL au moment de l'INSERT signifie "à déduire du
  -- catalogue produit" pour le trigger gerer_ligne_facture() ci-dessous, qui
  -- le remplit alors AVANT le contrôle NOT NULL. Une valeur explicite (y
  -- compris 0, ex. ligne gratuite/promotionnelle) est respectée telle quelle
  -- sauf pour un produit inclus_dans_kit qui est toujours forcé à 0 (règle 3).
  prix_unitaire numeric(12,2) NOT NULL CHECK (prix_unitaire >= 0),
  -- règle 2 : total_ligne = quantite * prix_unitaire, colonne générée donc
  -- impossible à désynchroniser ou falsifier.
  total_ligne  numeric(14,2) GENERATED ALWAYS AS (quantite * prix_unitaire) STORED,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lignes_facture_facture_id ON lignes_facture(facture_id);
CREATE INDEX idx_lignes_facture_produit_id ON lignes_facture(produit_id);

ALTER TABLE lignes_facture ENABLE ROW LEVEL SECURITY;
ALTER TABLE lignes_facture FORCE ROW LEVEL SECURITY;

CREATE TRIGGER trg_lignes_facture_updated_at
BEFORE UPDATE ON lignes_facture
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- RLS lignes_facture ------------------------------------------------------
CREATE POLICY lignes_facture_admin_all
  ON lignes_facture FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY lignes_facture_lecture_agent_propre
  ON lignes_facture FOR SELECT
  USING (
    is_agent_actif() AND EXISTS (
      SELECT 1 FROM factures f
      WHERE f.id = lignes_facture.facture_id AND f.agent_id = auth.uid()
    )
  );

CREATE POLICY lignes_facture_creation_agent_propre_brouillon
  ON lignes_facture FOR INSERT
  WITH CHECK (
    is_agent_actif() AND EXISTS (
      SELECT 1 FROM factures f
      WHERE f.id = lignes_facture.facture_id
        AND f.agent_id = auth.uid() AND f.statut = 'brouillon'
    )
  );

CREATE POLICY lignes_facture_maj_agent_propre_brouillon
  ON lignes_facture FOR UPDATE
  USING (
    is_agent_actif() AND EXISTS (
      SELECT 1 FROM factures f
      WHERE f.id = lignes_facture.facture_id
        AND f.agent_id = auth.uid() AND f.statut = 'brouillon'
    )
  )
  WITH CHECK (
    is_agent_actif() AND EXISTS (
      SELECT 1 FROM factures f
      WHERE f.id = lignes_facture.facture_id
        AND f.agent_id = auth.uid() AND f.statut = 'brouillon'
    )
  );

CREATE POLICY lignes_facture_suppression_agent_propre_brouillon
  ON lignes_facture FOR DELETE
  USING (
    is_agent_actif() AND EXISTS (
      SELECT 1 FROM factures f
      WHERE f.id = lignes_facture.facture_id
        AND f.agent_id = auth.uid() AND f.statut = 'brouillon'
    )
  );

-- --- Verrou d'intégrité + application règle 3 (prix forcé à 0 si inclus_dans_kit)
CREATE OR REPLACE FUNCTION gerer_ligne_facture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_statut statut_facture;
  v_type   type_ligne_produit;
  v_prix   numeric(12,2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT statut INTO v_statut FROM factures WHERE id = OLD.facture_id;
    -- Verrou d'intégrité valable pour TOUS les rôles, y compris admin : une
    -- fois le stock décrémenté (statut validee et au-delà), on ne modifie
    -- plus les lignes historiques (protège les règles 4/5). Pour corriger,
    -- il faut annuler la facture (restauration de stock automatique) puis
    -- en recréer une nouvelle.
    IF v_statut NOT IN ('brouillon', 'proforma') THEN
      RAISE EXCEPTION 'Impossible de supprimer une ligne d''une facture au statut % (déjà validée/payée/annulée)', v_statut;
    END IF;
    RETURN OLD;
  END IF;

  SELECT statut INTO v_statut FROM factures WHERE id = NEW.facture_id;
  IF v_statut IS NULL THEN
    RAISE EXCEPTION 'Facture % introuvable', NEW.facture_id;
  END IF;
  IF v_statut NOT IN ('brouillon', 'proforma') THEN
    RAISE EXCEPTION 'Impossible de modifier les lignes d''une facture au statut % (déjà validée/payée/annulée)', v_statut;
  END IF;

  SELECT type_ligne_produit, prix_unitaire INTO v_type, v_prix
  FROM produits WHERE id = NEW.produit_id;
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'Produit % introuvable', NEW.produit_id;
  END IF;

  IF v_type = 'inclus_dans_kit' THEN
    -- Règle 3 : toujours 0 FCFA, quelle que soit la valeur envoyée par le
    -- client, même si un agent/admin tente d'envoyer un prix.
    NEW.prix_unitaire := 0;
  ELSIF NEW.prix_unitaire IS NULL THEN
    -- Prix non fourni par le client : on reprend le prix catalogue courant.
    -- Une valeur explicitement envoyée (y compris 0 pour une ligne gratuite/
    -- promotionnelle sur un produit vendu_separement) est respectée telle quelle.
    NEW.prix_unitaire := COALESCE(v_prix, 0);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gerer_ligne_facture
BEFORE INSERT OR UPDATE OR DELETE ON lignes_facture
FOR EACH ROW EXECUTE FUNCTION gerer_ligne_facture();

-- --- Règle métier 2 : recalcul automatique de total_ht -----------------
CREATE OR REPLACE FUNCTION calculer_totaux_facture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_facture_id uuid;
  v_total_ht   numeric(14,2);
BEGIN
  v_facture_id := COALESCE(NEW.facture_id, OLD.facture_id);

  SELECT COALESCE(SUM(total_ligne), 0) INTO v_total_ht
  FROM lignes_facture
  WHERE facture_id = v_facture_id;

  -- total_general (colonne générée sur factures) se recalcule automatiquement
  -- dès que total_ht change ici : total_ht + forfait_transport + total_ht*tva_taux
  -- (règle 2).
  UPDATE factures
  SET total_ht = v_total_ht,
      updated_at = now()
  WHERE id = v_facture_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_calculer_totaux_facture
AFTER INSERT OR UPDATE OR DELETE ON lignes_facture
FOR EACH ROW EXECUTE FUNCTION calculer_totaux_facture();


-- =============================================================================
-- SECTION 10 — TABLE mouvements_stock + RLS
-- (Les écritures automatiques -sortie/entrée/ajustement- se font via des
-- fonctions SECURITY DEFINER, section 11 ; l'agent n'a donc jamais besoin
-- d'un droit d'écriture direct ici, conformément à la règle 8.)
-- =============================================================================

CREATE TABLE mouvements_stock (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id            uuid NOT NULL REFERENCES produits(id) ON DELETE RESTRICT,
  type                  type_mouvement_stock NOT NULL,
  quantite              numeric(12,2) NOT NULL,
  motif                 text,
  reference_facture_id  uuid REFERENCES factures(id) ON DELETE SET NULL,
  utilisateur_id        uuid REFERENCES utilisateurs(id) ON DELETE RESTRICT,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mouvements_stock_quantite_coherente CHECK (
    (type IN ('entree', 'sortie') AND quantite > 0) OR
    (type = 'ajustement' AND quantite <> 0)
  )
);

CREATE INDEX idx_mouvements_stock_produit_id ON mouvements_stock(produit_id);
CREATE INDEX idx_mouvements_stock_reference_facture_id ON mouvements_stock(reference_facture_id);

ALTER TABLE mouvements_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE mouvements_stock FORCE ROW LEVEL SECURITY;

-- Admin : accès total (règle 8). Aucune policy pour l'agent -> aucun accès,
-- ni en lecture ni en écriture, conformément à "aucun accès en écriture
-- directe au stock ou aux mouvements de stock" (le mouvement_stock lié à une
-- facture est de toute façon consultable indirectement par l'agent via ses
-- propres factures/lignes_facture).
CREATE POLICY mouvements_stock_admin_all
  ON mouvements_stock FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());


-- =============================================================================
-- SECTION 11 — TABLE paiements + RLS + trigger appliquer_paiement()
-- =============================================================================

CREATE TABLE paiements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id      uuid NOT NULL REFERENCES factures(id) ON DELETE RESTRICT,
  montant         numeric(14,2) NOT NULL CHECK (montant > 0),
  mode_paiement   mode_paiement NOT NULL,
  reference       text,
  date_paiement   date NOT NULL DEFAULT current_date,
  utilisateur_id  uuid REFERENCES utilisateurs(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_paiements_facture_id ON paiements(facture_id);

ALTER TABLE paiements ENABLE ROW LEVEL SECURITY;
ALTER TABLE paiements FORCE ROW LEVEL SECURITY;

-- Admin : accès total (règle 8). L'enregistrement des paiements n'est pas
-- listé parmi les droits de création de l'agent dans le cahier des charges
-- (seulement factures/lignes_facture/clients) : l'agent a donc uniquement un
-- droit de LECTURE sur les paiements de ses propres factures, à documenter
-- côté frontend si ce choix doit évoluer.
CREATE POLICY paiements_admin_all
  ON paiements FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY paiements_lecture_agent_propre
  ON paiements FOR SELECT
  USING (
    is_agent_actif() AND EXISTS (
      SELECT 1 FROM factures f
      WHERE f.id = paiements.facture_id AND f.agent_id = auth.uid()
    )
  );

-- --- Règle métier 7 : statut de paiement automatique --------------------
CREATE OR REPLACE FUNCTION appliquer_paiement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_facture       factures%ROWTYPE;
  v_total_paye    numeric(14,2);
  v_nouveau_statut statut_facture;
BEGIN
  SELECT * INTO v_facture
  FROM factures
  WHERE id = COALESCE(NEW.facture_id, OLD.facture_id)
  FOR UPDATE;

  IF v_facture.id IS NULL THEN
    RAISE EXCEPTION 'Facture introuvable pour ce paiement';
  END IF;

  IF TG_OP = 'INSERT' AND v_facture.statut NOT IN ('validee', 'payee_partielle') THEN
    RAISE EXCEPTION 'Impossible d''enregistrer un paiement sur une facture au statut % (elle doit d''abord être validée)', v_facture.statut;
  END IF;

  SELECT COALESCE(SUM(montant), 0) INTO v_total_paye
  FROM paiements WHERE facture_id = v_facture.id;

  -- Ne touche au statut que si la facture est dans le cycle de paiement
  -- (validee/payee_partielle/payee) ; ne modifie jamais brouillon/proforma/annulee.
  IF v_facture.statut IN ('validee', 'payee_partielle', 'payee') THEN
    IF v_total_paye <= 0 THEN
      v_nouveau_statut := 'validee';
    ELSIF v_total_paye < v_facture.total_general THEN
      v_nouveau_statut := 'payee_partielle';
    ELSE
      v_nouveau_statut := 'payee';
    END IF;

    UPDATE factures
    SET statut = v_nouveau_statut, updated_at = now()
    WHERE id = v_facture.id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Déclenché sur INSERT (exigence explicite) et étendu à UPDATE/DELETE (écart
-- documenté) afin que le statut reste cohérent si un admin corrige ou
-- supprime un paiement erroné.
CREATE TRIGGER trg_appliquer_paiement
AFTER INSERT OR UPDATE OR DELETE ON paiements
FOR EACH ROW EXECUTE FUNCTION appliquer_paiement();


-- =============================================================================
-- SECTION 12 — TABLE alertes_stock + RLS + trigger verifier_seuil_stock()
-- =============================================================================

CREATE TABLE alertes_stock (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id uuid NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  type       text NOT NULL DEFAULT 'stock_bas' CHECK (type IN ('stock_bas', 'rupture')),
  message    text NOT NULL,
  lue        boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_alertes_stock_produit_id ON alertes_stock(produit_id);
CREATE INDEX idx_alertes_stock_lue ON alertes_stock(lue) WHERE lue = false;

ALTER TABLE alertes_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertes_stock FORCE ROW LEVEL SECURITY;

CREATE TRIGGER trg_alertes_stock_updated_at
BEFORE UPDATE ON alertes_stock
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Admin uniquement (règle 8 ; l'agent n'a pas de visibilité opérationnelle
-- sur les alertes de stock, seulement sur quantite_stock/seuil_alerte via la
-- lecture directe de la table produits).
CREATE POLICY alertes_stock_admin_all
  ON alertes_stock FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- --- Règle métier 6 : alerte automatique quand quantite_stock <= seuil_alerte
CREATE OR REPLACE FUNCTION verifier_seuil_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.quantite_stock <= NEW.seuil_alerte THEN
    IF NOT EXISTS (
      SELECT 1 FROM alertes_stock WHERE produit_id = NEW.id AND lue = false
    ) THEN
      INSERT INTO alertes_stock (produit_id, type, message, lue)
      VALUES (
        NEW.id,
        CASE WHEN NEW.quantite_stock <= 0 THEN 'rupture' ELSE 'stock_bas' END,
        format('Stock bas pour "%s" (%s) : %s restant(s), seuil d''alerte %s',
               NEW.nom, NEW.code, NEW.quantite_stock, NEW.seuil_alerte),
        false
      );
    END IF;
  ELSE
    -- Réapprovisionnement au-dessus du seuil : nettoyage automatique des
    -- alertes non lues devenues obsolètes (ajout non strictement requis par
    -- le cahier des charges, mais évite le bruit dans le centre d'alertes).
    UPDATE alertes_stock
    SET lue = true, updated_at = now()
    WHERE produit_id = NEW.id AND lue = false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_verifier_seuil_stock_update
AFTER UPDATE OF quantite_stock, seuil_alerte ON produits
FOR EACH ROW
WHEN (NEW.quantite_stock IS DISTINCT FROM OLD.quantite_stock OR NEW.seuil_alerte IS DISTINCT FROM OLD.seuil_alerte)
EXECUTE FUNCTION verifier_seuil_stock();

-- Couvre aussi la saisie initiale d'un produit déjà sous le seuil.
CREATE TRIGGER trg_verifier_seuil_stock_insert
AFTER INSERT ON produits
FOR EACH ROW EXECUTE FUNCTION verifier_seuil_stock();

-- Diffusion temps réel (Supabase Realtime) des nouvelles alertes.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE alertes_stock;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;


-- =============================================================================
-- SECTION 13 — TABLE journal_activites + RLS
-- =============================================================================

CREATE TABLE journal_activites (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  utilisateur_id uuid REFERENCES utilisateurs(id) ON DELETE RESTRICT,
  action         text NOT NULL,
  table_cible    text NOT NULL,
  avant          jsonb,
  apres          jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_journal_activites_utilisateur_id ON journal_activites(utilisateur_id);
CREATE INDEX idx_journal_activites_table_cible ON journal_activites(table_cible);

ALTER TABLE journal_activites ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_activites FORCE ROW LEVEL SECURITY;

-- Admin uniquement (règle 8 ; le journal d'activité est un outil d'audit
-- réservé à l'administration). Les écritures automatiques provenant des
-- triggers SECURITY DEFINER (annulation facture, ajustement stock manuel,
-- suppression) restent possibles pour un agent car elles s'exécutent avec
-- les droits du propriétaire de la fonction, indépendamment de cette policy.
CREATE POLICY journal_activites_admin_all
  ON journal_activites FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());


-- =============================================================================
-- SECTION 14 — TRIGGERS MÉTIER TRANSVERSES
-- (Regroupés ici car ils dépendent de plusieurs tables — lignes_facture,
-- produits, mouvements_stock, journal_activites — toutes désormais créées.)
-- =============================================================================

-- --- Règle métier 4 : décrément de stock à la validation, blocage si insuffisant
CREATE OR REPLACE FUNCTION decrementer_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  -- 1) Vérification de disponibilité, avec verrouillage des lignes produits
  --    concernées (FOR UPDATE) pour empêcher deux validations concurrentes
  --    de dépasser le stock réellement disponible (sécurité de concurrence).
  FOR r IN
    SELECT p.id, p.nom, p.quantite_stock, lf.quantite AS quantite_demandee
    FROM lignes_facture lf
    JOIN produits p ON p.id = lf.produit_id
    WHERE lf.facture_id = NEW.id
    FOR UPDATE OF p
  LOOP
    IF r.quantite_stock < r.quantite_demandee THEN
      RAISE EXCEPTION 'Stock insuffisant pour le produit "%" : disponible %, demandé %',
        r.nom, r.quantite_stock, r.quantite_demandee;
    END IF;
  END LOOP;

  -- 2) Décrément effectif (le flag de session évite une double
  --    journalisation par gerer_ajustement_stock_manuel ci-dessous : le
  --    mouvement_stock inséré au point 3 fait déjà foi).
  PERFORM set_config('gfb.mouvement_auto', 'true', true);

  UPDATE produits p
  SET quantite_stock = p.quantite_stock - lf.quantite,
      updated_at = now()
  FROM lignes_facture lf
  WHERE lf.facture_id = NEW.id AND p.id = lf.produit_id;

  PERFORM set_config('gfb.mouvement_auto', 'false', true);

  -- 3) Traçabilité : un mouvement de sortie par ligne de facture.
  INSERT INTO mouvements_stock (produit_id, type, quantite, motif, reference_facture_id, utilisateur_id)
  SELECT lf.produit_id, 'sortie', lf.quantite,
         'Validation facture ' || NEW.numero, NEW.id, auth.uid()
  FROM lignes_facture lf
  WHERE lf.facture_id = NEW.id;

  NEW.date_validation := now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_decrementer_stock
BEFORE UPDATE ON factures
FOR EACH ROW
WHEN (NEW.statut = 'validee' AND OLD.statut IS DISTINCT FROM 'validee')
EXECUTE FUNCTION decrementer_stock();

-- --- Règle métier 5 (+ règle 9 : journalisation de l'annulation) ---------
CREATE OR REPLACE FUNCTION restaurer_stock_annulation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.statut = 'validee' THEN
    PERFORM set_config('gfb.mouvement_auto', 'true', true);

    UPDATE produits p
    SET quantite_stock = p.quantite_stock + lf.quantite,
        updated_at = now()
    FROM lignes_facture lf
    WHERE lf.facture_id = NEW.id AND p.id = lf.produit_id;

    PERFORM set_config('gfb.mouvement_auto', 'false', true);

    INSERT INTO mouvements_stock (produit_id, type, quantite, motif, reference_facture_id, utilisateur_id)
    SELECT lf.produit_id, 'entree', lf.quantite,
           'Annulation facture ' || NEW.numero, NEW.id, auth.uid()
    FROM lignes_facture lf
    WHERE lf.facture_id = NEW.id;
  END IF;

  -- Règle 9 : toute annulation de facture est une action sensible journalisée,
  -- qu'un stock ait été restitué ou non (ex: annulation d'un simple brouillon).
  INSERT INTO journal_activites (utilisateur_id, action, table_cible, avant, apres)
  VALUES (auth.uid(), 'annulation_facture', 'factures', to_jsonb(OLD), to_jsonb(NEW));

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_restaurer_stock_annulation
BEFORE UPDATE ON factures
FOR EACH ROW
WHEN (NEW.statut = 'annulee' AND OLD.statut IS DISTINCT FROM 'annulee')
EXECUTE FUNCTION restaurer_stock_annulation();

-- --- Règle métier 9 : journalisation des ajustements manuels de stock ---
CREATE OR REPLACE FUNCTION gerer_ajustement_stock_manuel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Si la variation de stock provient d'un trigger interne déjà tracé
  -- (decrementer_stock / restaurer_stock_annulation), le mouvement_stock lié
  -- à la facture suffit : on évite une double écriture de journal_activites.
  IF current_setting('gfb.mouvement_auto', true) = 'true' THEN
    RETURN NEW;
  END IF;

  INSERT INTO mouvements_stock (produit_id, type, quantite, motif, utilisateur_id)
  VALUES (NEW.id, 'ajustement', NEW.quantite_stock - OLD.quantite_stock,
          'Ajustement manuel du stock', auth.uid());

  INSERT INTO journal_activites (utilisateur_id, action, table_cible, avant, apres)
  VALUES (
    auth.uid(), 'ajustement_stock_manuel', 'produits',
    jsonb_build_object('quantite_stock', OLD.quantite_stock),
    jsonb_build_object('quantite_stock', NEW.quantite_stock)
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gerer_ajustement_stock_manuel
AFTER UPDATE OF quantite_stock ON produits
FOR EACH ROW
WHEN (NEW.quantite_stock IS DISTINCT FROM OLD.quantite_stock)
EXECUTE FUNCTION gerer_ajustement_stock_manuel();

-- --- Règle métier 9 : journalisation des suppressions sur les tables sensibles
CREATE OR REPLACE FUNCTION journaliser_suppression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO journal_activites (utilisateur_id, action, table_cible, avant, apres)
  VALUES (auth.uid(), 'suppression', TG_TABLE_NAME, to_jsonb(OLD), NULL);
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_journaliser_suppression_factures
AFTER DELETE ON factures
FOR EACH ROW EXECUTE FUNCTION journaliser_suppression();

CREATE TRIGGER trg_journaliser_suppression_produits
AFTER DELETE ON produits
FOR EACH ROW EXECUTE FUNCTION journaliser_suppression();

CREATE TRIGGER trg_journaliser_suppression_clients
AFTER DELETE ON clients
FOR EACH ROW EXECUTE FUNCTION journaliser_suppression();

CREATE TRIGGER trg_journaliser_suppression_utilisateurs
AFTER DELETE ON utilisateurs
FOR EACH ROW EXECUTE FUNCTION journaliser_suppression();


-- =============================================================================
-- SECTION 15 — STORAGE BUCKETS
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('factures', 'factures', false),
  ('produits-photos', 'produits-photos', true),
  ('logo', 'logo', true)
ON CONFLICT (id) DO NOTHING;

-- Convention de chemin attendue pour le bucket privé "factures" :
--   {agent_id}/{numero_facture}.pdf
-- afin que la policy agent puisse vérifier la propriété via le 1er segment
-- du chemin, sans jamais faire confiance à une valeur envoyée par le client.

-- Lecture : admin (tout) + agent propriétaire uniquement. Écriture : aucune
-- policy authenticated -> seul service_role (Edge Function) peut écrire,
-- car service_role contourne RLS par défaut sur Supabase.
CREATE POLICY factures_pdf_lecture_admin
  ON storage.objects FOR SELECT
  USING (bucket_id = 'factures' AND is_admin());

CREATE POLICY factures_pdf_lecture_agent_proprietaire
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'factures'
    AND is_agent_actif()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Lecture publique, écriture réservée à l'admin.
CREATE POLICY produits_photos_lecture_publique
  ON storage.objects FOR SELECT
  USING (bucket_id = 'produits-photos');

CREATE POLICY produits_photos_ecriture_admin
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'produits-photos' AND is_admin());

CREATE POLICY produits_photos_maj_admin
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'produits-photos' AND is_admin())
  WITH CHECK (bucket_id = 'produits-photos' AND is_admin());

CREATE POLICY produits_photos_suppression_admin
  ON storage.objects FOR DELETE
  USING (bucket_id = 'produits-photos' AND is_admin());

-- Lecture publique, écriture réservée à l'admin.
CREATE POLICY logo_lecture_publique
  ON storage.objects FOR SELECT
  USING (bucket_id = 'logo');

CREATE POLICY logo_ecriture_admin
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'logo' AND is_admin());

CREATE POLICY logo_maj_admin
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'logo' AND is_admin())
  WITH CHECK (bucket_id = 'logo' AND is_admin());

CREATE POLICY logo_suppression_admin
  ON storage.objects FOR DELETE
  USING (bucket_id = 'logo' AND is_admin());


-- =============================================================================
-- SECTION 16 — PG_CRON : scan quotidien des seuils de stock
-- =============================================================================

-- L'activation de pg_cron nécessite parfois un droit non accordé par défaut
-- aux migrations (selon le plan Supabase). On tente l'activation sans faire
-- échouer tout le fichier de migration si elle n'est pas encore autorisée :
-- dans ce cas, activer manuellement pg_cron depuis Dashboard > Database >
-- Extensions puis relancer uniquement le bloc `SELECT cron.schedule(...)`
-- plus bas.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
EXCEPTION WHEN insufficient_privilege OR feature_not_supported THEN
  RAISE NOTICE 'pg_cron non activable automatiquement ici : activez-le depuis Dashboard > Database > Extensions, puis relancez le bloc cron.schedule() de la section 16.';
END $$;

CREATE OR REPLACE FUNCTION scanner_alertes_stock_quotidien()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  -- Règle métier 6, en complément du trigger temps réel verifier_seuil_stock() :
  -- filet de sécurité quotidien (ex: seuil_alerte modifié à la baisse sans
  -- mouvement de stock associé, ou alerte manquée pour toute autre raison).
  FOR r IN
    SELECT * FROM produits WHERE actif = true AND quantite_stock <= seuil_alerte
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM alertes_stock WHERE produit_id = r.id AND lue = false
    ) THEN
      INSERT INTO alertes_stock (produit_id, type, message, lue)
      VALUES (
        r.id,
        CASE WHEN r.quantite_stock <= 0 THEN 'rupture' ELSE 'stock_bas' END,
        format('[Scan quotidien 06h00] Stock bas pour "%s" (%s) : %s restant(s), seuil %s',
               r.nom, r.code, r.quantite_stock, r.seuil_alerte),
        false
      );
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'scan-alertes-stock-quotidien',
    '0 6 * * *',
    $cron$SELECT scanner_alertes_stock_quotidien();$cron$
  );
EXCEPTION WHEN undefined_table OR undefined_function OR insufficient_privilege THEN
  RAISE NOTICE 'Planification pg_cron non effectuée (extension pg_cron indisponible) : à relancer manuellement une fois pg_cron activé, via SELECT cron.schedule(''scan-alertes-stock-quotidien'', ''0 6 * * *'', ''SELECT scanner_alertes_stock_quotidien();'');';
END $$;


-- =============================================================================
-- SECTION 17 — GRANTS (table-level ; le filtrage fin reste assuré par RLS)
-- =============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  entreprise_config,
  utilisateurs,
  categories_produits,
  produits,
  clients,
  factures,
  lignes_facture,
  mouvements_stock,
  paiements,
  alertes_stock,
  journal_activites
TO authenticated;

GRANT SELECT ON facture_sequences TO authenticated;

-- Aucun droit accordé au rôle anon : l'ensemble de l'application exige une
-- authentification (règle 8).

-- =============================================================================
-- FIN DU SCHÉMA INITIAL
-- =============================================================================
