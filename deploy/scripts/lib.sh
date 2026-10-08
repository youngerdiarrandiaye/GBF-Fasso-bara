#!/usr/bin/env bash
# Fonctions communes aux scripts d'exploitation (fasso, create-admin.sh, smoke-test.sh).
# A "sourcer" uniquement : . "$HERE/lib.sh". N'execute rien par lui-meme.
# deploy.sh garde sa propre copie de charger_env (non modifie pour ne pas risquer de le
# casser) : si la liste ENV_CLES ou les regles de lecture changent, les changer aux deux endroits.

FASSO_HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FASSO_ROOT="$(cd "$FASSO_HERE/../.." && pwd)"
ENV_FILE="${FASSO_ENV_FILE:-$FASSO_ROOT/deploy/.env}"
COMPOSE_FILE="$FASSO_ROOT/deploy/compose.prod.yaml"
COMPOSE=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")
BACKUP_DIR="${FASSO_BACKUP_DIR:-/srv/fasso/backups}"
# shellcheck disable=SC2034  # utilise par fasso
BACKUP_MAX_AGE_H="${FASSO_BACKUP_MAX_AGE_H:-26}"

# --- Presentation ----------------------------------------------------------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'; C_BLD=$'\033[1m'; C_OFF=$'\033[0m'
else
  C_RED=""; C_GRN=""; C_YEL=""; C_BLD=""; C_OFF=""
fi
ok()    { printf '  %s✔%s %s\n' "$C_GRN" "$C_OFF" "$*"; }
ko()    { printf '  %s✘ %s%s\n' "$C_RED" "$*" "$C_OFF"; }
warn()  { printf '  %s!%s %s\n' "$C_YEL" "$C_OFF" "$*"; }
titre() { printf '\n%s%s%s\n' "$C_BLD" "$*" "$C_OFF"; }
die()   { printf '%sERREUR : %s%s\n' "$C_RED" "$*" "$C_OFF" >&2; exit 1; }

# --- Lecture SURE de deploy/.env (jamais "source") -------------------------
ENV_CLES=" DOMAIN API_DOMAIN ACME_EMAIL DATA_DIR POSTGRES_PASSWORD JWT_SECRET ANON_KEY SERVICE_ROLE_KEY SECRET_KEY_BASE REALTIME_DB_ENC_KEY CRON_SECRET MAILER_AUTOCONFIRM APP_TAG NOTIFY_WEBHOOK_URL NOTIFY_NTFY_URL HEALTHCHECK_URL "
charger_env() {
  [ -f "$ENV_FILE" ] || die "deploy/.env absent. Lancer deploy/scripts/gen-secrets.sh puis le completer."
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
    else die "deploy/.env ligne $n ($key) : valeur non sure (voir l'en-tete de deploy/.env.example)."
    fi
    case "$ENV_CLES" in *" $key "*) export "$key=$val" ;; esac
  done < "$ENV_FILE"
}

exiger_docker() {
  command -v docker >/dev/null 2>&1 || die "docker introuvable."
  docker info >/dev/null 2>&1 || die "docker inaccessible (utilisateur hors du groupe docker, ou service arrete ?)."
}

# --- Acces base ------------------------------------------------------------
# psql dans le conteneur db ; le SQL arrive par stdin (ou -c). Les valeurs variables sont
# passees avec -v nom=valeur puis citees dans le SQL avec :'nom' (jamais concatenees).
# FASSO_DB_CONTAINER : (tests) utiliser directement ce conteneur au lieu de docker compose.
db_psql() {
  if [ -n "${FASSO_DB_CONTAINER:-}" ]; then
    docker exec -i "$FASSO_DB_CONTAINER" psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"
  else
    "${COMPOSE[@]}" exec -T db psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"
  fi
}

# --- Sauvegardes -----------------------------------------------------------
# Dernier jeu de sauvegarde valide (db.dump non vide) : imprime "chemin|epoch". Code 1 si aucun.
derniere_sauvegarde() {
  local d best="" best_t=0 t
  for d in "$BACKUP_DIR"/daily/*/; do
    [ -s "${d}db.dump" ] || continue
    case "$d" in *.partial/) continue ;; esac
    t="$(stat -c %Y "${d}db.dump" 2>/dev/null)" || continue
    if [ "$t" -gt "$best_t" ]; then best_t="$t"; best="${d%/}"; fi
  done
  [ -n "$best" ] || return 1
  printf '%s|%s\n' "$best" "$best_t"
}

duree_humaine() { # secondes -> "3 h 12 min" / "2 j 4 h"
  local s="$1"
  if   [ "$s" -ge 86400 ]; then printf '%d j %d h' $((s / 86400)) $((s % 86400 / 3600))
  elif [ "$s" -ge 3600 ];  then printf '%d h %d min' $((s / 3600)) $((s % 3600 / 60))
  else printf '%d min' $((s / 60)); fi
}

# Notification (memes variables que le service de sauvegarde, lues dans deploy/.env).
notifier() { # message
  local msg="$1" body
  if command -v jq >/dev/null 2>&1; then
    body="$(jq -nc --arg m "$msg" '{text:$m,content:$m}')"
  else
    local e="${msg//\\/\\\\}"; e="${e//\"/\\\"}"; e="$(printf '%s' "$e" | tr '\n\r\t' '   ')"
    body="{\"text\":\"$e\",\"content\":\"$e\"}"
  fi
  [ -z "${NOTIFY_WEBHOOK_URL:-}" ] || curl -fsS -m 20 -X POST -H 'Content-Type: application/json' --data-binary "$body" "$NOTIFY_WEBHOOK_URL" >/dev/null 2>&1 || true
  [ -z "${NOTIFY_NTFY_URL:-}" ] || curl -fsS -m 20 -H "Title: GFB-STOCK alerte" -H "Priority: high" -d "$msg" "$NOTIFY_NTFY_URL" >/dev/null 2>&1 || true
  return 0
}
