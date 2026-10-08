# Service de sauvegarde GFB-STOCK. Client PostgreSQL 17 = meme majeure que la base.
FROM postgres:17-alpine
RUN apk add --no-cache bash rclone curl jq tzdata tar gzip coreutils
COPY backup.sh restore.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh /usr/local/bin/entrypoint.sh
ENV TZ=Africa/Dakar
# Le conteneur tourne en root : necessaire pour lire les fichiers du Storage (ro)
# et ecrire /backups. Aucun port expose.
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
