-- Schema requis par Realtime (premier demarrage uniquement, data dir vide).
create schema if not exists _realtime;
alter schema _realtime owner to supabase_admin;
