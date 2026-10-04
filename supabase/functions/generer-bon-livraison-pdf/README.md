# `generer-bon-livraison-pdf`

Génère le PDF d'un bon de livraison GFB (règle métier 15,
`supabase/migrations/0013_avenant_credit_entrepots.sql`) et le dépose dans le
bucket privé Storage `bons-livraison` (créé par
`supabase/migrations/0015_bucket_bons_livraison.sql`), puis retourne une URL
signée à durée limitée.

Aucune règle métier n'est recalculée ici (numérotation `BL`+`AAAAMMJJ`+séquence,
décrément de stock par entrepôt) : tout est déjà garanti par les triggers SQL de
`0013_avenant_credit_entrepots.sql` (`generer_numero_bon_livraison()`,
`gerer_ligne_bon_livraison()`). Cette fonction se contente de lire les valeurs déjà
calculées en base et de les mettre en page.

**Un bon de livraison n'est pas un document financier** (0013, commentaire de
`lignes_bon_livraison`) : le PDF n'affiche **aucun prix, aucun total, aucune
mention bancaire** — uniquement produit + quantité par ligne, contrairement au PDF
de facture.

## Entrée

```json
{ "bon_livraison_id": "5c1b0e2e-....-....-....-............" }
```

Validée avec Zod (`bon_livraison_id` doit être un UUID). Toute autre clé est ignorée.

## Sortie (200)

```json
{
  "pdf_url": "https://<project>.supabase.co/storage/v1/object/sign/bons-livraison/....pdf?token=...",
  "expire_dans_secondes": 3600,
  "numero_bon_livraison": "BL20260821001"
}
```

La durée de validité de l'URL signée est configurable via la variable
d'environnement `BON_LIVRAISON_PDF_SIGNED_URL_TTL_SECONDS` (par défaut `3600`, soit 1h).

Même correctif `PUBLIC_SUPABASE_URL` que `generer-facture-pdf` en développement
local (voir son README pour le détail) : nécessaire pour que `pdf_url` soit
joignable depuis l'hôte/le navigateur plutôt que de pointer vers le nom d'hôte
interne Docker (`http://kong:8000`).

## Authentification requise

Header `Authorization: Bearer <jwt utilisateur>` obligatoire (le token de session
Supabase Auth de l'agent ou de l'admin connecté — **pas** la clé `service_role`).
La fonction vérifie d'abord, via un client lié à ce JWT (donc soumis à RLS), que
l'appelant a le droit de voir le bon de livraison demandé :
- **admin** : tous les bons de livraison (`bons_livraison_admin_all`).
- **agent** : uniquement ses propres BL (`bons_livraison_lecture_agent_propre`,
  `bons_livraison.agent_id = auth.uid()`).

Une fois l'accès confirmé, le détail complet (lignes, produits, client, entrepôt,
agent, facture liée éventuelle, config entreprise) est chargé via `service_role`
côté serveur uniquement — l'autorisation reste basée sur la vérification RLS
précédente, jamais recalculée manuellement dans le code de la fonction.

## Bucket Storage : `bons-livraison` (pas `factures`)

Décision documentée en tête de `supabase/migrations/0015_bucket_bons_livraison.sql` :
un bucket privé **dédié**, distinct du bucket `factures`, pour préserver la
séparation par type de document déjà établie par `0001_schema_initial.sql`
(`factures` / `produits-photos` / `logo`) et ne pas mélanger un document
logistique (BL) avec un document financier (facture). RLS Storage miroir exact
de celle de `factures` : lecture admin (tout) + agent propriétaire uniquement
(1ᵉʳ segment du chemin = `agent_id`), écriture réservée à `service_role`.

## Idempotence

Le fichier est toujours écrit au chemin déterministe `{agent_id}/{numero_bl}.pdf`
dans le bucket `bons-livraison`, avec `upsert: true`. Régénérer le PDF d'un même
bon de livraison réécrit donc le même fichier (à jour par rapport aux données
actuelles du BL) au lieu de créer un fichier orphelin à chaque appel.

## Cas d'erreur gérés

| Cas | Code | Message |
|---|---|---|
| Méthode ≠ POST | 405 | Méthode non autorisée |
| Header `Authorization` absent | 401 | Authentification requise |
| Corps JSON invalide / `bon_livraison_id` pas un UUID | 400 | Entrée invalide + détail Zod |
| BL inexistant ou non accessible (RLS) | 404 | Bon de livraison introuvable ou accès refusé |
| `entreprise_config` introuvable (singleton non initialisé) | 500 | Configuration entreprise introuvable |
| Échec upload Storage / création URL signée | 500 | Erreur lors de l'enregistrement / du lien |
| Erreur inattendue | 500 | Erreur interne |

Un bon de livraison **sans aucune ligne** (orphelin, cf. le correctif d'audit
`0014_correctif_securite_bl_facture.sql` section 3, qui permet à l'agent de le
supprimer) n'est **pas bloqué** ici : le PDF est généré avec un tableau vide et la
mention « Aucune ligne saisie sur ce bon de livraison. » — ce cas n'a en pratique
plus de raison de survivre longtemps (l'agent peut le nettoyer lui-même), mais rien
n'empêche techniquement d'en imprimer un pour vérification/débogage.

Le logo entreprise est optionnel à l'affichage : si le téléchargement échoue (URL
cassée, format non supporté type WebP), le PDF est quand même généré sans logo (un
`console.warn` est loggé côté fonction, la requête n'échoue jamais pour ce motif).

## Exemple d'appel (`supabase-js`, depuis le frontend authentifié)

```ts
const { data, error } = await supabase.functions.invoke("generer-bon-livraison-pdf", {
  body: { bon_livraison_id: "5c1b0e2e-....-....-....-............" },
});
if (error) throw error;
window.open(data.pdf_url, "_blank");
```

## Exemple d'appel (`curl`, pour `qa-testeur`)

```bash
curl -i -X POST "$SUPABASE_URL/functions/v1/generer-bon-livraison-pdf" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bon_livraison_id":"5c1b0e2e-0000-0000-0000-000000000000"}'
```

`$USER_ACCESS_TOKEN` = `access_token` renvoyé par `supabase.auth.signInWithPassword(...)`
pour un compte agent (propriétaire du BL) ou admin de test (jamais la clé `service_role`).

## Points d'attention pour `expert-securite`

- Vérifier qu'un agent ne peut pas fournir un `bon_livraison_id` appartenant à un
  autre agent pour en récupérer le PDF (le test doit passer par le portail RLS,
  pas par une vérification manuelle de `agent_id` côté fonction).
- Vérifier que `SUPABASE_SERVICE_ROLE_KEY` n'apparaît dans aucune réponse, log
  client, ni variable exposée au bundle frontend.
- Le bucket `bons-livraison` est privé et sans policy d'écriture `authenticated` :
  seule cette fonction (via `service_role`) peut y écrire, conformément à
  `0015_bucket_bons_livraison.sql`.
- Confirmer qu'aucun prix/montant ne fuite sur ce PDF (le document ne doit
  contenir que produit + quantité, jamais `prix_unitaire`/`total_ligne` — ces
  colonnes n'existent d'ailleurs pas sur `lignes_bon_livraison`, cf. 0013).
