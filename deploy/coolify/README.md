# GitHub vers Coolify

Ressource Docker Compose depuis `main`. Base directory `/`, compose
`/compose.coolify.yaml` a la racine du depot. Les chemins de fichiers sont
relatifs a cette racine ; les donnees restent sous `/srv/fasso` avec des
chemins absolus fixes pour eviter les ambiguities du parseur Coolify.

Activer **Preserve repository during deployment** : les configurations,
templates, fonctions et migrations sont montees depuis les fichiers Git.
Exclure le service ponctuel `init` du suivi global de sante dans Coolify ;
son code de sortie reste controle par la dependance de l'application.

Configurer les variables de `deploy/.env.example` dans Coolify. Ne pas ajouter
de `.env` au depot. Generer les secrets avec `deploy/scripts/gen-secrets.sh`
dans un environnement protege ; les cles JWT anon/service doivent correspondre
au meme JWT_SECRET. `DOMAIN` et `API_DOMAIN` sont les noms sans `https://`.

Les variables doivent etre disponibles au build ET au runtime pour que Compose
puisse interpoler la stack complete pendant le build. Activer `Use Docker Build
Secrets` et desactiver `Inject build arguments to Dockerfile` : seuls les deux
arguments publics explicitement declares dans Dockerfile sont integres au build
Next. Les autres valeurs restent hors du contexte et des couches des images.

Associer au service **caddy** les domaines HTTPS : application vers port **8080**,
API vers port **8081**. Coolify termine TLS. Ne pas exposer app, Kong, DB ou
Studio sur Internet. Caddy conserve les restrictions API et les templates Auth.

Avant le premier lancement, creer `/srv/fasso/data/{db,storage,deno-cache}` et
`/srv/fasso/backups`. Les bind mounts restent persistants entre revisions.
Prevoir les ressources necessaires a Supabase et au build Node ; les limites de
la stack totalisent environ 9 Go, en plus de Coolify et du build.

`init` attend DB et Storage, sauvegarde, applique les migrations en mode strict,
configure Vault, puis autorise le demarrage de l'application. Une erreur bloque
ce deploiement. Sur une base vierge, il conserve un dump initial verifie dans
`/srv/fasso/backups/bootstrap`, car la sauvegarde reguliere exige les tables
applicatives. Un Storage vide est accepte. `backup` assure ensuite la sauvegarde
quotidienne. Configurer
une copie chiffree hors du VPS avec les variables RCLONE/OFFSITE pour proteger
contre la perte du serveur ; les sauvegardes locales seules ne le font pas.

Pour garantir que `init` est recree a chaque revision, definir
`FASSO_DEPLOY_REVISION` avec le SHA Git deploye dans Coolify avant chaque
declenchement. Un simple redeploiement du meme SHA peut reutiliser un job deja
termine : forcer sa recreation avant de relancer les migrations si necessaire.
Le pipeline doit verifier le statut final Coolify et les endpoints HTTPS ; la
reponse du webhook confirme uniquement l'acceptation de la demande.

Les fichiers SQL deja appliques ne doivent pas etre modifies. Un rollback de
l'image applicative n'annule pas les migrations ; utiliser une migration
correctrice ou une restauration validee. Ne pas lancer deux deploiements en
parallele. Le premier utilisateur administrateur se cree avec le script
`deploy/scripts/create-admin.sh`, apres verification des variables et des
acces reseau. Les scripts d'exploitation existants ciblent la stack prod
historique et ne doivent pas etre utilises tels quels contre cette ressource.
