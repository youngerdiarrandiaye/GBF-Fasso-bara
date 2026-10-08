#!/usr/bin/env bash
# Genere deploy/.env a partir de deploy/.env.example avec des secrets aleatoires :
# POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY et SERVICE_ROLE_KEY (JWT HS256 signes
# avec JWT_SECRET, validite 10 ans), SECRET_KEY_BASE, REALTIME_DB_ENC_KEY, CRON_SECRET.
# Usage : deploy/scripts/gen-secrets.sh [--force]   (refuse d'ecraser un .env existant)
# Les secrets ne sont JAMAIS affiches.
set -euo pipefail
umask 077

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY="$(cd "$HERE/.." && pwd)"
ENV_FILE="$DEPLOY/.env"
EXAMPLE="$DEPLOY/.env.example"

command -v openssl >/dev/null || { echo "openssl requis" >&2; exit 1; }
[ -f "$EXAMPLE" ] || { echo "Introuvable : $EXAMPLE" >&2; exit 1; }
if [ -e "$ENV_FILE" ] && [ "${1:-}" != "--force" ]; then
  echo "$ENV_FILE existe deja. Relancer avec --force pour l'ecraser (les anciennes cles seront PERDUES)." >&2
  exit 1
fi

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
rand_hex() { openssl rand -hex "$1"; }

JWT_SECRET="$(rand_hex 32)"

make_jwt() { # $1 = role
  local header payload unsigned sig now exp
  now="$(date +%s)"; exp=$((now + 10 * 365 * 24 * 3600))
  header="$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)"
  payload="$(printf '{"iss":"supabase","role":"%s","iat":%s,"exp":%s}' "$1" "$now" "$exp" | b64url)"
  unsigned="$header.$payload"
  sig="$(printf '%s' "$unsigned" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | b64url)"
  printf '%s.%s' "$unsigned" "$sig"
}

declare -A V=(
  [POSTGRES_PASSWORD]="$(rand_hex 24)"
  [JWT_SECRET]="$JWT_SECRET"
  [ANON_KEY]="$(make_jwt anon)"
  [SERVICE_ROLE_KEY]="$(make_jwt service_role)"
  [SECRET_KEY_BASE]="$(rand_hex 32)"
  [REALTIME_DB_ENC_KEY]="$(rand_hex 8)"
  [CRON_SECRET]="$(rand_hex 24)"
)

tmp="$(mktemp "$DEPLOY/.env.XXXXXX")"
while IFS= read -r line || [ -n "$line" ]; do
  key="${line%%=*}"
  if [[ "$line" == *=* && -n "${V[$key]+x}" ]]; then
    printf '%s=%s\n' "$key" "${V[$key]}"
  else
    printf '%s\n' "$line"
  fi
done < "$EXAMPLE" > "$tmp"
mv "$tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "OK : $ENV_FILE genere (chmod 600)."
echo "A renseigner a la main : DOMAIN, API_DOMAIN, ACME_EMAIL, SMTP_*, RESEND_API_KEY, EMAIL_EXPEDITEUR."
echo "SAUVEGARDEZ ce fichier hors du VPS (gestionnaire de mots de passe) : sans JWT_SECRET/POSTGRES_PASSWORD, les donnees sont inexploitables."
