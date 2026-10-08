-- Mots de passe des roles de service Supabase (premier demarrage uniquement, data dir vide).
-- L'image supabase/postgres cree ces roles SANS mot de passe : sans ce script, GoTrue,
-- PostgREST et Storage echouent en "password authentication failed" (28P01).
-- Equivalent du volumes/db/roles.sql de la stack self-hosted officielle.
\set pgpass `echo "$POSTGRES_PASSWORD"`
alter user authenticator with password :'pgpass';
alter user pgbouncer with password :'pgpass';
alter user supabase_auth_admin with password :'pgpass';
alter user supabase_storage_admin with password :'pgpass';
alter user supabase_replication_admin with password :'pgpass';
alter user supabase_read_only_user with password :'pgpass';
