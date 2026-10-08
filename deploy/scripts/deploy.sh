#!/usr/bin/env bash
# Deploiement GFB-STOCK sur le VPS.
#   deploy/scripts/deploy.sh [deploy]   build + up + migrations + healthcheck
#   deploy/scripts/deploy.sh update     git pull --ff-only puis deploy
#   deploy/scripts/deploy.sh rollback   revient a l'image app precedente
#   deploy/scripts/deploy.sh status     etat des services
#   deploy/scripts/deploy.sh logs [svc] suivre les logs
# Variables : SKIP_BACKUP=1 (ne pas sauvegarder avant migration), SKIP_SMOKE=1 (ne pas lancer le test de fumee final)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
ENV_FILE="$ROOT/deploy/.env"
COMPOSE=(docker compose -f "$ROOT/deploy/compose.prod.yaml" --env-file "$ENV_FILE")
cd "$ROOT"

log()  { printf '\n== %s\n' "$*"; }
die()  { echo "ERREUR : $*" >&2; exit 1; }

# Lecture SURE de deploy/.env : le fichier n'est jamais "source" (sinon $, `, ;, espaces
# seraient interpretes par bash). Chaque ligne KEY=VALEUR est lue litteralement ; seules
# les cles utilisees par ce script sont exportees. Formes acceptees pour VALEUR :
#   - sans guillemets : aucun espace, ni  " ' $ ` \ # ; & | < > ( )
#   - "entre guillemets doubles" : sans  $ ` \ "   (docker compose interpolerait le $)
#   - 'entre guillemets simples' : litteral (aucune interpolation)
ENV_CLES=" DOMAIN API_DOMAIN ACME_EMAIL DATA_DIR POSTGRES_PASSWORD JWT_SECRET ANON_KEY SERVICE_ROLE_KEY SECRET_KEY_BASE REALTIME_DB_ENC_KEY CRON_SECRET MAILER_AUTOCONFIRM APP_TAG "
charger_env() {
  local re_dq re_sq re_raw line key val n=0
  re_dq='^"([^"$`\]*)"[[:space:]]*(#.*)?$'
  re_sq="^'([^']*)'[[:space:]]*(#.*)?\$"
  re_raw="^[^[:space:]\"'\$\`\\#;&|<>()]*\$"
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1)); line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || die "deploy/.env ligne $n : format KEY=VALEUR attendu."
    key="${BASH_REMATCH[1]}"; val="${BASH_REMATCH[2]}"
    if   [[ "$val" =~ $re_dq ]]; then val="${BASH_REMATCH[1]}"
    elif [[ "$val" =~ $re_sq ]]; then val="${BASH_REMATCH[1]}"
    elif [[ "$val" =~ $re_raw ]]; then :
    else die "deploy/.env ligne $n ($key) : valeur non sure. Mettre la valeur entre guillemets doubles \"...\" (sans \$ \` \) ou simples '...' ; un \$ doit etre evite ou place entre guillemets simples."
    fi
    case "$ENV_CLES" in *" $key "*) export "$key=$val" ;; esac
  done < "$ENV_FILE"
}

check_env() {
  [ -f "$ENV_FILE" ] || die "deploy/.env absent. Lancer deploy/scripts/gen-secrets.sh puis le completer."
  charger_env
  local v
  for v in DOMAIN API_DOMAIN ACME_EMAIL POSTGRES_PASSWORD JWT_SECRET ANON_KEY SERVICE_ROLE_KEY \
           SECRET_KEY_BASE REALTIME_DB_ENC_KEY CRON_SECRET; do
    [ -n "${!v:-}" ] || die "$v est vide dans deploy/.env"
  done
  case "$DOMAIN$API_DOMAIN" in *exemple.sn*) die "DOMAIN/API_DOMAIN contiennent encore la valeur d'exemple." ;; esac
  [[ "$CRON_SECRET" =~ ^[A-Za-z0-9_.~-]+$ ]] || die "CRON_SECRET ne doit contenir que [A-Za-z0-9_.~-]."
  [ "${MAILER_AUTOCONFIRM:-false}" != "true" ] || die "MAILER_AUTOCONFIRM=true refuse en production (comptes non verifies). Le mettre a false."
  [ -d "${DATA_DIR:-/srv/fasso/data}/db" ] || die "${DATA_DIR:-/srv/fasso/data} absent : lancer bootstrap-vps.sh."
}

# Echoue si un port est publie ailleurs que sur la boucle locale, hors 80/443.
verifier_ports() {
  local ligne nom ports item hote ip port bad=0
  while IFS='|' read -r nom ports; do
    [ -n "$ports" ] || continue
    while IFS= read -r item; do
      [[ "$item" == *"->"* ]] || continue
      hote="${item%%->*}"; port="${hote##*:}"; ip="${hote%:*}"
      case "$ip" in 127.0.0.1|"[::1]") continue ;; esac
      case "$port" in 80|443) continue ;; esac
      echo "PORT PUBLIC INATTENDU : $nom publie $item" >&2; bad=1
    done < <(printf '%s\n' "$ports" | tr ',' '\n' | sed 's/^ *//')
  done < <(docker ps --filter "label=com.docker.compose.project=fasso" --format '{{.Names}}|{{.Ports}}')
  [ "$bad" = 0 ] || die "ports publies non autorises (seuls 80/443 publics ; le reste sur 127.0.0.1)."
}

wait_healthy() { # service timeout_s
  local svc="$1" t="${2:-180}" cid st
  for ((i = 0; i < t; i += 3)); do
    cid="$("${COMPOSE[@]}" ps -q "$svc")"
    st="$([ -n "$cid" ] && docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" || echo none)"
    case "$st" in healthy|running) return 0 ;; esac
    sleep 3
  done
  die "$svc n'est pas sain apres ${t}s (docker compose logs $svc)"
}

backup_avant_migration() {
  [ "${SKIP_BACKUP:-0}" = 1 ] && { echo "Sauvegarde ignoree (SKIP_BACKUP=1)."; return 0; }
  if "${COMPOSE[@]}" config --services | grep -qx backup; then
    echo "Sauvegarde avant migration..."
    "${COMPOSE[@]}" run --rm --no-deps backup now || die "sauvegarde echouee (SKIP_BACKUP=1 pour passer outre)"
  else
    echo "ATTENTION : service de sauvegarde absent (deploy/backup/compose.backup.yaml) : aucune sauvegarde avant migration."
  fi
}

configurer_cron_vault() {
  # Secrets lus par appeler_edge_function_alerte_stock_bas() (migration 0002).
  # pg_net appelle directement le runtime des fonctions, sur le reseau interne.
  # Le secret transite par STDIN (jamais en argument : visible dans `ps`/inspect).
  # CRON_SECRET est restreint a [A-Za-z0-9_.~-] par check_env : litteral SQL sur.
  {
    printf '%s\n' "\\set cron '$CRON_SECRET'"
    cat <<'SQL'
begin;
delete from vault.secrets where name in ('gfb_edge_functions_base_url', 'gfb_cron_secret');
select vault.create_secret('http://functions:9000', 'gfb_edge_functions_base_url', 'Base URL interne des Edge Functions (pg_net).') \gset
select vault.create_secret(:'cron', 'gfb_cron_secret', 'Secret pg_cron -> Edge Functions (x-cron-secret).') \gset
commit;
SQL
  } | "${COMPOSE[@]}" exec -T db psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1
}

cmd_deploy() {
  check_env

  # Image courante memorisee ; retaggee en :previous seulement apres healthchecks OK
  # (un deploiement rate ne doit pas ecraser le point de rollback).
  local img_avant=""
  img_avant="$(docker image inspect -f '{{.Id}}' "fasso-app:${APP_TAG:-latest}" 2>/dev/null || true)"

  log "Build de l'application"
  "${COMPOSE[@]}" build app

  log "Base de donnees"
  "${COMPOSE[@]}" up -d db
  wait_healthy db 180
  "${COMPOSE[@]}" exec -T db psql -U postgres -d postgres -X -q -c \
    "create schema if not exists _realtime; alter schema _realtime owner to supabase_admin;"

  # Le schema `storage` (storage.buckets/objects) est cree par les migrations
  # internes de Storage au 1er demarrage ; la migration 0001 en depend (buckets +
  # policies). Il faut donc demarrer storage AVANT d'appliquer les migrations.
  log "Demarrage de Storage (schema storage requis par les migrations)"
  "${COMPOSE[@]}" up -d storage
  wait_healthy storage 240

  backup_avant_migration

  log "Migrations + seed idempotent"
  "${COMPOSE[@]}" --profile migrate run --rm migrate

  log "Secrets cron (Vault)"
  configurer_cron_vault

  log "Demarrage de la stack"
  "${COMPOSE[@]}" up -d --remove-orphans
  # le code des fonctions est un bind mount : relecture au redemarrage
  "${COMPOSE[@]}" restart functions >/dev/null

  log "Healthchecks"
  for s in db auth storage realtime kong meta app caddy; do
    printf '%-10s' "$s"; wait_healthy "$s" 240; echo "ok"
  done
  if curl -fsS -m 15 -o /dev/null "https://$DOMAIN/"; then echo "https://$DOMAIN : ok"
  else echo "AVERTISSEMENT : https://$DOMAIN injoignable (DNS ou certificat encore en cours ?)"; fi
  if curl -fsS -m 15 -o /dev/null -H "apikey: $ANON_KEY" "https://$API_DOMAIN/auth/v1/health"; then echo "https://$API_DOMAIN : ok"
  else echo "AVERTISSEMENT : https://$API_DOMAIN injoignable (DNS ou certificat encore en cours ?)"; fi

  verifier_ports

  if [ -n "$img_avant" ] && [ "$img_avant" != "$(docker image inspect -f '{{.Id}}' "fasso-app:${APP_TAG:-latest}" 2>/dev/null)" ]; then
    docker tag "$img_avant" fasso-app:previous
    echo "Image precedente conservee : fasso-app:previous"
  fi

  log "Deploiement termine"
  "${COMPOSE[@]}" ps

  # Commande `fasso` disponible partout (lien dans /usr/local/bin) ; sans gravite si impossible.
  bash "$HERE/fasso" install || true

  # Test de fumee (HTTPS, securite, migrations, coherence facture/BL en transaction annulee).
  # SKIP_SMOKE=1 pour l'ignorer. Un echec rend le code de sortie non nul.
  if [ "${SKIP_SMOKE:-0}" != 1 ]; then
    log "Test de fumee"
    bash "$HERE/smoke-test.sh" || die "le test de fumee a echoue (details ci-dessus ; relancer : fasso smoke)."
  fi
}

cmd_update() {
  git -C "$ROOT" pull --ff-only
  cmd_deploy
}

cmd_rollback() {
  check_env
  docker image inspect fasso-app:previous >/dev/null 2>&1 || die "aucune image fasso-app:previous."
  log "Retour a l'image app precedente"
  docker tag fasso-app:latest fasso-app:rolled-back-from 2>/dev/null || true
  docker tag fasso-app:previous fasso-app:latest
  "${COMPOSE[@]}" up -d --no-build --no-deps app
  wait_healthy app 120
  echo "App restauree. Les migrations SQL ne sont PAS annulees (elles sont additives) ;"
  echo "pour la base, utiliser deploy/backup/restore.sh. Pour revenir au code : git checkout <commit>."
}

case "${1:-deploy}" in
  deploy)   cmd_deploy ;;
  update)   cmd_update ;;
  rollback) cmd_rollback ;;
  status)   check_env; "${COMPOSE[@]}" ps ;;
  logs)     check_env; shift; "${COMPOSE[@]}" logs -f --tail=100 "$@" ;;
  *) die "usage : $0 [deploy|update|rollback|status|logs [service]]" ;;
esac
