#!/usr/bin/env bash
# Cree le PREMIER compte Administrateur (ou promeut un compte existant).
#   deploy/scripts/create-admin.sh [--email E] [--nom N] [--generate] [--force]
#   fasso create-admin
#
# - Le compte est cree par l'API Auth admin (GoTrue, cle service_role) APPELEE DEPUIS le
#   conteneur `app` (reseau interne, route /auth/v1/admin fermee a Internet par Caddy).
#   La cle service_role vient de l'environnement du conteneur : jamais en argument.
#   Le mot de passe passe par l'entree standard (jamais visible dans `ps`).
# - Le profil public.utilisateurs est cree par le trigger gerer_nouvel_utilisateur() avec le
#   role 'agent' ; le script le passe ensuite a 'admin'. Le trigger trg_empecher_auto_promotion
#   (0001) refuse tout changement de role hors d'un admin connecte : au tout premier admin,
#   il n'y en a pas, la requete documentee dans seed.sql echoue donc ("Seul un administrateur
#   peut modifier le role"). Le script desactive ce trigger DANS une transaction unique
#   (reactive avant COMMIT ; en cas d'echec, tout est annule) et le journal d'audit
#   (modification_role_ou_statut_utilisateur) reste alimente.
# - Idempotent : relancer sur un e-mail deja admin ne change rien. Si un admin actif existe
#   deja (autre e-mail), refuse sauf --force.
# Options : --email E, --nom N (sinon questions), --generate (mot de passe genere, affiche une fois),
#           --force (autoriser un 2e admin par ce script ; les comptes se creent normalement
#           depuis l'ecran Utilisateurs de l'application).
# Tests : FASSO_DB_CONTAINER, FASSO_APP_CONTAINER (+ FASSO_AUTH_PREFIX) pour viser des conteneurs ephemeres.
set -euo pipefail
umask 077
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"

EMAIL=""; NOM=""; GEN=0; FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --email)    [ $# -ge 2 ] || die "--email attend une valeur"; EMAIL="$2"; shift 2 ;;
    --nom)      [ $# -ge 2 ] || die "--nom attend une valeur"; NOM="$2"; shift 2 ;;
    --generate) GEN=1; shift ;;
    --force)    FORCE=1; shift ;;
    -h|--help)  sed -n '2,23p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "option inconnue : $1 (voir --help)" ;;
  esac
done

exiger_docker
if [ -z "${FASSO_DB_CONTAINER:-}" ]; then charger_env; fi

# --- Conteneur qui appelle l'API Auth ---------------------------------------
app_exec() { # stdin -> node dans le conteneur ; $1 = script JS
  if [ -n "${FASSO_APP_CONTAINER:-}" ]; then
    docker exec -i -e "FASSO_AUTH_PREFIX=${FASSO_AUTH_PREFIX-/auth/v1}" "$FASSO_APP_CONTAINER" node -e "$1"
  else
    "${COMPOSE[@]}" exec -T app node -e "$1"
  fi
}

# --- Saisies ------------------------------------------------------------------
EMAIL_RE='^[A-Za-z0-9._%+-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$'
[ -n "$EMAIL" ] || { printf 'E-mail du compte administrateur : '; IFS= read -r EMAIL || true; }
EMAIL="$(printf '%s' "$EMAIL" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
[ "${#EMAIL}" -le 254 ] && [[ "$EMAIL" =~ $EMAIL_RE ]] || die "adresse e-mail invalide : '$EMAIL'"

# --- Etat actuel -------------------------------------------------------------
etat="$(db_psql -At -F '|' -v "email=$EMAIL" <<'SQL'
select (select count(*) from public.utilisateurs where role = 'admin' and actif),
       coalesce((select u.role::text || '/' || u.actif::text from auth.users a join public.utilisateurs u on u.id = a.id
                 where lower(a.email) = lower(:'email')), ''),
       exists (select 1 from auth.users where lower(email) = lower(:'email'));
SQL
)" || die "lecture de la base impossible (la stack est-elle demarree ? fasso status)."
IFS='|' read -r NB_ADMINS CIBLE EXISTE <<<"$etat"

if [ "$CIBLE" = "admin/true" ]; then
  ok "$EMAIL est déjà administrateur actif : rien à faire."
  exit 0
fi
if [ "$NB_ADMINS" -gt 0 ] && [ "$FORCE" = 0 ]; then
  ko "Un administrateur existe déjà ($NB_ADMINS actif(s))."
  echo "  Créez les autres comptes depuis l'application (écran Utilisateurs)." >&2
  echo "  Pour forcer quand même : create-admin.sh --force" >&2
  exit 1
fi

CREER=1; [ "$EXISTE" = "t" ] && CREER=0
if [ "$CREER" = 0 ]; then
  echo "Le compte $EMAIL existe déjà (rôle/actif : ${CIBLE:-sans profil}) : il sera promu administrateur,"
  echo "son mot de passe actuel n'est pas modifié."
else
  [ -n "$NOM" ] || { printf "Nom affiché [Administrateur] : "; IFS= read -r NOM || true; }
  NOM="${NOM:-Administrateur}"
  [ "${#NOM}" -le 100 ] || die "nom trop long (100 caracteres maximum)."
  [[ "$NOM" != *[[:cntrl:]]* ]] || die "nom : caracteres de controle interdits."

  PASS=""; GENERE=0
  if [ "$GEN" = 1 ]; then GENERE=1
  else
    for _ in 1 2 3; do
      printf 'Mot de passe (12 caractères minimum, saisie masquée ; Entrée seule = en générer un) : '
      IFS= read -rs PASS || true; echo
      if [ -z "$PASS" ]; then GENERE=1; break; fi
      if [ "${#PASS}" -lt 12 ]; then ko "12 caractères minimum (${#PASS} saisis)."; PASS=""; continue; fi
      printf 'Confirmer le mot de passe : '
      IFS= read -rs PASS2 || true; echo
      if [ "$PASS" = "${PASS2:-}" ]; then break; fi
      ko "Les deux saisies diffèrent."; PASS=""
    done
    [ -n "$PASS" ] || [ "$GENERE" = 1 ] || die "mot de passe non valide apres 3 essais."
  fi
  if [ "$GENERE" = 1 ]; then
    command -v openssl >/dev/null || die "openssl requis pour generer un mot de passe."
    while :; do
      PASS="$(openssl rand -base64 64 | tr -dc 'A-Za-z0-9' | cut -c1-20)"
      [ "${#PASS}" -eq 20 ] && [[ "$PASS" =~ [a-z] && "$PASS" =~ [A-Z] && "$PASS" =~ [0-9] ]] && break
    done
  fi

  # --- Creation du compte Auth (mot de passe par stdin, cle service_role = env du conteneur)
  # stdin : 3 lignes (e-mail, nom, mot de passe). Le script JS ne contient aucun secret.
  JS='(async()=>{try{const L=require("fs").readFileSync(0,"utf8").split("\n");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key){console.log("ERR cle service_role absente du conteneur");process.exit(1)}
  const base=(process.env.SUPABASE_INTERNAL_URL||"http://kong:8000").replace(/\/$/,"");
  const pre=process.env.FASSO_AUTH_PREFIX??"/auth/v1";
  const r=await fetch(base+pre+"/admin/users",{method:"POST",headers:{"Content-Type":"application/json",apikey:key,Authorization:"Bearer "+key},
   body:JSON.stringify({email:L[0],password:L[2],email_confirm:true,user_metadata:{nom:L[1]}})});
  const t=await r.text();let j={};try{j=JSON.parse(t)}catch{}
  if(r.ok){console.log("OK "+j.id);return}
  console.log("ERR "+r.status+" "+(j.error_code||j.msg||j.message||"reponse inattendue"));process.exit(1)}
  catch(e){console.log("ERR "+(e&&e.message||e));process.exit(1)}})();'
  REP="$(printf '%s\n%s\n%s\n' "$EMAIL" "$NOM" "$PASS" | app_exec "$JS")" || true
  case "$REP" in
    OK\ *) ok "Compte Auth créé (${REP#OK })." ;;
    *"email_exists"*|*"user_already_exists"*) die "Un compte avec cet e-mail existe déjà : relancer la commande (il sera promu)." ;;
    *"weak_password"*) die "Mot de passe refusé par le serveur d'authentification (trop faible)." ;;
    *) die "création du compte refusée : ${REP:-aucune réponse (conteneur app démarré ? fasso status)}" ;;
  esac
  if [ "$GENERE" = 1 ]; then
    echo
    echo "  ┌──────────────────────────────────────────────────────────────┐"
    printf '  │  E-mail       : %-45s│\n' "$EMAIL"
    printf '  │  Mot de passe : %-45s│\n' "$PASS"
    echo "  │  A NOTER MAINTENANT : il ne sera PLUS jamais affiché.        │"
    echo "  └──────────────────────────────────────────────────────────────┘"
    echo
  fi
  PASS=""; PASS2=""
fi

# --- Promotion (profil public.utilisateurs) ---------------------------------
db_psql -v "email=$EMAIL" -v "nom=$NOM" <<'SQL' >/dev/null || die "promotion impossible. Relancer la commande : le compte existe, il sera simplement promu."
begin;
set local lock_timeout = '10s';
alter table public.utilisateurs disable trigger trg_empecher_auto_promotion;
update public.utilisateurs u
   set role = 'admin', actif = true, nom = coalesce(nullif(:'nom', ''), u.nom)
  from auth.users a
 where a.id = u.id and lower(a.email) = lower(:'email');
insert into public.utilisateurs (id, nom, role, actif)
select a.id, coalesce(nullif(:'nom', ''), split_part(a.email, '@', 1)), 'admin', true
  from auth.users a
 where lower(a.email) = lower(:'email')
   and not exists (select 1 from public.utilisateurs x where x.id = a.id);
alter table public.utilisateurs enable trigger trg_empecher_auto_promotion;
do $v$
begin
  if (select tgenabled from pg_trigger where tgrelid = 'public.utilisateurs'::regclass and tgname = 'trg_empecher_auto_promotion') <> 'O' then
    raise exception 'trg_empecher_auto_promotion non reactive';
  end if;
end
$v$;
commit;
SQL

verif="$(db_psql -At -v "email=$EMAIL" <<'SQL'
select u.role::text || '/' || u.actif::text from public.utilisateurs u join auth.users a on a.id = u.id where lower(a.email) = lower(:'email');
SQL
)"
[ "$verif" = "admin/true" ] || die "verification : profil '$verif' au lieu de admin/true."
ok "$EMAIL est administrateur actif."
if [ -n "${DOMAIN:-}" ]; then echo "  Connexion : https://$DOMAIN  (changez ensuite le mot de passe si vous en avez reçu un généré)"; fi
