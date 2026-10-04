-- =============================================================================
-- GFB-STOCK — Bucket Storage dédié aux PDF de bon de livraison
-- Fichier : supabase/migrations/0015_bucket_bons_livraison.sql
-- Auteur  : dev-backend-edge (agent) — PAS architecte-bdd, cf. note ci-dessous
-- Objet   : crée le bucket privé `bons-livraison` + ses policies RLS
--           Storage, nécessaires à la nouvelle Edge Function
--           `generer-bon-livraison-pdf` (Phase D de l'avenant). Ce fichier NE
--           MODIFIE NI 0001, NI 0013, NI 0014 (déjà livrées) : uniquement
--           INSERT INTO storage.buckets / CREATE POLICY, méthode déjà
--           utilisée par 0001 section 15 pour les 3 buckets existants
--           (factures, produits-photos, logo).
--
-- =============================================================================
-- POURQUOI CETTE MIGRATION EXISTE (au lieu d'être dans 0013/0014)
-- =============================================================================
-- 0013_avenant_credit_entrepots.sql anticipe explicitement (section 16.2, GRANT
-- service_role) la future Edge Function `generer-bon-livraison-pdf`, mais ne
-- crée AUCUN bucket Storage pour elle : la génération de PDF (Phase D) était
-- hors du périmètre d'architecte-bdd (Phase A, uniquement le schéma SQL). Le
-- choix du bucket est donc tranché ici, par l'agent qui implémente
-- effectivement `generer-bon-livraison-pdf`, conformément au brief de cette
-- phase ("vérifie le bucket Storage à utiliser... documente ton choix").
--
-- =============================================================================
-- DÉCISION : nouveau bucket dédié `bons-livraison`, PAS réutilisation de `factures`
-- =============================================================================
-- Option A envisagée — réutiliser le bucket privé `factures` existant (0001,
-- section 15) : techniquement possible sans migration (ses policies RLS ne
-- filtrent que sur `bucket_id = 'factures'` + propriété par le 1er segment du
-- chemin, sans jamais inspecter le nom de fichier) — un chemin
-- `{agent_id}/{numero_bl}.pdf` y aurait fonctionné tel quel.
--
-- Option B retenue — bucket dédié `bons-livraison` :
--   1. Séparation des types de documents. `factures`/`produits-photos`/`logo`
--      sont déjà un bucket par type de document (0001 section 15) : un bon de
--      livraison est un document juridiquement et fonctionnellement distinct
--      d'une facture (règle 15, 0013 : "document distinct de la facture",
--      "pas de prix, un BL n'est pas un document financier") — mélanger les
--      deux dans un même bucket casserait cette séparation déjà établie par
--      convention dans tout le reste du schéma Storage.
--   2. Évolutivité indépendante. Un futur changement de policy propre aux BL
--      (ex: rétention différente, export en masse pour un audit logistique,
--      accès élargi à un rôle "livreur" hypothétique) resterait local à ce
--      bucket, sans risquer de modifier accidentellement l'accès aux factures
--      (document financier, RGPD/fiscalité plus sensible).
--   3. Clarté pour qa-testeur/expert-securite : un `SELECT * FROM
--      storage.objects WHERE bucket_id = 'bons-livraison'` audite exactement
--      les BL, sans avoir à filtrer par extension/préfixe de nom de fichier
--      dans un bucket partagé.
-- Coût de cette décision : une migration supplémentaire (ce fichier) — jugé
-- négligeable face aux bénéfices de séparation ci-dessus, et cohérent avec le
-- pattern déjà établi par ce projet (1 bucket par type de document).
--
-- =============================================================================
-- RLS — MIROIR EXACT du bucket `factures` (0001, section 15)
-- =============================================================================
-- Convention de chemin identique : {agent_id}/{numero_bl}.pdf (ex.
-- BL20260821001.pdf), pour que la policy agent puisse vérifier la propriété
-- via le 1er segment du chemin sans jamais faire confiance à une valeur
-- envoyée par le client — même raisonnement que factures (0001 section 15).
--
-- Lecture : admin (tout) + agent propriétaire uniquement (bons_livraison_
-- lecture_agent_propre, 0013 section 5, restreint déjà l'agent à SES PROPRES
-- BL au niveau table — ce même périmètre est reproduit ici au niveau Storage).
-- Écriture : aucune policy `authenticated` -> seul `service_role` (Edge
-- Function `generer-bon-livraison-pdf`) peut écrire, car `service_role`
-- contourne RLS par défaut sur Supabase (déjà vérifié table-level par 0005,
-- storage.objects est possédée par `supabase_storage_admin` avec ACL
-- `service_role=arwdDxtm` déjà accordé nativement par la plateforme).
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('bons-livraison', 'bons-livraison', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY bons_livraison_pdf_lecture_admin
  ON storage.objects FOR SELECT
  USING (bucket_id = 'bons-livraison' AND is_admin());

CREATE POLICY bons_livraison_pdf_lecture_agent_proprietaire
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'bons-livraison'
    AND is_agent_actif()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- =============================================================================
-- VÉRIFICATION MANUELLE POST-MIGRATION
-- =============================================================================
-- [ ] `SELECT id, name, public FROM storage.buckets WHERE id = 'bons-livraison';`
--     doit renvoyer 1 ligne, `public = false`.
-- [ ] `SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND
--     tablename = 'objects' AND policyname LIKE 'bons_livraison_pdf%';` doit
--     renvoyer exactement 2 lignes (lecture_admin, lecture_agent_proprietaire).
-- [ ] Connecté en agent A (compte disposant d'un BL déjà généré en PDF, chemin
--     `{A}/{numero}.pdf`) : `supabase.storage.from('bons-livraison').list(A)`
--     doit renvoyer le fichier. Le même appel avec l'id d'un AUTRE agent B en
--     préfixe doit renvoyer une liste vide (RLS deny, pas d'erreur).
--
-- =============================================================================
-- FIN DE LA MIGRATION 0015
-- =============================================================================
