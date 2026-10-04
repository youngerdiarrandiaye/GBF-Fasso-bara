# `alerte-stock-bas`

Scan quotidien de complément pour les alertes de stock bas, à 6h00 — **désormais
raisonné PAR ENTREPÔT** (règle 16, `supabase/migrations/0013_avenant_credit_entrepots.sql`).

## À lire avant tout : ce qui est DÉJÀ fait côté SQL

`supabase/migrations/0001_schema_initial.sql` (base) puis
`0013_avenant_credit_entrepots.sql` (adaptation multi-entrepôts, règle 16)
implémentent déjà entièrement la règle métier « alerte de stock bas » (règle 6) :

- Trigger **temps réel** `verifier_seuil_stock_entrepot()` sur `stock_entrepot` :
  crée une ligne `alertes_stock` (avec `entrepot_id`) dès qu'un couple
  (produit, entrepôt) passe sous son `seuil_alerte` (INSERT ou UPDATE de
  `quantite_stock`/`seuil_alerte`). Remplace l'ancien trigger `verifier_seuil_stock()`
  sur `produits` (détaché depuis 0013 : `produits.quantite_stock`/`seuil_alerte`
  sont **dépréciées**, gelées à leur dernière valeur réelle, plus jamais mises à
  jour — ne plus les lire ni les écrire nulle part, y compris dans cette fonction).
- Fonction SQL **`scanner_alertes_stock_quotidien()`** (même nom qu'en 0001, mais
  `CREATE OR REPLACE`ée par 0013 pour scanner `stock_entrepot` au lieu de
  `produits`) : filet de sécurité qui rebalaie tous les couples (produit, entrepôt)
  actifs sous seuil (ex: seuil abaissé sans mouvement de stock associé) — **déjà
  planifiée** en base via
  `cron.schedule('scan-alertes-stock-quotidien', '0 6 * * *', 'SELECT scanner_alertes_stock_quotidien();')`,
  sans reconfiguration nécessaire du job pg_cron existant (nom de fonction inchangé).
- `alertes_stock.entrepot_id` (NOT NULL depuis 0013) : chaque alerte précise
  désormais l'entrepôt concerné, et le `message` généré côté SQL l'inclut déjà en
  toutes lettres, ex. :
  `Stock bas pour "Spray Tube HYB1-3" à l'entrepôt "Thiès" : 2 restant(s), seuil d'alerte 5`.
- La table `alertes_stock` est déjà ajoutée à la publication `supabase_realtime` :
  toute nouvelle ligne y est donc **déjà diffusée nativement** aux clients abonnés
  via `postgres_changes`, sans code applicatif supplémentaire :

  ```ts
  supabase
    .channel("alertes_stock")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "alertes_stock" }, (payload) => { ... })
    .subscribe();
  ```

**Conséquence : le scan quotidien à 6h00 (par entrepôt) fonctionne déjà sans cette
Edge Function.** Son rôle n'a pas changé de nature avec l'avenant multi-entrepôts :
elle n'implémente PAS la sélection "produits sous seuil, par entrepôt" (ce serait un
recalcul interdit d'une règle déjà couverte côté base) — seule la FORME des données
qu'elle lit/relaie a changé. C'est un complément optionnel qui :
1. Appelle la RPC SQL existante `scanner_alertes_stock_quotidien()` (aucune
   logique de sélection dupliquée).
2. Récupère les alertes actives (`lue = false`) avec le produit **et l'entrepôt**
   déjà joints (`produit:produit_id`, `entrepot:entrepot_id`).
3. Enrichit chaque alerte avec la quantité/le seuil réels du couple (produit,
   entrepôt) concerné, lus dans `stock_entrepot` (source de vérité depuis 0013 —
   plus jamais `produits.quantite_stock`/`seuil_alerte`). Étape non bloquante :
   en cas d'échec, le scan reste réussi (déjà garanti en base à l'étape 1), seul
   l'enrichissement structuré du payload de diffusion est perdu (le `message`
   textuel contient de toute façon déjà la quantité/le seuil).
4. Diffuse un événement **Realtime Broadcast** enrichi sur le canal
   `alertes_stock` (payload prêt à afficher : nom produit, nom entrepôt, quantité,
   seuil, message) — pratique en complément du flux `postgres_changes` brut, en
   particulier pour agréger "toutes les alertes actives" en un seul message
   plutôt que de recevoir un événement par ligne insérée.

## Entrée

Aucun corps requis (`POST` sans body, ou `{}`).

## Sortie (200)

```json
{
  "scan_effectue": true,
  "alertes_actives": 3,
  "diffusion_realtime": true
}
```

## Authentification

Cette fonction est destinée à être appelée par `pg_cron`/`pg_net` (donc sans JWT
utilisateur), avec un des deux mécanismes suivants :

- Header `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (jamais exposé au
  frontend — uniquement utilisé serveur-à-serveur par `pg_net`).
- Header `x-cron-secret: <valeur de la variable d'env CRON_SECRET>` si vous
  préférez ne pas faire transiter la clé `service_role` dans `pg_net`.

Un déclenchement manuel est aussi accepté avec une session **admin** classique
(`Authorization: Bearer <jwt admin>`), pratique pour un bouton "Scanner
maintenant" côté dashboard ou pour les tests `qa-testeur`. Toute autre requête
(agent, ou non authentifiée sans secret) reçoit `401`/`403`.

## Cas d'erreur gérés

| Cas | Code | Message |
|---|---|---|
| Méthode ≠ POST | 405 | Méthode non autorisée |
| Ni `service_role`, ni `x-cron-secret`, ni JWT | 401 | Authentification requise |
| JWT valide mais rôle ≠ admin (ou compte inactif) | 403 | Accès réservé |
| Échec de la RPC SQL | 500 | Échec du scan quotidien |
| Échec lecture des alertes actives | 500 | Échec de lecture |
| Échec diffusion Realtime Broadcast | 200 (avec `diffusion_realtime: false`) | Le scan reste réussi ; la diffusion est *best effort* et ne doit pas faire échouer l'insertion déjà garantie côté base |

## Câblage `pg_cron` recommandé (optionnel, à valider avec `architecte-bdd`)

Le scan lui-même est déjà planifié en SQL pur (voir plus haut) : rien à faire
pour que la règle 6 fonctionne. Si vous voulez EN PLUS le broadcast enrichi de
cette fonction à 6h00, ajoutez un second job `pg_cron` (extension `pg_net`
requise) dans une future migration, par exemple :

```sql
-- Nécessite l'extension pg_net (Dashboard > Database > Extensions).
SELECT cron.schedule(
  'alerte-stock-bas-edge-broadcast',
  '5 6 * * *',  -- 5 minutes après le scan SQL direct, pour laisser le temps aux insertions
  $$
  SELECT net.http_post(
    url := '<SUPABASE_URL>/functions/v1/alerte-stock-bas',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY_EN_SECRET_VAULT>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Ne pas coder la clé `service_role` en clair dans une migration versionnée :
utiliser `vault.create_secret()` / Supabase Vault, ou déclarer ce job depuis le
Dashboard (Database > Cron Jobs) où la clé peut être stockée de façon sécurisée.

## Exemple d'appel (`curl`, pour `qa-testeur`)

```bash
# Avec la clé service_role (test serveur-à-serveur) :
curl -i -X POST "$SUPABASE_URL/functions/v1/alerte-stock-bas" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{}'

# Avec une session admin :
curl -i -X POST "$SUPABASE_URL/functions/v1/alerte-stock-bas" \
  -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN" \
  -H "Content-Type: application/json" -d '{}'
```

## Points d'attention pour `expert-securite`

- Confirmer que `verify_jwt = false` est bien configuré pour cette fonction dans
  `supabase/config.toml` (sinon la passerelle Supabase rejette les appels
  `x-cron-secret` sans JWT avant même d'atteindre le code applicatif) — voir
  `supabase/config.toml` livré avec ce lot.
- Vérifier que `CRON_SECRET`, s'il est utilisé, est bien un secret fort stocké
  dans les variables d'environnement de la fonction (jamais commité).
