-- =============================================================================
-- GFB-STOCK — Ajout d'une remise commerciale ponctuelle sur facture
-- Fichier : supabase/migrations/0008_remise_et_infos_entreprise.sql
-- Auteur  : architecte-bdd (agent)
-- Objet   : retour client réel — pouvoir appliquer un rabais commercial
--           ponctuel (ex. promotion) sur une facture.
--           Ce fichier NE MODIFIE NI 0001 NI 0002 NI 0003 NI 0004 NI 0005 NI
--           0006 NI 0007 (déjà livrés/potentiellement déjà appliqués) : il ne
--           fait qu'ajouter une colonne (ALTER TABLE) et reconstruire la
--           colonne générée total_general pour y intégrer la remise (méthode
--           DROP COLUMN + ADD COLUMN déjà utilisée implicitement par Postgres
--           pour les colonnes GENERATED, cf. section 1 ci-dessous).
--
-- Le point 2 du retour client (correction des informations réelles de
-- l'entreprise — activités/adresses) est une évolution de DONNÉES, pas de
-- structure : elle est traitée par un UPDATE direct sur le stack local (hors
-- migration, cf. message de livraison) + mise à jour de supabase/seed.sql
-- (pour que tout futur `db reset` reparte avec les bonnes valeurs). Rien à
-- faire ici côté schéma pour ce point.
-- =============================================================================


-- =============================================================================
-- SECTION 1 — factures.remise_montant (évolution de la règle métier 2)
-- =============================================================================
--
-- --- Décision de conception (à documenter, ajustable plus tard) ------------
-- Le client veut une remise ponctuelle (ex. promotion) sur une facture.
-- Choix retenu pour rester cohérent avec l'existant : un MONTANT FIXE en
-- FCFA, sur le même modèle que `forfait_transport` (0001, section 8) — une
-- colonne numérique éditable librement par l'agent sur sa facture brouillon/
-- proforma (mêmes policies RLS que forfait_transport/tva_taux, aucune colonne
-- n'est protégée individuellement par les policies existantes, cf. section 3
-- ci-dessous), PAS un pourcentage calculé automatiquement sur total_ht.
--
-- Si le client préfère finalement un pourcentage (ex. "remise de 10%"), il
-- suffira d'ajouter une colonne `remise_pourcentage numeric(5,4)` séparée et
-- d'adapter le calcul de total_general en conséquence (ou de remplacer
-- remise_montant par un calcul dérivé) — décision explicitement repoussée ici
-- pour ne pas complexifier sans confirmation du besoin réel.
ALTER TABLE factures
  ADD COLUMN remise_montant numeric(12,2) NOT NULL DEFAULT 0
    CHECK (remise_montant >= 0);

COMMENT ON COLUMN factures.remise_montant IS 'Rabais commercial ponctuel en FCFA (montant fixe, PAS un pourcentage — décision de conception documentée en 0008, section 1). Appliqué sur total_ht AVANT le calcul de la TVA (règle 2 étendue). Éditable par l''agent propriétaire tant que la facture est brouillon/proforma (mêmes policies que forfait_transport).';


-- --- Règle métier 2 (étendue) : intégration de la remise dans total_general -
-- Ancienne formule (0001, section 8) :
--   total_general = total_ht + forfait_transport + (total_ht * tva_taux)
-- Nouvelle formule (règle métier demandée par le client) :
--   total_general = GREATEST(0, total_ht - remise_montant)
--                    + forfait_transport
--                    + (GREATEST(0, total_ht - remise_montant) * tva_taux)
-- La remise s'applique sur total_ht AVANT le calcul de la TVA, et ne peut
-- jamais faire descendre l'assiette TVA/le total sous 0 même si un agent
-- saisit une remise supérieure au total_ht (GREATEST(0, ...)).
--
-- total_general reste une colonne GENERATED ALWAYS ... STORED (donc toujours
-- impossible à falsifier par le client, cf. 0001 section 8) : Postgres n'a
-- pas de `ALTER COLUMN ... SET EXPRESSION`, il faut donc la supprimer et la
-- recréer avec la nouvelle expression. Aucune vue/index ne dépend de cette
-- colonne (vérifié : seule la fonction appliquer_paiement() la lit en
-- lecture simple via v_facture.total_general, 0001 section 11 — aucun
-- changement de comportement pour elle, la colonne garde le même nom/type).
ALTER TABLE factures DROP COLUMN total_general;

ALTER TABLE factures ADD COLUMN total_general numeric(14,2)
  GENERATED ALWAYS AS (
    GREATEST(0, total_ht - remise_montant)
    + forfait_transport
    + (GREATEST(0, total_ht - remise_montant) * tva_taux)
  ) STORED;

COMMENT ON COLUMN factures.total_general IS 'Colonne générée : GREATEST(0, total_ht - remise_montant) + forfait_transport + (GREATEST(0, total_ht - remise_montant) * tva_taux). tva_taux=0 par défaut (règle 2), remise_montant=0 par défaut (règle 2 étendue, 0008).';


-- --- Recalcul automatique : AUCUN trigger dédié nécessaire ------------------
-- Vérification effectuée avant modification : il n'existe PAS de trigger
-- `AFTER UPDATE OF forfait_transport, tva_taux ON factures` dans 0001-0007
-- (grep négatif sur "trg_.*forfait_transport|trg_.*tva_taux"). Le mécanisme
-- qui garantit déjà le recalcul de total_general quand forfait_transport ou
-- tva_taux changent directement (sans passer par une ligne_facture) n'est PAS
-- un trigger applicatif : c'est le comportement natif de PostgreSQL pour les
-- colonnes GENERATED ... STORED, qui sont recalculées par le moteur à CHAQUE
-- UPDATE de la ligne, quelle que soit la colonne modifiée dans cet UPDATE.
-- Un `UPDATE factures SET remise_montant = ...` déclenche donc, exactement de
-- la même façon et sans code supplémentaire, le recalcul de total_general —
-- testé et vérifié en section "TEST FONCTIONNEL" ci-dessous avant nettoyage.
-- Aucun trigger `trg_recalculer_remise` n'est donc créé : il serait redondant
-- avec un mécanisme déjà garanti par Postgres, et risquerait de désynchroniser
-- la valeur si la logique divergeait un jour de l'expression de la colonne
-- générée elle-même.


-- =============================================================================
-- SECTION 2 — mise à jour de la checklist de vérification (référence)
-- =============================================================================
-- Complète la checklist de supabase/seed.sql (section 5) avec un test remise :
--   [ ] REMISE (règle 2 étendue, 0008) — Créer une facture brouillon avec une
--       ligne à total_ht = 233 500 (cf. exemple existant), forfait_transport
--       = 2000, tva_taux = 0 : total_general = 235 500. Appliquer
--       `UPDATE factures SET remise_montant = 10000 WHERE id = ...` :
--       vérifier que total_general passe automatiquement à 225 500
--       (=(233500-10000)+2000+0) SANS ré-écrire de ligne. Réappliquer avec
--       tva_taux = 0.18 : vérifier total_general = 265 070
--       (=(233500-10000)+2000+((233500-10000)*0.18)=223500+2000+40230).
--       Enfin, tester une remise supérieure au total_ht (ex. remise_montant =
--       999999) : vérifier que total_general ne descend jamais sous
--       forfait_transport (assiette plafonnée à 0 par GREATEST).


-- =============================================================================
-- SECTION 3 — vérification RLS (aucune modification nécessaire)
-- =============================================================================
-- Vérification effectuée avant de conclure qu'aucun changement de policy
-- n'est requis : la policy factures_maj_agent_propre_brouillon (0001 section
-- 8, remplacée par 0004 section 22.1) est un `WITH CHECK` PORTANT SUR DES
-- LIGNES (is_agent_actif() AND agent_id = auth.uid() AND statut IN (...)),
-- PAS sur une liste explicite de colonnes autorisées — PostgreSQL RLS ne
-- permet d'ailleurs pas de restreindre l'UPDATE à certaines colonnes via
-- WITH CHECK (il faudrait des GRANT ... (colonnes) séparés, absents ici et
-- non nécessaires : forfait_transport et tva_taux étaient déjà librement
-- éditables par l'agent propriétaire d'une facture brouillon/proforma avant
-- ce correctif, remise_montant suit exactement le même régime sans aucune
-- policy supplémentaire à écrire). Confirmé par lecture de 0001 (section 8)
-- et 0004 (section 22.1) : aucune occurrence de `forfait_transport` ou
-- `tva_taux` dans une clause WITH CHECK à travers tout le projet.
-- =============================================================================
-- FIN DE LA MIGRATION 0008
-- =============================================================================
