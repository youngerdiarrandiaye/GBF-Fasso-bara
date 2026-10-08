#!/usr/bin/env bash
# Preparation d'un VPS Ubuntu 22.04/24.04 vierge. A lancer UNE fois, en root :
#   sudo bash bootstrap-vps.sh [nom_utilisateur]      (defaut : fasso)
# Fait : mises a jour + paquets, Docker (depot officiel), utilisateur non-root,
# pare-feu ufw (22/80/443 uniquement), swap, rotation des logs Docker,
# durcissement SSH (si une cle SSH est installee), arborescence /srv/fasso.
# Idempotent : peut etre relance sans danger.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Lancer en root (sudo)." >&2; exit 1; }
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || { echo "Ubuntu requis (detecte : ${ID:-?})." >&2; exit 1; }

APP_USER="${1:-fasso}"
SWAP_GB="${SWAP_GB:-2}"
DATA_ROOT="/srv/fasso"
export DEBIAN_FRONTEND=noninteractive

echo "== Paquets de base"
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg git ufw fail2ban unattended-upgrades openssl

echo "== Docker (depot officiel)"
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
# Rotation des logs par defaut pour tout conteneur (en plus de celle du compose)
if [ ! -f /etc/docker/daemon.json ]; then
  cat > /etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
JSON
  systemctl restart docker
fi
systemctl enable --now docker

echo "== Utilisateur non-root : $APP_USER"
if ! id "$APP_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$APP_USER"
fi
usermod -aG docker,sudo "$APP_USER"
# Reprend les cles SSH de root pour ne pas se verrouiller dehors. Les lignes portant des
# options `command=` (cles a commande forcee, p. ex. celles posees par un hebergeur ou un
# outil de sauvegarde) ne sont PAS copiees : elles ne doivent pas devenir des acces shell
# normaux pour l'utilisateur d'administration. Commentaires et lignes vides ignores.
if [ -s /root/.ssh/authorized_keys ] && [ ! -s "/home/$APP_USER/.ssh/authorized_keys" ]; then
  install -d -m 700 -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/.ssh"
  tmp_keys="$(mktemp)"
  grep -Ev '^[[:space:]]*(#|$)|command=' /root/.ssh/authorized_keys > "$tmp_keys" || true
  if [ -s "$tmp_keys" ]; then
    install -m 600 -o "$APP_USER" -g "$APP_USER" "$tmp_keys" "/home/$APP_USER/.ssh/authorized_keys"
  else
    echo "ATTENTION : aucune cle sans command= a copier depuis /root/.ssh/authorized_keys."
  fi
  rm -f "$tmp_keys"
fi
# sudo sans mot de passe (compte sans mot de passe, acces par cle uniquement)
echo "$APP_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$APP_USER"
chmod 440 "/etc/sudoers.d/90-$APP_USER"

echo "== Arborescence $DATA_ROOT"
mkdir -p "$DATA_ROOT"/data/{db,storage,caddy/data,caddy/config,deno-cache} "$DATA_ROOT/backups"
# /srv/fasso en 711 : traversable (deploy.sh teste l'existence de data/db) mais non listable.
chmod 711 "$DATA_ROOT" "$DATA_ROOT/data"
chmod 700 "$DATA_ROOT/backups"
chown "$APP_USER:$APP_USER" "$DATA_ROOT" "$DATA_ROOT/backups"
# Donnees ecrites par des conteneurs qui tournent en root : 700 root (inaccessibles aux
# autres comptes du VPS). data/db n'est PAS touche : il appartient a l'uid postgres de
# l'image (geree par l'entrypoint de la base).
chmod 700 "$DATA_ROOT/data/storage" "$DATA_ROOT/data/caddy" "$DATA_ROOT/data/deno-cache"

echo "== Swap (${SWAP_GB} Go)"
if ! swapon --show | grep -q .; then
  if [ ! -f /swapfile ]; then
    fallocate -l "${SWAP_GB}G" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_GB * 1024))
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
cat > /etc/sysctl.d/99-fasso.conf <<'CONF'
vm.swappiness=10
vm.overcommit_memory=1
CONF
sysctl --system >/dev/null

# Port SSH reel (sshd -T, pas une valeur supposee) : evite de se couper l'acces si sshd
# ecoute ailleurs que sur 22.
SSH_PORTS="$(sshd -T 2>/dev/null | awk '$1=="port"{print $2}' | sort -u)"
[ -n "$SSH_PORTS" ] || SSH_PORTS=22

echo "== Pare-feu ufw (SSH: $(echo $SSH_PORTS | tr '\n' ' '), 80, 443 uniquement)"
ufw default deny incoming
ufw default allow outgoing
for p in $SSH_PORTS; do ufw allow "$p/tcp"; done
ufw allow 80/tcp
ufw allow 443   # tcp + udp (HTTP/3)
ufw --force enable
ufw status verbose
echo "NB : Docker contourne ufw pour les ports PUBLIES. Seul Caddy publie 80/443 ;"
echo "     Studio est lie a 127.0.0.1 (tunnel SSH). Ne jamais ajouter d'autre 'ports:' public."

echo "== SSH"
# Durcissement uniquement si une cle est reellement installee pour $APP_USER (sinon on
# se verrouille dehors). 00-* = premier fichier lu : sshd garde la PREMIERE valeur d'une
# directive, donc ce fichier l'emporte sur 50-cloud-init.conf & co.
if [ -s "/home/$APP_USER/.ssh/authorized_keys" ] && grep -Eq '^(ssh-|ecdsa-|sk-)' "/home/$APP_USER/.ssh/authorized_keys"; then
  SSHD_DROPIN=/etc/ssh/sshd_config.d/00-fasso.conf
  rm -f /etc/ssh/sshd_config.d/90-fasso.conf   # ancien nom (lu trop tard)
  cat > "$SSHD_DROPIN" <<'CONF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
CONF
  if ! sshd -t; then rm -f "$SSHD_DROPIN"; echo "ERREUR : configuration sshd invalide, durcissement annule." >&2; exit 1; fi
  eff="$(sshd -T)"
  for kv in "passwordauthentication no" "permitrootlogin no"; do
    if ! printf '%s\n' "$eff" | grep -qix "$kv"; then
      rm -f "$SSHD_DROPIN"
      echo "ERREUR : sshd -T ne donne pas '$kv' (une autre directive prend le pas). Durcissement annule ; verifier /etc/ssh/sshd_config*." >&2
      exit 1
    fi
  done
  systemctl reload ssh || systemctl reload sshd
  echo "Connexion root et mot de passe SSH desactives (verifie par sshd -T)."
  echo "!! GARDEZ CETTE SESSION OUVERTE. Dans un AUTRE terminal, testez : ssh $APP_USER@<ip>"
  echo "!! Fermez cette session seulement apres que le test fonctionne."
else
  echo "ATTENTION : aucune cle SSH valide pour $APP_USER, durcissement SSH ignore. Ajoutez une cle puis relancez."
fi

echo "== Commande 'fasso' (exploitation au quotidien)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/fasso" ] && [[ "$SCRIPT_DIR" != /root/* ]]; then
  chmod +x "$SCRIPT_DIR"/*.sh "$SCRIPT_DIR/fasso"
  ln -sf "$SCRIPT_DIR/fasso" /usr/local/bin/fasso
  echo "Installee : /usr/local/bin/fasso -> $SCRIPT_DIR/fasso   (essayer : fasso help)"
else
  echo "Non installee ici (depot absent ou sous /root) : deploy.sh l'installera au premier deploiement."
fi

systemctl enable --now fail2ban unattended-upgrades

echo
echo "Termine. Etapes suivantes (en tant que $APP_USER) :"
echo "  git clone <depot> ~/facture-fasso && cd ~/facture-fasso"
echo "  ./deploy/scripts/gen-secrets.sh && nano deploy/.env"
echo "  ./deploy/scripts/deploy.sh      (ensuite : fasso help, fasso create-admin)"
