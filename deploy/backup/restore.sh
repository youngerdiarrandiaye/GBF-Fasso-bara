#!/usr/bin/env bash
# =============================================================================
# restore.sh : restauration (ou TEST de restauration) d'une sauvegarde GFB-STOCK.
#
# Par defaut, SANS RISQUE : restaure dans une base temporaire "restore_check_<ts>",
# affiche des controles de coherence, puis la supprime (--keep pour la garder).
# La base de production n'est jamais touchee sans --in-place --yes.
#
# Usage :
#   restore.sh --dump SET/db.dump                         # test (base temporaire)
#   restore.sh --dump SET/db.dump --keep                  # garder la base de test
#   restore.sh --dump SET/db.dump --in-place --yes        # RESTAURATION REELLE (base cible ecrasee)
#   restore.sh --storage SET/storage.tar.gz --storage-dir /srv/fasso/data/storage --yes
# Connexion :
#   defaut          : variables PGHOST/PGUSER/PGPASSWORD (dans le conteneur backup)
#   --container N   : docker exec dans le conteneur Postgres N (poste dev/hote), ex. supabase_db_Facture-Fasso
#   --target-db DB  : base cible pour --in-place (defaut : postgres)
# =============================================================================
set -uo pipefail
DUMP=""; CONTAINER=""; KEEP=0; INPLACE=0; YES=0; TARGET="postgres"; STORAGE=""; STORAGE_DIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dump) DUMP="$2"; shift 2;;  --container) CONTAINER="$2"; shift 2;;
    --keep) KEEP=1; shift;;       --in-place) INPLACE=1; shift;;
    --yes) YES=1; shift;;         --target-db) TARGET="$2"; shift 2;;
    --storage) STORAGE="$2"; shift 2;; --storage-dir) STORAGE_DIR="$2"; shift 2;;
    -h|--help) sed -n '2,22p' "$0"; exit 0;;
    *) echo "Option inconnue : $1" >&2; exit 2;;
  esac
done
export PGHOST="${PGHOST:-db}" PGUSER="${PGUSER:-postgres}" PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"

# --- Restauration des fichiers Storage --------------------------------------
if [ -n "$STORAGE" ]; then
  [ -f "$STORAGE" ] && [ -n "$STORAGE_DIR" ] || { echo "--storage FICHIER et --storage-dir DOSSIER requis" >&2; exit 2; }
  tar -tzf "$STORAGE" >/dev/null || { echo "Archive illisible" >&2; exit 1; }
  [ "$YES" = 1 ] || { echo "Extraction dans $STORAGE_DIR (ajoute/ecrase des fichiers). Ajouter --yes." >&2; exit 2; }
  mkdir -p "$STORAGE_DIR" && tar -xzf "$STORAGE" -C "$STORAGE_DIR" && echo "Storage restaure dans $STORAGE_DIR"
  [ -z "$DUMP" ] && exit 0
fi

[ -f "$DUMP" ] || { echo "--dump FICHIER requis (introuvable : '$DUMP')" >&2; exit 2; }
# Controle d'integrite du dump et de son SHA256SUMS s'il est present
SUMS="$(dirname "$DUMP")/SHA256SUMS"
if [ -f "$SUMS" ]; then
  (cd "$(dirname "$DUMP")" && grep " $(basename "$DUMP")\$" SHA256SUMS | sha256sum -c -) || { echo "Checksum KO" >&2; exit 1; }
fi

hp() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }   # docker.exe sous Git Bash
# Execution cote serveur (docker exec) ou locale
if [ -n "$CONTAINER" ]; then
  pg()  { local c="$1"; shift; docker exec -i "$CONTAINER" "$c" -U postgres "$@"; }
  REMOTE_DUMP=/tmp/restore_in.dump; REMOTE_LIST=/tmp/restore_in.list
  docker cp "$(hp "$DUMP")" "$CONTAINER:$REMOTE_DUMP" || exit 1
  cleanup_files() { docker exec "$CONTAINER" rm -f $REMOTE_DUMP $REMOTE_LIST; }
else
  pg()  { local c="$1"; shift; "$c" "$@"; }
  REMOTE_DUMP="$DUMP"; REMOTE_LIST="$(mktemp)"
  cleanup_files() { rm -f "$REMOTE_LIST"; }
fi

if [ "$INPLACE" = 1 ]; then
  DB="$TARGET"
  [ "$YES" = 1 ] || { echo "RESTAURATION REELLE dans '$DB' : le contenu actuel sera REMPLACE. Arreter app/auth/rest/storage/realtime avant, puis ajouter --yes." >&2; cleanup_files; exit 2; }
  OPTS=(--clean --if-exists --no-owner)
else
  DB="restore_check_$(date +%s)"
  pg psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "create database \"$DB\"" || { cleanup_files; exit 1; }
  OPTS=(--no-owner)
fi

LH="$(mktemp)"; EH="$(mktemp)"
# Liste filtree : pg_cron ne peut exister que dans la base "postgres" (cron.database_name)
pg_restore_list() { if [ -n "$CONTAINER" ]; then docker exec -i "$CONTAINER" pg_restore --list "$REMOTE_DUMP"; else pg_restore --list "$REMOTE_DUMP"; fi; }
if [ "$DB" = "postgres" ]; then pg_restore_list > "$LH"
else pg_restore_list | grep -v -E 'EXTENSION - pg_cron|EXTENSION pg_cron' > "$LH"; fi
if [ -n "$CONTAINER" ]; then docker cp "$(hp "$LH")" "$CONTAINER:$REMOTE_LIST" >/dev/null; else cp "$LH" "$REMOTE_LIST"; fi
rm -f "$LH"

echo ">> pg_restore dans '$DB'"
pg pg_restore -d "$DB" "${OPTS[@]}" -L "$REMOTE_LIST" "$REMOTE_DUMP" 2>"$EH"
RC=$?
NERR=$(grep -c '^pg_restore: error' "$EH" || true)
echo "   code retour=$RC, erreurs=$NERR (erreurs 'permission denied'/'already exists' sur schemas internes Supabase realtime/extensions : attendues)"
[ "$NERR" -gt 0 ] && head -n 8 "$EH"

echo ">> Controles de coherence sur '$DB'"
CHK="select 'tables public', count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'
union all select 'migrations', count(*) from supabase_migrations.schema_migrations
union all select 'derniere migration', max(version)::bigint from supabase_migrations.schema_migrations
union all select 'factures', count(*) from public.factures
union all select 'produits', count(*) from public.produits
union all select 'auth.users', count(*) from auth.users
union all select 'storage.objects', count(*) from storage.objects
union all select 'triggers public', count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal
union all select 'policies RLS', count(*) from pg_policies where schemaname='public'"
pg psql -X -d "$DB" -At -F ' : ' -c "$CHK"; CRC=$?

if [ "$INPLACE" = 0 ] && [ "$KEEP" = 0 ]; then
  pg psql -X -q -d postgres -c "drop database \"$DB\" with (force)" && echo ">> base temporaire '$DB' supprimee"
elif [ "$INPLACE" = 0 ]; then echo ">> base temporaire conservee : $DB (a supprimer : DROP DATABASE \"$DB\" WITH (FORCE);)"; fi
rm -f "$EH" "$LH"; cleanup_files
[ "$CRC" = 0 ] && [ "$RC" -le 1 ] || exit 1
echo "RESTAURATION VALIDEE"
