-- =============================================================================
-- GFB-STOCK — Alerte de retard de paiement (J+10)
-- Fichier : supabase/migrations/0009_alertes_paiement.sql
-- Auteur  : architecte-bdd (agent)
-- Objet   : reprend fidèlement le pattern déjà utilisé pour l'alerte de stock
--           bas (0001, section 12 "TABLE alertes_stock + RLS + trigger
--           verifier_seuil_stock()" et section 16
--           "scanner_alertes_stock_quotidien()") pour une nouvelle règle
--           métier : signaler les factures dont le solde reste dû plus de
--           10 jours après leur validation.
--
-- Ce fichier NE MODIFIE NI 0001 NI 0002 NI 0003 NI 0004 NI 0005 NI 0006 NI
-- 0007 NI 0008 (déjà livrées/potentiellement déjà appliquées) : uniquement
-- des objets nouveaux (vue, table, fonctions, cron, publication Realtime).
--
-- Règle métier (nouvelle, numérotée ici "règle 10" pour rester cohérent avec
-- la numérotation 1-9 de 0001) :
--   10. Une facture est "en retard de paiement" quand :
--       - statut IN ('validee', 'payee_partielle')  (jamais brouillon/
--         proforma/payee/annulee — une facture 'payee' n'a par définition
--         plus de solde, une facture 'annulee' n'a jamais du tout dû être
--         payée)
--       - ET date_validation remonte à plus de 10 jours (jours_de_retard =
--         GREATEST(0, CURRENT_DATE - date_validation::date - 10) > 0)
--       - ET le solde restant (total_general - somme des paiements) est > 0.
--       Le nombre de jours de retard se RECALCULE dynamiquement chaque jour
--       (contrairement à alertes_stock, il n'y a pas de "fermeture manuelle"
--       d'une alerte de retard : elle se résorbe automatiquement dès que la
--       facture est soldée/annulée/repassée sous 10 jours, cf. section 3).
-- =============================================================================


-- =============================================================================
-- SECTION 1 — VUE v_factures_retard_paiement
-- =============================================================================
--
-- `security_invoker = true` est indispensable ici : par défaut (security
-- definer implicite d'une vue Postgres classique), une vue s'exécute avec les
-- droits de son PROPRIÉTAIRE (postgres, qui contourne RLS), ce qui exposerait
-- TOUTES les factures en retard à TOUT utilisateur authentifié capable de
-- lire la vue — violation directe de la règle 8 ("agent : accès restreint à
-- ses propres factures"). Avec security_invoker = true, Postgres réévalue les
-- policies RLS de `factures` et `paiements` avec le rôle de l'APPELANT de la
-- vue : un agent authentifié qui interroge v_factures_retard_paiement ne voit
-- donc, via les policies déjà existantes `factures_lecture_agent_propre`
-- (agent_id = auth.uid()) et `paiements_lecture_agent_propre`
-- (EXISTS ... f.agent_id = auth.uid()), QUE ses propres factures en retard ;
-- un admin (`factures_admin_all` / `paiements_admin_all`) les voit toutes.
-- Aucune policy RLS supplémentaire n'est donc nécessaire sur la vue
-- elle-même : elle hérite entièrement du périmètre déjà garanti par les
-- policies des tables sous-jacentes (règle 8).
--
-- jours_de_retard est calculé sur date_validation::date (pas timestamptz) :
-- une facture validée le matin ou le soir du même jour J compte le même
-- nombre de jours de retard, cohérent avec un calcul en jours calendaires.
CREATE VIEW v_factures_retard_paiement
WITH (security_invoker = true) AS
SELECT
  f.id                                                            AS facture_id,
  f.numero,
  f.client_id,
  c.nom                                                           AS client_nom,
  c.telephone                                                     AS client_telephone,
  f.agent_id,
  u.nom                                                            AS agent_nom,
  f.statut,
  f.total_general,
  f.total_general - COALESCE(p.total_paye, 0)                     AS solde_restant,
  f.date_facture,
  f.date_validation,
  GREATEST(0, (CURRENT_DATE - f.date_validation::date) - 10)      AS jours_de_retard
FROM factures f
JOIN clients c ON c.id = f.client_id
JOIN utilisateurs u ON u.id = f.agent_id
LEFT JOIN (
  SELECT facture_id, SUM(montant) AS total_paye
  FROM paiements
  GROUP BY facture_id
) p ON p.facture_id = f.id
WHERE f.statut IN ('validee', 'payee_partielle')
  AND f.date_validation IS NOT NULL
  AND GREATEST(0, (CURRENT_DATE - f.date_validation::date) - 10) > 0
  AND (f.total_general - COALESCE(p.total_paye, 0)) > 0;

COMMENT ON VIEW v_factures_retard_paiement IS 'Règle métier 10 : factures validées/partiellement payées dont le solde reste dû plus de 10 jours après date_validation. security_invoker=true => hérite strictement des policies RLS de factures/paiements (un agent n''y voit que ses propres factures, un admin les voit toutes), recalculée dynamiquement à chaque interrogation (pas de "fermeture" manuelle nécessaire).';


-- =============================================================================
-- SECTION 2 — TABLE alertes_factures + RLS
-- Miroir exact de alertes_stock (0001, section 12).
-- =============================================================================

CREATE TABLE alertes_factures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id      uuid NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  jours_de_retard integer NOT NULL,
  message         text NOT NULL,
  lue             boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE alertes_factures IS 'Règle métier 10 : alertes de retard de paiement (J+10), au plus une alerte lue=false par facture à tout instant (upsert applicatif géré par scanner_alertes_factures_impayees(), section 3).';

CREATE INDEX idx_alertes_factures_facture_id ON alertes_factures(facture_id);
CREATE INDEX idx_alertes_factures_lue ON alertes_factures(lue) WHERE lue = false;

ALTER TABLE alertes_factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertes_factures FORCE ROW LEVEL SECURITY;

-- set_updated_at() est la fonction générique déjà définie en 0001 (section 2,
-- utilisée entre autres par trg_alertes_stock_updated_at) : on la réutilise
-- ici sans en recréer une nouvelle.
CREATE TRIGGER trg_alertes_factures_updated_at
BEFORE UPDATE ON alertes_factures
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Admin uniquement (règle 8 ; même raisonnement que alertes_stock_admin_all,
-- 0001 section 12 : l'agent n'a pas de visibilité opérationnelle sur le
-- centre d'alertes, seulement sur ses propres factures/paiements via
-- v_factures_retard_paiement).
CREATE POLICY alertes_factures_admin_all
  ON alertes_factures FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());


-- =============================================================================
-- SECTION 3 — FONCTION scanner_alertes_factures_impayees()
-- Miroir de scanner_alertes_stock_quotidien() (0001, section 16).
-- =============================================================================
CREATE OR REPLACE FUNCTION scanner_alertes_factures_impayees()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  -- Règle métier 10 : au plus une alerte NON LUE par facture à tout instant.
  -- (a) Si une facture de v_factures_retard_paiement n'a pas encore d'alerte
  --     non lue, on la crée. Si elle en a déjà une, on met à jour
  --     jours_de_retard/message/updated_at plutôt que d'en insérer une
  --     seconde (évite le doublon, garde l'historique "lue" éventuel intact).
  -- NB : cette fonction est SECURITY DEFINER et lit directement les tables
  -- sous-jacentes (pas la vue security_invoker) via cette boucle, ce qui est
  -- volontaire : le scan doit couvrir TOUTES les factures en retard, tous
  -- agents confondus, quel que soit le rôle qui a déclenché pg_cron.
  FOR r IN
    SELECT * FROM v_factures_retard_paiement
  LOOP
    UPDATE alertes_factures
    SET jours_de_retard = r.jours_de_retard,
        message = format('Facture %s en retard de paiement (%s jours).', r.numero, r.jours_de_retard),
        updated_at = now()
    WHERE facture_id = r.facture_id AND lue = false;

    IF NOT FOUND THEN
      INSERT INTO alertes_factures (facture_id, jours_de_retard, message, lue)
      VALUES (
        r.facture_id,
        r.jours_de_retard,
        format('Facture %s en retard de paiement (%s jours).', r.numero, r.jours_de_retard),
        false
      );
    END IF;
  END LOOP;

  -- (b) Auto-résolution : toute alerte non lue dont la facture n'apparaît
  -- plus dans v_factures_retard_paiement (facture soldée, annulée, ou
  -- repassée sous les 10 jours après un correctif de date_validation) est
  -- marquée lue=true, même esprit que l'auto-résolution des alertes stock au
  -- réapprovisionnement (verifier_seuil_stock(), 0001 section 12).
  UPDATE alertes_factures af
  SET lue = true, updated_at = now()
  WHERE af.lue = false
    AND NOT EXISTS (
      SELECT 1 FROM v_factures_retard_paiement v WHERE v.facture_id = af.facture_id
    );
END;
$$;

COMMENT ON FUNCTION scanner_alertes_factures_impayees() IS 'Règle métier 10. Miroir de scanner_alertes_stock_quotidien() (0001, section 16) : upsert d''une alerte non lue par facture en retard (via v_factures_retard_paiement) + auto-résolution des alertes non lues devenues obsolètes.';


-- =============================================================================
-- SECTION 4 — PG_CRON : scan quotidien des retards de paiement
-- =============================================================================

-- Extension déjà activée (ou tentée) en 0001 section 16 ; on retente ici par
-- prudence avec le même bloc défensif, au cas où cette migration serait
-- appliquée sur une base où 0001 aurait échoué à l'activer (ex. droits
-- accordés entre-temps sur le projet Supabase).
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
EXCEPTION WHEN insufficient_privilege OR feature_not_supported THEN
  RAISE NOTICE 'pg_cron non activable automatiquement ici : activez-le depuis Dashboard > Database > Extensions, puis relancez le bloc cron.schedule() de la section 4 de 0009_alertes_paiement.sql.';
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'scan-alertes-factures-quotidien',
    '0 6 * * *',
    $cron$SELECT scanner_alertes_factures_impayees();$cron$
  );
EXCEPTION WHEN undefined_table OR undefined_function OR insufficient_privilege THEN
  RAISE NOTICE 'Planification pg_cron non effectuée (extension pg_cron indisponible) : à relancer manuellement une fois pg_cron activé, via SELECT cron.schedule(''scan-alertes-factures-quotidien'', ''0 6 * * *'', ''SELECT scanner_alertes_factures_impayees();'');';
END $$;

-- --- Documentation (aucun code exécuté) — second job optionnel à venir -----
-- Sur le même modèle que le second job optionnel décrit pour l'alerte de
-- stock bas (voir supabase/functions/alerte-stock-bas/README.md, section
-- "Câblage pg_cron recommandé"), un futur job `pg_cron` optionnel
-- 'alerte-facture-impayee-edge-broadcast' pourra être ajouté PLUS TARD (pas
-- ici) pour appeler, via l'extension `pg_net`, une Edge Function
-- (ex. supabase/functions/alerte-facture-impayee/) qui diffuserait un
-- événement Realtime Broadcast enrichi (numéro, client, montant dû, jours de
-- retard déjà agrégés) en complément du flux `postgres_changes` brut déjà
-- obtenu par l'ajout de alertes_factures à la publication supabase_realtime
-- (section 5 ci-dessous). Exemple indicatif (NE PAS exécuter tel quel) :
--
--   SELECT cron.schedule(
--     'alerte-facture-impayee-edge-broadcast',
--     '5 6 * * *',  -- 5 minutes après le scan SQL direct
--     $$
--     SELECT net.http_post(
--       url := '<SUPABASE_URL>/functions/v1/alerte-facture-impayee',
--       headers := jsonb_build_object(
--         'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY_EN_SECRET_VAULT>',
--         'Content-Type', 'application/json'
--       ),
--       body := '{}'::jsonb
--     );
--     $$
--   );
--
-- La clé service_role NE DOIT JAMAIS être committée en clair dans une
-- migration versionnée : elle doit être stockée via `vault.create_secret()` /
-- Supabase Vault, ou ce job doit être câblé manuellement depuis le Dashboard
-- (Database > Cron Jobs), exactement comme documenté pour
-- alerte-stock-bas-edge-broadcast. Câblage volontairement NON fait ici :
-- objet réservé à une prochaine itération, hors périmètre du présent lot.


-- =============================================================================
-- SECTION 5 — REALTIME : publication supabase_realtime
-- =============================================================================
-- Bloc idempotent, copié à l'identique du pattern de 0006 : `ALTER
-- PUBLICATION ... ADD TABLE` lève `duplicate_object` si la table est déjà
-- présente (ex. migration rejouée) ; on l'ignore silencieusement pour
-- permettre un `supabase db reset` sans erreur.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE alertes_factures;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;


-- =============================================================================
-- SECTION 6 — GRANTS
-- =============================================================================
-- Même logique que 0001 section 17 : accès table-level accordé à
-- `authenticated`, le filtrage fin restant assuré par RLS (policy
-- alertes_factures_admin_all -> seul un admin obtient réellement des lignes).
-- La vue v_factures_retard_paiement est en security_invoker : le SELECT
-- accordé ici ne fait que permettre l'exécution de la requête sous-jacente,
-- dont le résultat reste filtré par les policies RLS de factures/paiements/
-- clients/utilisateurs déjà en place (règle 8).
GRANT SELECT ON v_factures_retard_paiement TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON alertes_factures TO authenticated;

-- Aucun droit accordé au rôle anon (règle 8 : authentification obligatoire).


-- =============================================================================
-- SECTION 7 — CHECKLIST DE VÉRIFICATION MANUELLE
-- =============================================================================
-- [ ] Créer une facture, la valider (statut='validee'), puis forcer
--     manuellement date_validation à il y a 15 jours :
--       UPDATE factures SET date_validation = now() - interval '15 days'
--       WHERE id = '<id>';
--     -> SELECT * FROM v_factures_retard_paiement WHERE facture_id = '<id>';
--     doit renvoyer 1 ligne avec jours_de_retard = 5 et solde_restant =
--     total_general (aucun paiement encore enregistré).
-- [ ] Exécuter `SELECT scanner_alertes_factures_impayees();` : vérifier
--     qu'une ligne apparaît dans alertes_factures (lue=false) avec le bon
--     message et jours_de_retard=5.
-- [ ] Relancer le scan une seconde fois sans rien changer : vérifier qu'AUCUNE
--     nouvelle ligne n'est créée (upsert sur l'alerte non lue existante),
--     seulement updated_at qui avance.
-- [ ] Enregistrer un paiement soldant intégralement la facture (paiements),
--     relancer le scan : vérifier que la facture disparaît de
--     v_factures_retard_paiement ET que l'alerte existante passe lue=true
--     (auto-résolution).
-- [ ] Se connecter en tant qu'agent A (autre que le propriétaire de la
--     facture testée) : `SELECT * FROM v_factures_retard_paiement;` ne doit
--     renvoyer AUCUNE ligne pour les factures d'un autre agent (test RLS
--     security_invoker). Se connecter en tant qu'agent propriétaire : la
--     facture en retard doit apparaître. Se connecter en tant qu'admin :
--     toutes les factures en retard, tous agents confondus, doivent
--     apparaître.
-- [ ] `SELECT * FROM alertes_factures;` en tant qu'agent (via API/anon key +
--     JWT agent) doit renvoyer 0 ligne (aucune policy SELECT agent -> deny by
--     default), conformément à alertes_stock.
-- [ ] `SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname
--     = 'supabase_realtime' ORDER BY tablename;` doit désormais inclure
--     `alertes_factures` en plus des tables déjà listées en 0001/0006.
-- [ ] `SELECT jobname, schedule FROM cron.job WHERE jobname =
--     'scan-alertes-factures-quotidien';` (si pg_cron est actif) doit
--     renvoyer 1 ligne avec schedule = '0 6 * * *'.

-- =============================================================================
-- FIN DE LA MIGRATION 0009
-- =============================================================================
