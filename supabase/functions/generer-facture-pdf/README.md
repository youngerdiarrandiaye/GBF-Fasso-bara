# `generer-facture-pdf`

Génère le PDF d'une facture GFB au format proforma réel (réf. modèle `FP20260611001`)
et le dépose dans le bucket privé Storage `factures`, puis retourne une URL signée
à durée limitée.

Aucune règle métier n'est recalculée ici (numérotation, totaux, prix des lignes
"inclus dans kit", statut de paiement...) : tout est déjà garanti par les
triggers SQL de `supabase/migrations/0001_schema_initial.sql`. Cette fonction se
contente de lire les valeurs déjà calculées en base et de les mettre en page.

## Entrée

```json
{ "facture_id": "5c1b0e2e-....-....-....-............" }
```

Validée avec Zod (`facture_id` doit être un UUID). Toute autre clé est ignorée.

## Sortie (200)

```json
{
  "pdf_url": "https://<project>.supabase.co/storage/v1/object/sign/factures/....pdf?token=...",
  "expire_dans_secondes": 3600,
  "numero_facture": "FP20260611001"
}
```

La durée de validité de l'URL signée est configurable via la variable
d'environnement `FACTURE_PDF_SIGNED_URL_TTL_SECONDS` (par défaut `3600`, soit 1h).

## URL signée inutilisable en développement local : `PUBLIC_SUPABASE_URL`

En développement local (`supabase start`), le runtime des Edge Functions reçoit
automatiquement `SUPABASE_URL=http://kong:8000` — le nom d'hôte **interne** du
conteneur Docker Kong (la passerelle API), résolu uniquement à l'intérieur du
réseau Docker de la stack Supabase. Le client `service_role` (voir
`_shared/clients.ts`) est construit avec cette URL, donc `pdf_url` pointerait,
sans correctif, vers `http://kong:8000/storage/v1/object/sign/...` : injoignable
depuis la machine hôte ou un navigateur (confirmé par test réel).

Correctif appliqué : `toPublicUrl()` (dans `_shared/clients.ts`) réécrit
uniquement l'origine (protocole + host + port) de l'URL signée juste avant de la
renvoyer, en conservant intact le chemin et le `token` de signature. Elle ne fait
rien tant que la variable d'environnement optionnelle `PUBLIC_SUPABASE_URL` n'est
pas définie — donc **aucun impact en production Cloud**, où `SUPABASE_URL` est
déjà l'URL publique réelle (`https://xxx.supabase.co`).

Pour activer ce correctif en local, ajouter dans `supabase/functions/.env`
(fichier lu automatiquement par `supabase start`) :

```
PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
```

(remplacer `54321` par le port réellement exposé par `supabase start`, visible
dans son propre affichage sous `API_URL` / `API URL`).

**Important — pourquoi `PUBLIC_SUPABASE_URL` et non `SUPABASE_PUBLIC_URL`** :
testé en conditions réelles, le CLI Supabase rejette silencieusement (simple
warning en log, pas d'erreur bloquante) toute variable de
`supabase/functions/.env` dont le nom **commence** par `SUPABASE_` :

```
Env name cannot start with SUPABASE_, skipping: SUPABASE_PUBLIC_URL
```

Ce préfixe est réservé à l'usage interne de la plateforme, y compris côté
Supabase Cloud pour `supabase secrets set`. D'où le nom retenu ici, qui ne
commence pas par ce préfixe et fonctionne donc réellement dans les deux
environnements.

Après avoir créé/modifié `supabase/functions/.env`, un redémarrage de la stack
est nécessaire pour que la nouvelle variable soit injectée dans le conteneur
`edge-runtime` (`supabase stop` puis `supabase start` — les données de la base
sont conservées tant que `--no-backup` n'est pas utilisé).

## Authentification requise

Header `Authorization: Bearer <jwt utilisateur>` obligatoire (le token de session
Supabase Auth de l'agent ou de l'admin connecté — **pas** la clé `service_role`,
qui ne doit jamais quitter le serveur). La fonction vérifie d'abord, via un client
lié à ce JWT (donc soumis à RLS), que l'appelant a le droit de voir la facture
demandée :
- **admin** : toutes les factures.
- **agent** : uniquement ses propres factures (`factures.agent_id = auth.uid()`).

Une fois l'accès confirmé, le détail complet (lignes, produits, client, config
entreprise) est chargé via `service_role` côté serveur uniquement, pour éviter les
faux négatifs RLS sur des données de présentation annexes (produit désactivé
après coup, etc.) — l'autorisation reste basée sur la vérification RLS précédente.

## Avenant Crédit / BL / Multi-entrepôts (0013/0014)

Le PDF affiche désormais l'entrepôt d'origine de la facture (`factures.entrepot_id`
→ `entrepots.nom`), dans la boîte "AGENT COMMERCIAL" de l'en-tête (3ᵉ ligne, sous le
nom de l'agent) — emplacement choisi pour rester au plus près des informations déjà
affichées (numéro, date, client, agent) sans changer la mise en page existante.
Aucune autre règle métier n'est recalculée : `entrepot_id` est NOT NULL en base
depuis 0013 (toute facture en a un, backfillée vers "Siège" pour l'historique), la
fonction reste toutefois défensive et affiche `-` si la jointure ne renvoie rien.

## Idempotence

Le fichier est toujours écrit au chemin déterministe `{agent_id}/{numero_facture}.pdf`
dans le bucket `factures`, avec `upsert: true`. Régénérer le PDF d'une même facture
réécrit donc le même fichier (toujours à jour par rapport aux données actuelles de
la facture) au lieu de créer un fichier orphelin à chaque appel.

## Cas d'erreur gérés

| Cas | Code | Message |
|---|---|---|
| Méthode ≠ POST | 405 | Méthode non autorisée |
| Header `Authorization` absent | 401 | Authentification requise |
| Corps JSON invalide / `facture_id` pas un UUID | 400 | Entrée invalide + détail Zod |
| Facture inexistante ou non accessible (RLS) | 404 | Facture introuvable ou accès refusé |
| Facture encore au statut `brouillon` | 409 | Doit être au moins en `proforma` |
| `entreprise_config` introuvable (singleton non initialisé) | 500 | Configuration entreprise introuvable |
| Échec upload Storage / création URL signée | 500 | Erreur lors de l'enregistrement / du lien |
| Erreur inattendue | 500 | Erreur interne |

Les photos produit et le logo entreprise sont **optionnels** à l'affichage : si le
téléchargement d'une image échoue (URL cassée, format non supporté type WebP), le
PDF est quand même généré sans cette image (un `console.warn` est loggé côté
fonction, mais la requête n'échoue jamais pour ce motif).

## Exemple d'appel (`supabase-js`, depuis le frontend authentifié)

```ts
const { data, error } = await supabase.functions.invoke("generer-facture-pdf", {
  body: { facture_id: "5c1b0e2e-....-....-....-............" },
});
if (error) throw error;
window.open(data.pdf_url, "_blank");
```

## Exemple d'appel (`curl`, pour `qa-testeur`)

```bash
curl -i -X POST "$SUPABASE_URL/functions/v1/generer-facture-pdf" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"facture_id":"5c1b0e2e-0000-0000-0000-000000000000"}'
```

`$USER_ACCESS_TOKEN` = `access_token` renvoyé par `supabase.auth.signInWithPassword(...)`
pour un compte agent ou admin de test (jamais la clé `service_role`).

## Points d'attention pour `expert-securite`

- Vérifier qu'aucune variante de cette fonction ne permet à un agent de fournir un
  `facture_id` appartenant à un autre agent et d'en récupérer le PDF (le test doit
  passer par le portail RLS, pas par une vérification manuelle de `agent_id` côté
  fonction qui pourrait diverger des policies).
- Vérifier que `SUPABASE_SERVICE_ROLE_KEY` n'apparaît dans aucune réponse, log
  client, ni variable exposée au bundle frontend.
- Le bucket `factures` est privé et sans policy d'écriture `authenticated` : seule
  cette fonction (via `service_role`) peut y écrire, conformément à la migration.
