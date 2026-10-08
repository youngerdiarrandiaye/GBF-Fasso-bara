# Persistance et sauvegarde GFB-STOCK

## Volumes persistants (hote)

    # Normalement fait par deploy/scripts/bootstrap-vps.sh. A la main :
    sudo mkdir -p /srv/fasso/data/db /srv/fasso/data/storage /srv/fasso/backups
    sudo chmod 711 /srv/fasso /srv/fasso/data
    # proprietaire de PGDATA = uid du user postgres de l'image (verifier) :
    docker run --rm --entrypoint id <image supabase/postgres> postgres
    sudo chown -R <uid>:<gid> /srv/fasso/data/db
    sudo chmod 700 /srv/fasso/data/db /srv/fasso/data/storage /srv/fasso/backups

| Hote                     | Conteneur                  | Contenu                        |
|--------------------------|----------------------------|--------------------------------|
| /srv/fasso/data/db       | db:/var/lib/postgresql/data| base PostgreSQL                |
| /srv/fasso/data/storage  | storage:/var/lib/storage ; backup:/storage:ro | photos, logo, BL, factures |
| /srv/fasso/backups       | backup:/backups            | daily/ weekly/ monthly/        |

Mettre /srv/fasso/backups sur un autre disque que `data` si possible. Ne jamais
utiliser `docker compose down -v` (inutile ici : bind mounts, mais prudence).

## Sauvegarde

Chaque jeu = dossier `daily/<AAAAMMJJ_HHMMSS>/` : `db.dump` (pg_dump -Fc, toute la
base : public, auth, storage, migrations), `storage.tar.gz`, `roles.sql`, `SHA256SUMS`.
Rotation 7 quotidiens / 4 hebdo (dimanche) / 6 mensuels (le 1er), par liens physiques.
Verifications : `pg_restore --list` (+ tables attendues), `tar -tzf`, sha256, et
optionnellement un vrai test de restauration (`BACKUP_VERIFY_RESTORE=true`).
Echec = notification (webhook / ntfy / healthchecks.io `/fail`) et code retour 1.

Lancer a la main (meme commande que `deploy.sh`, depuis la racine du depot) :

    docker compose -f deploy/compose.prod.yaml --env-file deploy/.env run --rm --no-deps backup now

Les sauvegardes sont creees en `umask 077` (dossiers/fichiers illisibles par group/other) et le
service tourne sans capacites Linux superflues (`cap_drop: ALL` + `DAC_READ_SEARCH`,
`no-new-privileges`). `backup` est un service OBLIGATOIRE de la stack (`required: true`).

### Variables d'environnement

Requises : `POSTGRES_PASSWORD` (et `POSTGRES_DB` si different de `postgres`).
Optionnelles : `BACKUP_HOUR` (02:30), `TZ`, `KEEP_DAILY/WEEKLY/MONTHLY`,
`BACKUP_VERIFY_RESTORE`, `NOTIFY_WEBHOOK_URL`, `NOTIFY_NTFY_URL`, `HEALTHCHECK_URL`.
Off-site (desactive par defaut) : `OFFSITE_ENABLED=true`, `OFFSITE_REMOTE=offsite:` (remote
CHIFFRE), `OFFSITE_RETENTION_DAYS` (60).

**Chiffrement obligatoire** : `backup.sh` REFUSE `OFFSITE_ENABLED=true` (et notifie l'echec) si
`RCLONE_CONFIG_OFFSITE_TYPE` n'est pas `crypt`, si `RCLONE_CONFIG_OFFSITE_PASSWORD` est vide ou si
`OFFSITE_REMOTE` ne commence pas par `offsite:`. Montage : `offraw` = stockage brut
(`RCLONE_CONFIG_OFFRAW_TYPE/PROVIDER/ENDPOINT/ACCESS_KEY_ID/SECRET_ACCESS_KEY/REGION`),
`offsite` = couche crypt par-dessus (`RCLONE_CONFIG_OFFSITE_TYPE=crypt`,
`RCLONE_CONFIG_OFFSITE_REMOTE=offraw:bucket/gfb`, `RCLONE_CONFIG_OFFSITE_PASSWORD`, `_PASSWORD2`,
valeurs obscurcies par `rclone obscure`). Conserver ces mots de passe HORS du VPS. Exemple complet
(commente) dans `deploy/.env.example`.
Notifications : `NOTIFY_WEBHOOK_URL`, `NOTIFY_NTFY_URL`, `HEALTHCHECK_URL` (JSON du webhook construit
par `jq`, jamais par concatenation).

## Restauration (restore.sh)

Test sans risque (base temporaire, supprimee ensuite, la prod n'est pas touchee) :

    docker compose -f deploy/compose.prod.yaml --env-file deploy/.env exec backup restore.sh --dump /backups/daily/<SET>/db.dump
    # depuis un poste de dev avec le conteneur Postgres local :
    deploy/backup/restore.sh --dump <SET>/db.dump --container supabase_db_Facture-Fasso

Reprise apres sinistre (stack neuve demarree, services applicatifs arretes) :

    docker compose stop app auth rest realtime storage meta kong functions
    docker compose exec backup restore.sh --dump /backups/daily/<SET>/db.dump --in-place --yes
    sudo tar -xzf /srv/fasso/backups/daily/<SET>/storage.tar.gz -C /srv/fasso/data/storage   # fichiers Storage (hote)
    docker compose up -d && deploy/db/migrate.sh   # rattrape d'eventuelles migrations plus recentes

Note : `/storage` etant monte en lecture seule dans le service `backup`, restaurer les
fichiers avec : `tar -xzf <SET>/storage.tar.gz -C /srv/fasso/data/storage` sur l'hote.
Des erreurs `permission denied`/`already exists` sur les schemas internes (realtime, extensions)
sont attendues ; les controles de fin (tables, migrations, factures, auth.users, policies) font foi.
Reinjecter `roles.sql` n'est necessaire que si la stack neuve n'a pas ses roles Supabase.

## Migrations (deploy/db)

    deploy/db/migrate.sh --container <db> --dry-run      # liste ce qui serait applique
    DATABASE_URL=postgresql://postgres:***@db:5432/postgres deploy/db/migrate.sh --seed
    docker compose -f deploy/compose.prod.yaml --env-file deploy/.env --profile migrate run --rm migrate

Idempotent (table supabase_migrations.schema_migrations, compatible CLI Supabase), checksums,
arret au premier echec. Tuning : `deploy/db/postgresql.conf` (profil 2 Go, valeurs 4 Go en commentaire).
