-- =============================================================================
-- GFB-STOCK — Données de démarrage (seed)
-- Fichier : supabase/seed.sql
-- Prérequis : supabase/migrations/0001_schema_initial.sql déjà appliqué.
-- Idempotent : peut être rejoué sans erreur (ON CONFLICT DO UPDATE/NOTHING).
-- =============================================================================


-- =============================================================================
-- 1. Informations légales/bancaires de l'entreprise (table singleton)
-- =============================================================================

INSERT INTO entreprise_config (
  id, nom, activites, adresses, telephones, email, ninea, rc,
  banque_code, banque_agence, banque_numero_compte, banque_cle_rib,
  iban, swift, modalites_reglement, validite_proforma_jours
)
VALUES (
  true,
  'GIE FASSO BARA (GFB)',
  -- Activités et adresses corrigées suite au retour client réel du
  -- 2026-08-05 (migration 0008_remise_et_infos_entreprise.sql) : ces listes
  -- REMPLACENT les anciennes valeurs, elles ne les complètent pas.
  ARRAY['Agriculture', 'Commerce Général Import & Export', 'Energie', 'Prestation de Service'],
  ARRAY['Mboro', 'Notto', 'Dakar', 'Keur Massar'],
  ARRAY['(+221) 77 117 72 15', '(+221) 77 627 50 17'],
  'alhassanedeis@gmail.com',
  '011279735',
  '1621B 997 Thiès',
  'SN048',
  '04001',
  '0003007800-04',
  '66',
  'SN08 SN04 8040 0100 0300 7800 466',
  'CADKSNDA',
  'Règlement 100% à la commande.',
  15
)
ON CONFLICT (id) DO UPDATE SET
  nom = EXCLUDED.nom,
  activites = EXCLUDED.activites,
  adresses = EXCLUDED.adresses,
  telephones = EXCLUDED.telephones,
  email = EXCLUDED.email,
  ninea = EXCLUDED.ninea,
  rc = EXCLUDED.rc,
  banque_code = EXCLUDED.banque_code,
  banque_agence = EXCLUDED.banque_agence,
  banque_numero_compte = EXCLUDED.banque_numero_compte,
  banque_cle_rib = EXCLUDED.banque_cle_rib,
  iban = EXCLUDED.iban,
  swift = EXCLUDED.swift,
  modalites_reglement = EXCLUDED.modalites_reglement,
  validite_proforma_jours = EXCLUDED.validite_proforma_jours,
  updated_at = now();


-- =============================================================================
-- Catalogue vide au premier lancement.
-- L'entreprise ajoute ses propres categories et produits depuis l'interface.
-- Les deploiements ne reinjectent aucun produit ni categorie.
-- =============================================================================


-- =============================================================================
-- 2. AVENANT MULTI-ENTREPÔTS (0013_avenant_credit_entrepots.sql) — entrepôts
-- Prérequis supplémentaire : 0013_avenant_credit_entrepots.sql déjà appliqué.
--
-- L'entrepôt "Siège" (Mboro) est déjà créé de façon idempotente PAR LA
-- MIGRATION ELLE-MÊME (0013, section 11 — nécessaire pour le backfill des
-- données déjà en production au moment de l'avenant, donc ne peut pas
-- dépendre de ce fichier seed, qui n'est jamais rejoué automatiquement sur un
-- projet Supabase distant). L'INSERT ci-dessous est donc redondant avec la
-- migration pour "Siège" (ON CONFLICT DO NOTHING, sans effet si déjà créé) ;
-- il sert surtout à ajouter les AUTRES sites réels de GFB (cf.
-- entreprise_config.adresses ci-dessus : Mboro, Notto, Dakar, Keur Massar)
-- pour disposer d'un jeu de données multi-entrepôts réaliste dès un
-- `supabase db reset` local (démonstration/QA de la règle métier 16 :
-- transferts inter-entrepôts, stock indépendant par site).
INSERT INTO entrepots (nom, adresse, actif) VALUES
  ('Siège', 'Mboro', true),
  ('Notto', 'Notto', true),
  ('Dakar', 'Dakar', true),
  ('Keur Massar', 'Keur Massar', true)
ON CONFLICT (nom) DO NOTHING;

-- Seuil de crédit global (règle métier 12) : reste à 0 (crédit désactivé) par
-- défaut même après le seed — voir 0013_avenant_credit_entrepots.sql section
-- 9 pour la justification du fail-safe. À configurer explicitement par un
-- admin depuis l'écran Paramètres avant de pouvoir ouvrir un premier crédit
-- client, ex. :
--   UPDATE entreprise_config SET seuil_credit_max = 500000 WHERE id = true;


-- =============================================================================
-- 4. Bootstrap du premier administrateur (à faire manuellement, hors seed SQL)
-- =============================================================================
-- Ce script ne peut PAS créer de compte administrateur car auth.users est géré
-- par le service Supabase Auth (hash de mot de passe, etc.), jamais par une
-- simple insertion SQL. Étapes à suivre une fois le schéma déployé :
--
--   1. Créer un compte normalement via l'écran de connexion / Supabase Auth
--      (inscription email+mot de passe, ou invitation depuis le Dashboard).
--      Le trigger gerer_nouvel_utilisateur() lui attribue automatiquement le
--      rôle 'agent' par défaut (règle 8 : jamais d'auto-élévation).
--   2. Depuis le SQL Editor de Supabase (connecté en tant que postgres, donc
--      hors RLS), promouvoir ce compte en admin :
--
--        UPDATE public.utilisateurs SET role = 'admin' WHERE id =
--          (SELECT id FROM auth.users WHERE email = 'admin@example.com');
--
--   3. Vérifier avec `SELECT * FROM public.utilisateurs;` que le rôle est
--      bien 'admin' et actif = true.
-- =============================================================================


-- =============================================================================
-- 5. CHECKLIST DE VÉRIFICATION MANUELLE
-- (À exécuter après migration + seed, idéalement depuis le SQL Editor
-- Supabase avec deux comptes de test : un admin et un agent.)
-- =============================================================================
--
-- [ ] ENUMS — SELECT unnest(enum_range(NULL::statut_facture)); doit renvoyer
--     les 6 valeurs (brouillon, proforma, validee, payee_partielle, payee,
--     annulee).
--
-- [ ] SEED — SELECT code, nom, prix_unitaire, type_ligne_produit,
--     kit_parent_id FROM produits ORDER BY code; doit renvoyer les 6
--     références, avec SV1/S-307/S-316 en inclus_dans_kit et kit_parent_id
--     pointant vers HYB1-3(⌀27mm).
--
-- [ ] NUMÉROTATION (règle 1) — Insérer 2 factures brouillon le même jour
--     (même transaction ou depuis 2 sessions) : vérifier que numero est
--     bien FPAAAAMMJJ001 puis FPAAAAMMJJ002, jamais de doublon. Tenter
--     d'insérer explicitement un `numero` arbitraire : vérifier qu'il est
--     ignoré et remplacé par le numéro généré.
--
-- [ ] TOTAUX (règle 2) — Créer une facture brouillon, y ajouter 2 lignes
--     (ex: 1 x HYB1-3 à 19500 + 4 x PEHD à 53500), vérifier que
--     total_ht = 19500 + 4*53500 = 233 500, que total_general = total_ht
--     (tva_taux=0, forfait_transport=0 par défaut), puis modifier
--     forfait_transport à 2000 et vérifier que total_general suit
--     automatiquement (= 235 500) sans réinsérer de ligne.
--
-- [ ] REMISE (règle 2 étendue, cf. migration 0008) — Créer une facture
--     brouillon, ajouter 1 ligne à total_ht = 233 500, forfait_transport =
--     2000, tva_taux = 0 : total_general = 235 500. Exécuter `UPDATE
--     factures SET remise_montant = 10000 WHERE id = ...` : vérifier que
--     total_general se recalcule automatiquement (sans réinsérer de ligne)
--     à 225 500. Repasser tva_taux à 0.18 : vérifier total_general = 265 070.
--     Enfin, tester remise_montant = 999999 (> total_ht) : vérifier que
--     total_general ne descend jamais sous forfait_transport (assiette
--     plafonnée à 0 par GREATEST, jamais de valeur négative).
--
-- [ ] KIT (règle 3) — Ajouter une ligne sur SV1(3/4'') (inclus_dans_kit)
--     avec un prix_unitaire envoyé à 5000 par le client : vérifier que la
--     ligne enregistrée a bien prix_unitaire = 0 et total_ligne = 0, quelle
--     que soit la quantité.
--
-- [ ] STOCK INSUFFISANT (règle 4) — Sur un produit avec quantite_stock=5,
--     créer une ligne de quantite=999 puis tenter de passer la facture en
--     statut 'validee' : l'UPDATE doit échouer avec une exception "Stock
--     insuffisant..." et la facture doit rester au statut précédent.
--
-- [ ] DÉCRÉMENT/RESTAURATION (règles 4 et 5) — Sur un produit avec
--     quantite_stock=50, créer une facture avec une ligne quantite=3, la
--     passer à 'validee' : vérifier quantite_stock=47 et qu'un
--     mouvements_stock de type 'sortie' quantite=3 a été créé. Passer
--     ensuite la même facture à 'annulee' : vérifier que quantite_stock
--     revient à 50 et qu'un mouvements_stock de type 'entree' quantite=3 a
--     été créé, ainsi qu'une ligne journal_activites action=
--     'annulation_facture'.
--
-- [ ] ALERTE STOCK (règle 6) — Mettre à jour quantite_stock d'un produit à
--     une valeur <= seuil_alerte (ex: via un ajustement manuel admin) :
--     vérifier qu'une ligne alertes_stock est créée avec lue=false, et
--     qu'aucune 2e ligne n'est créée si le produit reste sous le seuil lors
--     d'une mise à jour suivante. Remonter le stock au-dessus du seuil :
--     vérifier que l'alerte passe à lue=true.
--
-- [ ] PAIEMENT (règle 7) — Sur une facture validée avec total_general =
--     100 000, insérer un paiement de 40 000 : vérifier statut =
--     'payee_partielle'. Insérer un second paiement de 60 000 : vérifier
--     statut = 'payee'. Tenter d'insérer un paiement sur une facture encore
--     'brouillon' : doit échouer.
--
-- [ ] RLS AGENT / AGENT (règle 8) — Avec 2 comptes agent A et B : A crée une
--     facture brouillon. Vérifier que B ne peut ni la SELECT ni l'UPDATE
--     (0 ligne retournée / erreur RLS), même en connaissant son id.
--
-- [ ] RLS AGENT / STATUT (règle 8) — A fait passer sa facture de 'brouillon'
--     à 'validee'. Vérifier que A ne peut plus ensuite UPDATE cette même
--     facture (0 ligne affectée), alors qu'un admin le peut toujours.
--
-- [ ] RLS STOCK (règle 8) — Connecté en tant qu'agent, tenter
--     `UPDATE produits SET quantite_stock = 0 WHERE id = ...` directement :
--     doit être refusé par RLS (0 ligne affectée). Tenter un INSERT direct
--     dans mouvements_stock : doit être refusé.
--
-- [ ] USURPATION D'IDENTITÉ (règle 8) — Connecté en tant qu'agent A, tenter
--     d'insérer une facture avec agent_id = <uid de B> : doit être refusé
--     par le WITH CHECK de la policy factures_creation_agent.
--
-- [ ] AUTO-PROMOTION (règle 8, ajout) — Connecté en tant qu'agent, tenter
--     `UPDATE utilisateurs SET role = 'admin' WHERE id = auth.uid()` : doit
--     lever l'exception "Seul un administrateur peut modifier le rôle...".
--
-- [ ] STORAGE — Uploader un PDF de test sous factures/{agent_id}/test.pdf
--     avec la session de cet agent : doit réussir en lecture pour lui-même,
--     échouer en lecture pour un autre agent, réussir en lecture pour
--     l'admin. Uploader une photo dans produits-photos avec une session
--     agent : doit être refusé (écriture admin uniquement) ; la lecture
--     doit fonctionner même sans authentification (bucket public).
--
-- [ ] PG_CRON / REALTIME — Vérifier `SELECT * FROM cron.job WHERE jobname =
--     'scan-alertes-stock-quotidien';` (1 ligne, schedule '0 6 * * *') et
--     que la table alertes_stock apparaît bien dans
--     `SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';`.
--
-- [ ] AVENANT MULTI-ENTREPÔTS (0013_avenant_credit_entrepots.sql, règle 16) —
--     `SELECT nom FROM entrepots ORDER BY nom;` doit renvoyer 4 lignes
--     (Dakar, Keur Massar, Notto, Siège). `SELECT COUNT(*) FROM
--     stock_entrepot WHERE entrepot_id = (SELECT id FROM entrepots WHERE
--     nom = 'Siège');` doit être égal au nombre de produits du catalogue
--     (6). Voir la checklist complète (backfill, décrément par entrepôt,
--     transferts, crédit, RLS) directement en fin de
--     supabase/migrations/0013_avenant_credit_entrepots.sql (section 17).
--
-- =============================================================================
-- FIN DU SEED
-- =============================================================================
