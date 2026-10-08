#!/usr/bin/env bash
# =============================================================================
# deploy/db/migrate.sh : applique supabase/migrations/*.sql de facon IDEMPOTENTE.
#
# - Suivi dans supabase_migrations.schema_migrations (meme table que la CLI
#   Supabase : version = prefixe numerique du fichier, ex. "0017").
# - Une migration deja enregistree est sautee. Si son contenu a change depuis
#   (checksum dans supabase_migrations.fasso_checksums), un AVERTISSEMENT est
#   emis sans re-execution (ne jamais modifier une migration appliquee : en
#   creer une nouvelle). --strict transforme l'avertissement en erreur.
# - Chaque fichier : transaction unique sauf s'il contient deja son propre
#   BEGIN/COMMIT (cas de 0017+). Arret au premier echec.
# - Verrou flock (si disponible) contre deux executions concurrentes.
#
# Modes de connexion (un seul) :
#   --container NOM   docker exec dans le conteneur db (ex. supabase_db_Facture-Fasso)
#   DATABASE_URL=...  psql de l'hote / du conteneur `migrate`
# Options : --dir DIR (defaut ../../supabase/migrations, ou $MIGRATIONS_DIR)
#           --seed [FICHIER]  (rejoue supabase/seed.sql, idempotent)
#           --dry-run  --strict
# Exemples :
#   deploy/db/migrate.sh --container supabase_db_Facture-Fasso --dry-run
#   DATABASE_URL=postgresql://postgres:$POSTGRES_PASSWORD@db:5432/postgres deploy/db/migrate.sh --seed
# =============================================================================
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR="${MIGRATIONS_DIR:-$HERE/../../supabase/migrations}"
CONTAINER="" ; SEED="" ; DRY=0 ; STRICT=0
while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift 2;;
    --dir) DIR="$2"; shift 2;;
    --seed) if [ $# -gt 1 ] && [[ "$2" != --* ]]; then SEED="$2"; shift 2; else SEED="$HERE/../../supabase/seed.sql"; shift; fi;;
    --dry-run) DRY=1; shift;;
    --strict) STRICT=1; shift;;
    *) echo "Option inconnue : $1" >&2; exit 2;;
  esac
done

if command -v flock >/dev/null 2>&1; then
  exec 9>"${TMPDIR:-/tmp}/fasso-migrate.lock"
  flock -n 9 || { echo "Une migration est deja en cours." >&2; exit 3; }
fi

# Le SQL arrive par stdin ou -c.
psqlq() {
  if [ -n "$CONTAINER" ]; then
    docker exec -i "$CONTAINER" psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"
  else
    psql "${DATABASE_URL:?DATABASE_URL ou --container requis}" -X -q -v ON_ERROR_STOP=1 "$@"
  fi
}

[ -d "$DIR" ] || { echo "Dossier introuvable : $DIR" >&2; exit 2; }
if [ "$DRY" = 0 ]; then
psqlq <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
create table if not exists supabase_migrations.fasso_checksums (version text primary key, sha256 text not null, applied_at timestamptz not null default now());
SQL
fi

# Une seule requete : version|checksum (checksum vide si inconnu). Dry-run : lecture seule.
STATE="$(psqlq -At -F '|' -c "select m.version, coalesce(c.sha256,'') from supabase_migrations.schema_migrations m left join supabase_migrations.fasso_checksums c using (version)" 2>/dev/null   || psqlq -At -F '|' -c "select version, '' from supabase_migrations.schema_migrations" 2>/dev/null || true)"

applied=0; skipped=0
for f in "$DIR"/*.sql; do
  base="$(basename "$f" .sql)"; version="${base%%_*}"; name="${base#*_}"
  # Le nom est injecte dans du SQL (name/version) : liste blanche stricte, sinon refus.
  [[ "$base" =~ ^[A-Za-z0-9_.-]+$ ]] || { echo "Nom de fichier de migration invalide (seuls A-Z a-z 0-9 _ . - autorises) : $base" >&2; exit 2; }
  [[ "$version" =~ ^[0-9]+$ ]] || { echo "Nom invalide (prefixe numerique attendu) : $base" >&2; exit 2; }
  sum="$(sha256sum "$f" | cut -d' ' -f1)"
  rec="insert into supabase_migrations.schema_migrations(version,name) values ('$version','$name') on conflict do nothing; insert into supabase_migrations.fasso_checksums(version,sha256) values ('$version','$sum') on conflict do nothing;"
  line="$(printf '%s
' "$STATE" | grep -E "^${version}\|" || true)"
  if [ -n "$line" ]; then
    old="${line#*|}"
    if [ -z "$old" ]; then
      # appliquee avant ce script : on fige son empreinte
      [ "$DRY" = 1 ] || psqlq -c "insert into supabase_migrations.fasso_checksums(version,sha256) values ('$version','$sum') on conflict do nothing"
    elif [ "$old" != "$sum" ]; then
      echo "ATTENTION : $base modifiee apres application (checksum different)." >&2
      [ "$STRICT" = 1 ] && exit 4
    fi
    skipped=$((skipped+1)); continue
  fi
  echo ">> Application de $base"
  if [ "$DRY" = 0 ]; then
    if grep -qiE '^[[:space:]]*(begin|commit)[[:space:]]*;' "$f"; then
      psqlq < "$f"; psqlq -c "$rec"
    else
      { echo "begin;"; cat "$f"; echo; echo "$rec"; echo "commit;"; } | psqlq
    fi
  fi
  applied=$((applied+1))
done
echo "Migrations : $applied a appliquer/appliquee(s)$( [ "$DRY" = 1 ] && echo ' (dry-run)'), $skipped deja presente(s)."

if [ -n "$SEED" ] && [ "$DRY" = 0 ]; then
  echo ">> Seed : $SEED (idempotent)"
  psqlq < "$SEED"
fi
