#!/usr/bin/env bash
# Planificateur : lance backup.sh chaque jour a BACKUP_HOUR (HH:MM, defaut 02:30,
# fuseau TZ). Commandes : (defaut) boucle quotidienne | now | <commande libre>
set -u
case "${1:-loop}" in
  now) exec /usr/local/bin/backup.sh ;;
  loop)
    HM="${BACKUP_HOUR:-02:30}"
    [ "${BACKUP_ON_START:-false}" = "true" ] && /usr/local/bin/backup.sh
    while true; do
      now=$(date +%s)
      next=$(date -d "$(date +%Y-%m-%d) $HM" +%s)
      [ "$next" -le "$now" ] && next=$(date -d "tomorrow $HM" +%s)
      echo "[backup] prochaine sauvegarde : $(date -d @"$next" '+%F %T %Z')"
      sleep $((next - now))
      /usr/local/bin/backup.sh || echo "[backup] echec (voir notification)"
    done ;;
  *) exec "$@" ;;
esac
