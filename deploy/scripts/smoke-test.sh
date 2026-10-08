#!/usr/bin/env bash
# Test de fumee de la production GFB-STOCK. Lance automatiquement a la fin de deploy.sh,
# ou a la demande : fasso smoke   (ou deploy/scripts/smoke-test.sh [--sql-only])
#
# Verifie : HTTPS app + API, /api/health, connexion Auth impossible sans identifiants,
# PostgREST ferme sans apikey et sans droits pour un anonyme, route admin Auth fermee depuis
# Internet, buckets Storage (prives/publics), migrations toutes appliquees, triggers de la
# migration 0024 actifs, puis un test FONCTIONNEL de coherence facture <-> bon de livraison.
#
# Le test fonctionnel s'execute dans UNE transaction SQL toujours annulee (ROLLBACK) avec des
# donnees jetables (compte, client, entrepot, produit, facture, BL). Rien n'est conserve : les
# compteurs de numerotation (facture_sequences, bl_sequences) sont des lignes de table,
# donc annulees aussi (aucun trou dans les numeros de facture). Seul effet : pendant quelques
# millisecondes, la ligne du compteur du jour est verrouillee (une creation de facture
# simultanee attend), d'ou lock_timeout=5s.
#
# Options : --sql-only  ne teste que la base (pas de HTTP) ; utile hors VPS / en test.
# Code retour : 0 = tout est bon, 1 = au moins un echec.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"

SQL_ONLY=0
for a in "$@"; do
  case "$a" in
    --sql-only) SQL_ONLY=1 ;;
    -h|--help) sed -n '2,19p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "option inconnue : $a" ;;
  esac
done

exiger_docker
if [ -z "${FASSO_DB_CONTAINER:-}" ] || [ "$SQL_ONLY" = 0 ]; then charger_env; fi

NB_OK=0; NB_KO=0
reussi() { ok "$*"; NB_OK=$((NB_OK + 1)); }
echoue() { ko "$*"; NB_KO=$((NB_KO + 1)); }

http_code() { # args curl... -> code HTTP (000 si injoignable)
  curl -sS -m 20 -o /dev/null -w '%{http_code}' "$@" 2>/dev/null || echo 000
}

# Comme http_code, avec quelques essais : le certificat HTTPS peut mettre ~1 min a etre emis
# juste apres un premier deploiement.
http_code_retry() {
  local c
  for _ in 1 2 3 4 5 6; do
    c="$(http_code "$@")"; [ "$c" = 200 ] && break; sleep 5
  done
  echo "$c"
}

# ---------------------------------------------------------------------------
if [ "$SQL_ONLY" = 0 ]; then
  titre "Accès HTTPS"
  : "${DOMAIN:?}" "${API_DOMAIN:?}" "${ANON_KEY:?}"
  c="$(http_code_retry -L "https://$DOMAIN/")"
  [ "$c" = 200 ] && reussi "Application https://$DOMAIN répond (200)" || echoue "Application https://$DOMAIN : HTTP $c (DNS, certificat ou conteneur app ?)"

  c="$(http_code_retry -H "apikey: $ANON_KEY" "https://$API_DOMAIN/auth/v1/health")"
  [ "$c" = 200 ] && reussi "API https://$API_DOMAIN répond (Auth /health 200)" || echoue "API https://$API_DOMAIN : HTTP $c"

  corps="$(curl -sS -m 20 "https://$DOMAIN/api/health" 2>/dev/null || true)"
  case "$corps" in
    *'"ok":true'*) reussi "/api/health de l'application : ok" ;;
    *) echoue "/api/health : réponse inattendue (${corps:0:80})" ;;
  esac

  titre "Sécurité de l'API"
  c="$(http_code -X POST -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' -d '{}' "https://$API_DOMAIN/auth/v1/token?grant_type=password")"
  case "$c" in
    400|401|422) reussi "Connexion sans identifiants refusée (HTTP $c)" ;;
    *) echoue "Connexion sans identifiants : HTTP $c (400/401/422 attendu)" ;;
  esac

  c="$(http_code "https://$API_DOMAIN/rest/v1/")"
  [ "$c" = 401 ] && reussi "PostgREST refuse l'accès sans apikey (401)" || echoue "PostgREST sans apikey : HTTP $c (401 attendu)"

  corps="$(curl -sS -m 20 -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" "https://$API_DOMAIN/rest/v1/factures?select=id&limit=1" 2>/dev/null || true)"
  case "$corps" in
    "[]"|*'"code"'*|*'"message"'*) reussi "Un visiteur anonyme ne lit aucune facture" ;;
    *) echoue "Un visiteur anonyme obtient des données de factures : ${corps:0:80}" ;;
  esac

  c="$(http_code -H "apikey: $ANON_KEY" "https://$API_DOMAIN/auth/v1/admin/users")"
  [ "$c" = 403 ] && reussi "Route /auth/v1/admin fermée depuis Internet (403)" || echoue "/auth/v1/admin depuis Internet : HTTP $c (403 attendu)"
fi

# ---------------------------------------------------------------------------
titre "Base de données"
if ! db_psql -At -c 'select 1' >/dev/null 2>&1; then
  echoue "Base injoignable (conteneur db arrêté ? fasso status)"
  printf '\n%s%d réussi(s), %d échec(s).%s\n' "$C_RED" "$NB_OK" "$NB_KO" "$C_OFF"
  exit 1
fi

# Buckets : (id, public attendu)
attendus="factures|f bons-livraison|f rapports|f logo|t produits-photos|t"
present="$(db_psql -At -F '|' -c "select id, case when public then 't' else 'f' end from storage.buckets" 2>/dev/null || true)"
manque=""; mauvais=""
for b in $attendus; do
  id="${b%|*}"; pub="${b#*|}"
  ligne="$(printf '%s\n' "$present" | grep -E "^${id}\|" || true)"
  if [ -z "$ligne" ]; then manque="$manque $id"
  elif [ "${ligne#*|}" != "$pub" ]; then mauvais="$mauvais $id"; fi
done
[ -z "$manque" ] && reussi "Buckets Storage présents (factures, bons-livraison, rapports, logo, produits-photos)" || echoue "Buckets manquants :$manque"
[ -z "$mauvais" ] || echoue "Buckets avec une visibilité inattendue (documents privés, logo/photos publics) :$mauvais"

# Migrations : fichiers du depot vs table de suivi
fichiers="$(cd "$FASSO_ROOT/supabase/migrations" 2>/dev/null && ls -1 ./*.sql 2>/dev/null | sed 's|^\./||; s|_.*||' | sort || true)"
appliquees="$(db_psql -At -c 'select version from supabase_migrations.schema_migrations' 2>/dev/null | sort || true)"
absentes="$(comm -23 <(printf '%s\n' "$fichiers") <(printf '%s\n' "$appliquees") | tr '\n' ' ')"
nb_fichiers="$(printf '%s\n' "$fichiers" | grep -c . || true)"
if [ "$nb_fichiers" -eq 0 ]; then echoue "Aucune migration trouvée dans supabase/migrations"
elif [ -z "${absentes// /}" ]; then reussi "Migrations : les $nb_fichiers fichiers sont tous appliqués"
else echoue "Migrations non appliquées : $absentes(relancer fasso update)"; fi

# Triggers de la migration 0024
t0024="$(db_psql -At -F '|' <<'SQL' 2>/dev/null
select
 (select count(*) from pg_trigger where tgname = 'trg_bl_synchroniser_facture' and tgrelid = 'public.bons_livraison'::regclass and tgenabled = 'O'),
 (select count(*) from pg_trigger where tgname = 'trg_facture_synchroniser_bl' and tgrelid = 'public.factures'::regclass and tgenabled = 'O'),
 (select count(*) from pg_proc where proname in ('synchroniser_facture_depuis_bl', 'synchroniser_bl_depuis_facture')),
 (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'paiements' and column_name = 'bon_livraison_id');
SQL
)"
if [ "$t0024" = "1|1|2|1" ]; then reussi "Triggers de cohérence facture/bon de livraison (0024) présents et actifs"
else echoue "Triggers de la migration 0024 absents ou désactivés (résultat '$t0024', attendu '1|1|2|1')"; fi

# ---------------------------------------------------------------------------
titre "Cohérence facture <-> bon de livraison (transaction annulée)"
SORTIE="$(db_psql -v SHOW_CONTEXT=never 2>&1 <<'SQL'
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $t$
declare
  v_agent uuid := gen_random_uuid(); v_client uuid; v_ent uuid; v_prod uuid;
  v_fac uuid; v_bl uuid; v_stat text; v_n int; v_total numeric;
begin
  -- Donnees jetables (tout est annule par le ROLLBACK final). L'insertion dans auth.users
  -- declenche gerer_nouvel_utilisateur() : profil 'agent'. auth.uid() est simule via le jwt.
  insert into auth.users (id, aud, role, email, raw_user_meta_data)
  values (v_agent, 'authenticated', 'authenticated', 'smoke-' || v_agent || '@invalid.test', '{"nom":"SMOKE"}'::jsonb);
  perform set_config('request.jwt.claim.sub', v_agent::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);
  insert into clients (nom) values ('SMOKE client') returning id into v_client;
  insert into entrepots (nom) values ('SMOKE entrepot ' || v_agent) returning id into v_ent;
  insert into produits (code, nom, prix_unitaire) values ('SMOKE-' || v_agent, 'SMOKE produit', 1000) returning id into v_prod;
  insert into factures (client_id, entrepot_id, agent_id) values (v_client, v_ent, v_agent) returning id into v_fac;
  insert into lignes_facture (facture_id, produit_id, quantite, prix_unitaire) values (v_fac, v_prod, 2, 1000);
  update factures set statut = 'validee' where id = v_fac;
  select total_general into v_total from factures where id = v_fac;
  if v_total <> 2000 then raise exception 'total de facture attendu 2000, obtenu %', v_total; end if;
  insert into bons_livraison (client_id, facture_id, entrepot_id, agent_id) values (v_client, v_fac, v_ent, v_agent) returning id into v_bl;

  -- 1. BL marque paye : paiement automatique + facture payee
  update bons_livraison set statut = 'livre_paye' where id = v_bl;
  select count(*) into v_n from paiements where facture_id = v_fac and bon_livraison_id = v_bl and montant = 2000;
  if v_n <> 1 then raise exception 'BL paye : paiement automatique absent (% trouve)', v_n; end if;
  select statut::text into v_stat from factures where id = v_fac;
  if v_stat <> 'payee' then raise exception 'BL paye : facture en % au lieu de payee', v_stat; end if;
  raise notice 'SMOKE_OK:Marquer un BL payé crée le paiement et passe la facture en payée';

  -- 2. BL repasse non paye : retour en arriere
  update bons_livraison set statut = 'livre_non_paye' where id = v_bl;
  select count(*) into v_n from paiements where facture_id = v_fac;
  if v_n <> 0 then raise exception 'BL non paye : % paiement(s) restant(s)', v_n; end if;
  select statut::text into v_stat from factures where id = v_fac;
  if v_stat <> 'validee' then raise exception 'BL non paye : facture en % au lieu de validee', v_stat; end if;
  raise notice 'SMOKE_OK:Repasser le BL non payé supprime le paiement et ramène la facture à validée';

  -- 3. Sens inverse : facture payee par un paiement manuel -> BL paye
  insert into paiements (facture_id, montant, mode_paiement) values (v_fac, 2000, 'especes');
  select statut::text into v_stat from bons_livraison where id = v_bl;
  if v_stat <> 'livre_paye' then raise exception 'facture payee : BL en % au lieu de livre_paye', v_stat; end if;
  raise notice 'SMOKE_OK:Une facture soldée par paiement manuel passe son BL en livré payé';
end
$t$;
rollback;
SQL
)"
RC=$?
mapfile -t LIGNES <<<"$SORTIE"
for l in "${LIGNES[@]}"; do
  case "$l" in
    *SMOKE_OK:*) reussi "${l#*SMOKE_OK:}" ;;
  esac
done
if [ "$RC" -ne 0 ] || ! printf '%s\n' "$SORTIE" | grep -q 'SMOKE_OK:Une facture soldée'; then
  echoue "Test de cohérence en échec : $(printf '%s\n' "$SORTIE" | grep -E 'ERROR|ERREUR' | head -2 | tr '\n' ' ')"
else
  reste="$(db_psql -At <<'SQL' 2>/dev/null
select (select count(*) from public.clients where nom = 'SMOKE client')
     + (select count(*) from auth.users where email like 'smoke-%@invalid.test');
SQL
)"
  if [ "$reste" = "0" ]; then reussi "Aucune donnée conservée (transaction annulée)"
  else echoue "Des données de test subsistent ($reste ligne(s) 'SMOKE') : à supprimer manuellement"; fi
fi

# ---------------------------------------------------------------------------
echo
if [ "$NB_KO" -eq 0 ]; then
  printf '%s%s✔ Tout est en ordre : %d vérifications réussies.%s\n' "$C_BLD" "$C_GRN" "$NB_OK" "$C_OFF"
  exit 0
fi
printf '%s✘ %d échec(s), %d réussite(s). Voir les lignes en rouge ci-dessus (fasso logs <service>).%s\n' "$C_RED" "$NB_KO" "$NB_OK" "$C_OFF"
exit 1
