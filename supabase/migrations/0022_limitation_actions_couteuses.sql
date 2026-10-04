-- =============================================================================
-- GFB-STOCK — Limitation de débit des actions coûteuses
-- =============================================================================
-- Checklist sécurité 6.1 : l'envoi de facture par e-mail (quota Resend payant,
-- risque de spam vers un client) et la génération de PDF (CPU des Edge
-- Functions) pouvaient être déclenchés sans limite par un utilisateur
-- connecté, y compris en script.
--
-- Fenêtre glissante par (utilisateur, action), stockée en base : la limite
-- tient quel que soit le chemin d'appel (Server Action, Edge Function, API).
-- Table sans aucune policy : seule la fonction SECURITY DEFINER y accède.

BEGIN;

CREATE TABLE limites_actions (
  id             bigserial PRIMARY KEY,
  utilisateur_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action         text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_limites_actions_fenetre
  ON limites_actions (utilisateur_id, action, created_at);

ALTER TABLE limites_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE limites_actions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON limites_actions FROM PUBLIC, anon, authenticated;

-- Limites fixées ici, jamais par l'appelant :
--   email_facture : 10 envois par heure et par utilisateur ;
--   pdf_document  : 60 générations par heure (téléchargement, impression,
--                   partage et e-mail en déclenchent chacun une).
-- Retourne true et enregistre l'usage si l'appelant est sous la limite ;
-- false sinon (rien n'est enregistré). Verrou consultatif par
-- (utilisateur, action) : deux appels simultanés ne dépassent pas la limite.
CREATE FUNCTION consommer_limite_action(p_action text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_max     integer;
  v_fenetre interval;
  v_usage   integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'LIMITE_ACCES_REFUSE';
  END IF;

  CASE p_action
    WHEN 'email_facture' THEN v_max := 10; v_fenetre := interval '1 hour';
    WHEN 'pdf_document'  THEN v_max := 60; v_fenetre := interval '1 hour';
    ELSE RAISE EXCEPTION 'LIMITE_ACTION_INCONNUE';
  END CASE;

  PERFORM pg_advisory_xact_lock(hashtext(v_uid::text || ':' || p_action));

  DELETE FROM limites_actions
  WHERE utilisateur_id = v_uid AND action = p_action AND created_at < now() - v_fenetre;

  SELECT count(*) INTO v_usage
  FROM limites_actions
  WHERE utilisateur_id = v_uid AND action = p_action;

  IF v_usage >= v_max THEN
    RETURN false;
  END IF;

  INSERT INTO limites_actions (utilisateur_id, action) VALUES (v_uid, p_action);
  RETURN true;
END;
$$;

COMMENT ON FUNCTION consommer_limite_action(text) IS
'Limitation de débit par utilisateur (0022). true = autorisé et comptabilisé ; false = limite atteinte sur la fenêtre glissante d''une heure.';

REVOKE ALL ON FUNCTION consommer_limite_action(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION consommer_limite_action(text) TO authenticated;

COMMIT;
