#!/usr/bin/env bash
set -euo pipefail

export PGHOST=db PGPORT=5432 PGUSER=postgres PGDATABASE=postgres
export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD requis}"
export DATABASE_URL="postgresql://postgres@db:5432/postgres"
export MIGRATIONS_DIR=/migrations

[[ "${FASSO_DEPLOY_REVISION:-}" =~ ^[a-fA-F0-9]{7,64}$ ]] || {
  echo "FASSO_DEPLOY_REVISION doit etre un SHA Git" >&2
  exit 1
}

[[ "${CRON_SECRET:-}" =~ ^[A-Za-z0-9_.~-]+$ ]] || {
  echo "CRON_SECRET invalide" >&2
  exit 1
}
[ "${MAILER_AUTOCONFIRM:-false}" != true ] || {
  echo "MAILER_AUTOCONFIRM=true refuse en production" >&2
  exit 1
}

echo "Sauvegarde avant migrations"
# La sauvegarde reguliere exige les tables applicatives. Sur une base vierge,
# conserver d'abord un dump initial verifie ; ne jamais sauter la sauvegarde.
# Supabase contient deja public.schema_migrations sur une base neuve.
# Detecter uniquement les tables applicatives attendues, pas tout le schema.
table_count="$(psql "$DATABASE_URL" -X -At -v ON_ERROR_STOP=1 -c \
  "select count(*) from pg_tables where schemaname = 'public'
   and tablename in ('factures', 'produits', 'utilisateurs')")"
if [ "$table_count" != 0 ] && [ "$table_count" != 3 ]; then
  echo "Schema applicatif partiel : sauvegarde et migrations interrompues" >&2
  exit 1
fi
if [ "$table_count" = 0 ]; then
  umask 077
  baseline="/backups/bootstrap/$(date -u +%Y%m%d_%H%M%S)_${FASSO_DEPLOY_REVISION}"
  mkdir -p "$baseline"
  pg_dump -Fc -f "$baseline/db.dump"
  pg_restore --list "$baseline/db.dump" >/dev/null
  pg_dumpall --roles-only -f "$baseline/roles.sql"
  [ -d /storage ] && [ -r /storage ] || {
    echo "Volume Storage inaccessible" >&2
    exit 1
  }
  tar -czf "$baseline/storage.tar.gz" -C /storage .
  tar -tzf "$baseline/storage.tar.gz" >/dev/null
  (cd "$baseline" && sha256sum db.dump roles.sql storage.tar.gz >SHA256SUMS)
else
  /usr/local/bin/backup.sh
fi

psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -c \
  'create schema if not exists _realtime; alter schema _realtime owner to supabase_admin;'
bash /migrate.sh --strict --seed /seed.sql

# Le secret passe par stdin ; jamais en argument ni dans les journaux.
{
  printf '\\set cron '\''%s'\''\n' "$CRON_SECRET"
  cat <<'SQL'
begin;
delete from vault.secrets where name in ('gfb_edge_functions_base_url', 'gfb_cron_secret');
select vault.create_secret('http://functions:9000', 'gfb_edge_functions_base_url', 'Base URL interne Edge Functions') \gset
select vault.create_secret(:'cron', 'gfb_cron_secret', 'Secret cron') \gset
commit;
SQL
} | psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1
echo "Initialisation terminee"
