#!/usr/bin/env bash
# =============================================================================
# backup.sh : une sauvegarde complete GFB-STOCK.
#   1. pg_dump -Fc de toute la base (public + auth + storage + migrations...)
#   2. dump des roles (best effort) + archive tar.gz du dossier Storage
#   3. verification : pg_restore --list, tar -tzf, sha256
#   4. (option) test de restauration reel dans une base temporaire
#   5. rotation locale GFS 7 quotidiens / 4 hebdo (dimanche) / 6 mensuels (1er)
#   6. (option) copie off-site via rclone
#   7. notification d'echec (webhook) / ping healthcheck
#
# Variables : PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE (ou POSTGRES_PASSWORD),
# BACKUP_DIR, STORAGE_DIR, KEEP_DAILY/WEEKLY/MONTHLY, OFFSITE_*, NOTIFY_* : voir README.
# =============================================================================
set -uo pipefail
umask 077   # dumps = donnees clients : jamais lisibles par group/other

export PGHOST="${PGHOST:-db}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"
PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-postgres}}"; export PGDATABASE
BACKUP_DIR="${BACKUP_DIR:-/backups}"
STORAGE_DIR="${STORAGE_DIR:-/storage}"
KEEP_DAILY="${KEEP_DAILY:-7}"; KEEP_WEEKLY="${KEEP_WEEKLY:-4}"; KEEP_MONTHLY="${KEEP_MONTHLY:-6}"
OFFSITE_ENABLED="${OFFSITE_ENABLED:-false}"
OFFSITE_RETENTION_DAYS="${OFFSITE_RETENTION_DAYS:-60}"
VERIFY_RESTORE="${BACKUP_VERIFY_RESTORE:-false}"
STAMP="$(date +%Y%m%d_%H%M%S)"
SET="$BACKUP_DIR/daily/$STAMP"
LOG() { echo "[backup $(date +%T)] $*"; }

notify_fail() {
  local msg="GFB-STOCK : SAUVEGARDE EN ECHEC ($(hostname), $STAMP) : $1" body
  LOG "$msg" >&2
  # JSON construit par jq si present, sinon echappement manuel (\ puis ") ; aucun
  # caractere de controle (retours ligne retires). Le message n'entre jamais dans une commande.
  if command -v jq >/dev/null 2>&1; then
    body="$(jq -nc --arg m "$msg" '{text:$m,content:$m}')"
  else
    local e="${msg//\\/\\\\}"; e="${e//\"/\\\"}"; e="$(printf '%s' "$e" | tr '\n\r\t' '   ')"
    body="{\"text\":\"$e\",\"content\":\"$e\"}"
  fi
  [ -n "${NOTIFY_WEBHOOK_URL:-}" ] && curl -fsS -m 20 -X POST -H 'Content-Type: application/json' \
      --data-binary "$body" "$NOTIFY_WEBHOOK_URL" >/dev/null 2>&1   # Slack/Mattermost/Discord
  [ -n "${NOTIFY_NTFY_URL:-}" ] && curl -fsS -m 20 -H "Title: GFB backup KO" -H "Priority: high" -d "$msg" "$NOTIFY_NTFY_URL" >/dev/null 2>&1
  [ -n "${HEALTHCHECK_URL:-}" ] && curl -fsS -m 20 "${HEALTHCHECK_URL%/}/fail" >/dev/null 2>&1
  return 0
}
fail() { notify_fail "$1"; rm -rf "$SET.partial"; exit 1; }

[ -n "$PGPASSWORD" ] || fail "PGPASSWORD/POSTGRES_PASSWORD manquant"
# Chiffrement off-site obligatoire : refus AVANT toute ecriture si la config est inadequate.
if [ "$OFFSITE_ENABLED" = "true" ]; then
  [ "${RCLONE_CONFIG_OFFSITE_TYPE:-}" = "crypt" ] && [ -n "${RCLONE_CONFIG_OFFSITE_PASSWORD:-}" ] \
    || fail "OFFSITE_ENABLED=true refuse : le remote off-site doit etre chiffre (RCLONE_CONFIG_OFFSITE_TYPE=crypt + RCLONE_CONFIG_OFFSITE_PASSWORD). Voir deploy/.env.example."
  case "${OFFSITE_REMOTE:-}" in offsite:*) ;; *) fail "OFFSITE_REMOTE doit pointer le remote chiffre (offsite:...), pas le stockage brut." ;; esac
fi
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/monthly" || fail "BACKUP_DIR non inscriptible"
chmod go-rwx "$BACKUP_DIR" "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/monthly" 2>/dev/null
P="$SET.partial"; mkdir -p "$P"
[ -n "${HEALTHCHECK_URL:-}" ] && curl -fsS -m 20 "${HEALTHCHECK_URL%/}/start" >/dev/null 2>&1

# --- 1. Base de donnees ------------------------------------------------------
LOG "pg_dump -Fc $PGDATABASE@$PGHOST"
pg_dump -Fc -Z 6 -f "$P/db.dump" 2>"$P/pg_dump.log" || fail "pg_dump a echoue : $(tail -n2 "$P/pg_dump.log" | tr '\n"' ' ')"
pg_dumpall --roles-only -f "$P/roles.sql" 2>>"$P/pg_dump.log" || { LOG "roles non sauvegardes (non bloquant)"; rm -f "$P/roles.sql"; }

# --- 2. Storage (fichiers des buckets) --------------------------------------
if [ -d "$STORAGE_DIR" ] && [ -n "$(ls -A "$STORAGE_DIR" 2>/dev/null)" ]; then
  LOG "archive Storage $STORAGE_DIR"
  tar -czf "$P/storage.tar.gz" -C "$STORAGE_DIR" . 2>"$P/tar.log"
  rc=$?   # 1 = "fichier modifie pendant la lecture" : tolere
  [ $rc -le 1 ] || fail "tar Storage a echoue (code $rc)"
else
  [ "${STORAGE_REQUIRED:-true}" = "true" ] && fail "STORAGE_DIR vide ou absent ($STORAGE_DIR) : monter le volume storage en lecture seule"
fi

# --- 3. Verification d'integrite --------------------------------------------
LOG "verification"
pg_restore --list "$P/db.dump" > "$P/db.list" 2>/dev/null || fail "pg_restore --list illisible"
for t in "TABLE public factures" "TABLE public produits" "TABLE auth users"; do
  grep -q "$t " "$P/db.list" || fail "table attendue absente du dump : $t"
done
[ -f "$P/storage.tar.gz" ] && { tar -tzf "$P/storage.tar.gz" >/dev/null 2>&1 || fail "archive Storage corrompue"; }
if [ "$VERIFY_RESTORE" = "true" ]; then
  LOG "test de restauration dans une base temporaire"
  /usr/local/bin/restore.sh --dump "$P/db.dump" >"$P/verify-restore.log" 2>&1 || fail "test de restauration echoue : $(tail -n3 "$P/verify-restore.log" | tr '\n"' ' ')"
fi
rm -f "$P/db.list"
( cd "$P" && sha256sum $(ls | grep -v '^SHA256SUMS$') > SHA256SUMS ) || fail "sha256"
du -sh "$P" | awk '{print "[backup] taille : "$1}'
chmod -R go-rwx "$P" 2>/dev/null
mv "$P" "$SET" || fail "finalisation impossible"

# --- 5. Rotation GFS (hardlinks : pas de duplication d'espace) ---------------
[ "$(date +%u)" = "7" ] && cp -al "$SET" "$BACKUP_DIR/weekly/$STAMP"
[ "$(date +%d)" = "01" ] && cp -al "$SET" "$BACKUP_DIR/monthly/$STAMP"
prune() { ls -1d "$1"/*/ 2>/dev/null | sort -r | tail -n +$(($2 + 1)) | xargs -r rm -rf; }
prune "$BACKUP_DIR/daily" "$KEEP_DAILY"; prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"; prune "$BACKUP_DIR/monthly" "$KEEP_MONTHLY"
rm -rf "$BACKUP_DIR"/*/*.partial 2>/dev/null

# --- 6. Off-site (rclone) ---------------------------------------------------
if [ "$OFFSITE_ENABLED" = "true" ]; then
  [ -n "${OFFSITE_REMOTE:-}" ] || fail "OFFSITE_ENABLED=true mais OFFSITE_REMOTE vide (ex. offsite:gfb-backups)"
  LOG "rclone -> $OFFSITE_REMOTE"
  rclone copy "$SET" "${OFFSITE_REMOTE%/}/$STAMP" --checksum --retries 3 2>"$BACKUP_DIR/rclone.log" || fail "rclone copy a echoue : $(tail -n2 "$BACKUP_DIR/rclone.log" | tr '\n"' ' ')"
  rclone check "$SET" "${OFFSITE_REMOTE%/}/$STAMP" --one-way >/dev/null 2>&1 || fail "rclone check : copie off-site differente"
  rclone delete "$OFFSITE_REMOTE" --min-age "${OFFSITE_RETENTION_DAYS}d" >/dev/null 2>&1
  rclone rmdirs "$OFFSITE_REMOTE" --leave-root >/dev/null 2>&1
fi

[ -n "${HEALTHCHECK_URL:-}" ] && curl -fsS -m 20 "${HEALTHCHECK_URL%/}" >/dev/null 2>&1
LOG "OK : $SET"
