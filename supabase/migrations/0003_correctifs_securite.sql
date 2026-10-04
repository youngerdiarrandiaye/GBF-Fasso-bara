-- =============================================================================
-- GFB-STOCK — Migration corrective de sécurité
-- Fichier : supabase/migrations/0003_correctifs_securite.sql
-- Auteur  : architecte-bdd (agent)
-- Objet   : correction des deux points relevés par l'audit de sécurité mené
--           par l'agent expert-securite sur 0001_schema_initial.sql +
--           0002_ajustements_backend.sql. Ce fichier NE MODIFIE NI 0001 NI
--           0002 (déjà livrés/potentiellement déjà appliqués) : il ne fait
--           qu'ajouter/corriger, conformément à la consigne de correction
--           ciblée déjà appliquée pour 0002.
--
--   A. [BLOQUANT] entreprise_config exposait les coordonnées bancaires
--      (banque_nom, banque_code, banque_agence, banque_numero_compte,
--      banque_cle_rib, iban, swift) en lecture directe (SELECT via
--      PostgREST/supabase-js) à TOUT utilisateur authentifié, agent inclus,
--      via la policy `entreprise_config_lecture_authenticated` (0001,
--      section 2, USING (auth.uid() IS NOT NULL)). Ceci contredit la règle
--      métier 8 ("agent : lecture sur produits/clients [uniquement]") et le
--      contexte projet ("un agent ne doit jamais accéder aux paramètres
--      bancaires de l'entreprise"). Ce n'était pas nécessaire : l'Edge
--      Function generer-facture-pdf lit déjà entreprise_config via
--      service_role, qui contourne RLS et n'a donc jamais eu besoin de cette
--      policy `authenticated` pour fonctionner (cf.
--      supabase/functions/generer-facture-pdf/README.md).
--
--      Correctif (section 20) :
--        1) Remplacement de la policy de lecture par une restriction à
--           is_admin() seul.
--        2) Ajout d'une vue `entreprise_config_public`, n'exposant QUE les
--           colonnes non sensibles (identité, adresses, téléphones, email,
--           NINEA/RC, logo, modalités/délai, délai de validité proforma),
--           accessible en lecture à tout authentifié, pour couvrir le besoin
--           légitime déjà documenté côté frontend (docs/design-system.md
--           §5.1 : affichage de `validite_proforma_jours` dans la vue détail
--           facture, accessible aux agents ; §6.2 : en-tête UI avec
--           nom/adresses/téléphones). Aucune colonne bancaire n'y figure.
--
--   B. [IMPORTANT] journal_activites n'était jamais alimenté lors d'un
--      changement de rôle ou de statut actif d'un utilisateur (UPDATE
--      utilisateurs.role / utilisateurs.actif). Seules les suppressions
--      (journaliser_suppression, 0001 section 14) et quelques actions stock/
--      facture étaient tracées. Or un changement de rôle/désactivation est
--      une action sensible au même titre que celles déjà journalisées
--      (règle 9, cf. commentaire de section 0 de 0001).
--
--      Correctif (section 21) : trigger AFTER UPDATE OF role, actif ON
--      utilisateurs, sur le modèle des triggers de journalisation déjà
--      existants (restaurer_stock_annulation -> action 'annulation_facture',
--      gerer_ajustement_stock_manuel -> action 'ajustement_stock_manuel').
--      Ce trigger ne fait QUE journaliser (avant/après en jsonb) ; il ne
--      bloque ni n'autorise rien. Il coexiste sans conflit avec
--      trg_empecher_auto_promotion (0001, section 3) car :
--        - trg_empecher_auto_promotion est un trigger BEFORE UPDATE : s'il
--          lève une exception (tentative d'auto-promotion par un non-admin),
--          toute la transaction est annulée et AUCUNE ligne n'est réellement
--          modifiée -> le nouveau trigger AFTER UPDATE ne s'exécute jamais
--          dans ce cas (rien à journaliser, ce qui est le comportement
--          souhaité : on ne journalise pas une action qui n'a pas eu lieu).
--        - Si trg_empecher_auto_promotion laisse passer la mise à jour (cas
--          admin, ou cas où role/actif ne changent pas), le nouveau trigger
--          AFTER UPDATE s'exécute ensuite avec sa clause WHEN qui vérifie que
--          role ou actif a réellement changé (IS DISTINCT FROM), et
--          journalise alors l'auteur réel (auth.uid(), donc l'admin qui a
--          fait l'opération) ainsi que la cible (utilisateur modifié) et les
--          valeurs avant/après.
-- =============================================================================


-- =============================================================================
-- SECTION 20 — CORRECTIF BLOQUANT : entreprise_config, lecture réservée admin
-- + vue publique non sensible pour les écrans agent
-- Référence audit sécurité : point BLOQUANT n°1 (fuite des coordonnées
-- bancaires vers tout utilisateur authentifié via PostgREST/supabase-js).
-- =============================================================================

-- --- 20.1 Suppression de la policy trop permissive --------------------------
-- Remplace la policy 0001 `entreprise_config_lecture_authenticated`
-- (USING (auth.uid() IS NOT NULL)), qui donnait accès en lecture directe aux
-- colonnes bancaires à tout authentifié, agents inclus.
DROP POLICY IF EXISTS entreprise_config_lecture_authenticated ON entreprise_config;

-- --- 20.2 Nouvelle policy : lecture réservée à l'admin ----------------------
-- Aligne entreprise_config sur la règle métier 8 ("agent : lecture sur
-- produits/clients [uniquement]") : un agent n'a plus aucun accès direct à
-- la table entreprise_config (donc aucun accès aux colonnes bancaires), quel
-- que soit le client utilisé pour contourner l'interface (PostgREST direct,
-- supabase-js, etc.). L'admin conserve un accès total (règle 8), la policy
-- d'écriture `entreprise_config_ecriture_admin` (0001, section 3) est
-- inchangée.
CREATE POLICY entreprise_config_lecture_admin
  ON entreprise_config FOR SELECT
  USING (is_admin());

COMMENT ON POLICY entreprise_config_lecture_admin ON entreprise_config IS
  'Correctif audit sécurité (BLOQUANT, cf. 0003_correctifs_securite.sql section 20) : remplace entreprise_config_lecture_authenticated (0001), qui exposait les coordonnées bancaires à tout authentifié. La lecture directe de la table complète (colonnes bancaires incluses) est désormais réservée à l''admin. Les besoins UI non sensibles passent par la vue entreprise_config_public.';

-- --- 20.3 Vue publique : uniquement les colonnes non sensibles --------------
-- Couvre le besoin légitime d'un écran agent affichant des informations
-- d'entreprise non sensibles (en-tête de facture/UI, délai de validité
-- proforma affiché dans la vue détail facture — cf. docs/design-system.md
-- §5.1 et §6.2), sans jamais rouvrir l'accès aux colonnes bancaires.
--
-- Fonctionnement RLS/vue : entreprise_config a FORCE ROW LEVEL SECURITY
-- (0001, section 2). Une vue Postgres est, par défaut (security_invoker =
-- false, comportement par défaut avant/à partir de Postgres 15), exécutée
-- avec les privilèges de son PROPRIÉTAIRE pour les vérifications de droits
-- et l'évaluation des policies RLS sur les tables sous-jacentes — comme le
-- rôle exécutant cette migration (postgres, qui contourne RLS sur ce
-- projet Supabase) est propriétaire de la vue, celle-ci peut lire la ligne
-- singleton indépendamment de la policy `entreprise_config_lecture_admin`
-- ci-dessus. Le SEUL point de contrôle de ce qui est exposé à l'agent est
-- donc la liste explicite de colonnes ci-dessous : AUCUNE colonne bancaire
-- (banque_nom, banque_code, banque_agence, banque_numero_compte,
-- banque_cle_rib, iban, swift) n'y figure, par construction.
CREATE VIEW entreprise_config_public AS
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
  updated_at
FROM entreprise_config;

COMMENT ON VIEW entreprise_config_public IS
  'Vue non sensible d''entreprise_config (identité, adresses, téléphones, email, NINEA/RC, logo, modalités, délai proforma) — AUCUNE colonne bancaire. Créée par le correctif audit sécurité (BLOQUANT, cf. 0003_correctifs_securite.sql section 20) pour permettre un accès en lecture aux agents sans rouvrir la table entreprise_config complète.';

-- Accès en lecture SEULE (aucun GRANT INSERT/UPDATE/DELETE, même si Postgres
-- considère cette vue comme "simplement modifiable" par construction) à tout
-- utilisateur authentifié, agent comme admin. Cohérent avec 0001 section 17
-- ("aucun droit accordé au rôle anon").
GRANT SELECT ON entreprise_config_public TO authenticated;


-- =============================================================================
-- SECTION 21 — CORRECTIF IMPORTANT : journalisation des changements de
-- rôle/statut actif d'un utilisateur
-- Référence audit sécurité : point IMPORTANT n°2 (journal_activites non
-- alimenté sur UPDATE utilisateurs.role / utilisateurs.actif).
-- =============================================================================

CREATE OR REPLACE FUNCTION journaliser_changement_role_actif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Règle 9 (journalisation des actions sensibles) : un changement de rôle
  -- ou de statut actif d'un utilisateur est une action sensible au même
  -- titre qu'une annulation de facture (restaurer_stock_annulation, 0001
  -- section 14) ou qu'un ajustement manuel de stock
  -- (gerer_ajustement_stock_manuel, 0001 section 14).
  --
  -- Ce trigger est purement déclaratif (AFTER UPDATE) : il ne bloque ni
  -- n'autorise rien, contrairement à trg_empecher_auto_promotion (0001,
  -- section 3) qui est un trigger BEFORE UPDATE distinct et s'exécute avant
  -- celui-ci. Si trg_empecher_auto_promotion lève une exception (tentative
  -- d'auto-promotion par un non-admin), la transaction est annulée et ce
  -- trigger AFTER ne s'exécute jamais (rien à journaliser, cf. section 21
  -- de ce fichier pour le détail de la non-collision entre les deux
  -- triggers). S'il laisse passer la mise à jour, ce trigger journalise
  -- alors l'auteur réel (auth.uid()), l'utilisateur cible et les valeurs
  -- avant/après.
  INSERT INTO journal_activites (utilisateur_id, action, table_cible, avant, apres)
  VALUES (
    auth.uid(),
    'modification_role_ou_statut_utilisateur',
    'utilisateurs',
    jsonb_build_object('utilisateur_cible_id', OLD.id, 'role', OLD.role, 'actif', OLD.actif),
    jsonb_build_object('utilisateur_cible_id', NEW.id, 'role', NEW.role, 'actif', NEW.actif)
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION journaliser_changement_role_actif() IS
  'Correctif audit sécurité (IMPORTANT, cf. 0003_correctifs_securite.sql section 21) : journalise tout changement effectif de role/actif sur utilisateurs (règle métier 9). Ne bloque jamais l''opération (voir trg_empecher_auto_promotion, 0001, pour le contrôle d''autorisation) — coexistence sans conflit documentée en tête de ce fichier.';

-- AFTER UPDATE (et non BEFORE, volontairement) : garantit que ce trigger
-- s'exécute une fois que trg_empecher_auto_promotion (BEFORE UPDATE) a déjà
-- validé/laissé passer la modification. La clause WHEN restreint le
-- déclenchement aux seuls cas où role ou actif change réellement (une
-- simple modification de `nom` par un agent sur sa propre fiche, par
-- exemple, ne doit pas générer d'entrée de journal).
CREATE TRIGGER trg_journaliser_changement_role_actif
AFTER UPDATE OF role, actif ON utilisateurs
FOR EACH ROW
WHEN (NEW.role IS DISTINCT FROM OLD.role OR NEW.actif IS DISTINCT FROM OLD.actif)
EXECUTE FUNCTION journaliser_changement_role_actif();


-- =============================================================================
-- NOTE RÉCAPITULATIVE — correctifs 0003
--
--   A. [BLOQUANT résolu] entreprise_config : lecture de la table complète
--      (colonnes bancaires incluses) restreinte à is_admin() seul
--      (policy entreprise_config_lecture_admin, remplace
--      entreprise_config_lecture_authenticated de 0001). Besoin UI non
--      sensible couvert par la nouvelle vue entreprise_config_public
--      (identité/adresses/téléphones/email/NINEA/RC/logo/modalités/délai
--      proforma uniquement, aucune colonne bancaire), lisible par tout
--      authentifié.
--
--   B. [IMPORTANT résolu] utilisateurs : tout changement effectif de role
--      ou actif est désormais journalisé dans journal_activites (action
--      'modification_role_ou_statut_utilisateur', avant/après en jsonb),
--      via trg_journaliser_changement_role_actif (AFTER UPDATE), sans
--      conflit avec trg_empecher_auto_promotion (BEFORE UPDATE, 0001) qui
--      conserve seul la responsabilité d'autoriser/bloquer.
--
-- Ce fichier n'a modifié ni 0001 ni 0002. Prêt à être revérifié par
-- l'agent expert-securite.
-- =============================================================================
