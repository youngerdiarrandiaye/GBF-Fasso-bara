# `alerte-facture-impayee`

Scan quotidien de complément pour les alertes de retard de paiement (règle
métier 10 : facture validée/partiellement payée dont le solde reste dû plus
de 10 jours après `date_validation`), à 6h00.

## À lire avant tout : ce qui est DÉJÀ fait côté SQL

`supabase/migrations/0009_alertes_paiement.sql` implémente déjà entièrement la
règle métier « alerte de retard de paiement » (règle 10) :

- Vue **`v_factures_retard_paiement`** (`security_invoker = true`) : calcule
  dynamiquement, à chaque interrogation, les factures en retard (statut
  `validee`/`payee_partielle`, `date_validation` de plus de 10 jours, solde
  restant > 0). Hérite strictement des policies RLS de `factures`/`paiements`
  (un agent n'y voit que ses propres factures, un admin les voit toutes).
- Fonction SQL **`scanner_alertes_factures_impayees()`** (`SECURITY DEFINER`) :
  fait TOUT le travail — upsert d'une alerte non lue par facture en retard, et
  auto-résolution des alertes non lues devenues obsolètes (facture soldée,
  annulée, ou repassée sous 10 jours) — **déjà planifiée** en base via
  `cron.schedule('scan-alertes-factures-quotidien', '0 6 * * *', 'SELECT scanner_alertes_factures_impayees();')`.
- La table `alertes_factures` est déjà ajoutée à la publication
  `supabase_realtime` : toute nouvelle ligne / mise à jour y est donc **déjà
  diffusée nativement** aux clients abonnés via `postgres_changes`, sans code
  applicatif supplémentaire :

  ```ts
  supabase
    .channel("alertes_factures")
    .on("postgres_changes", { event: "*", schema: "public", table: "alertes_factures" }, (payload) => { ... })
    .subscribe();
  ```

**Conséquence : le scan quotidien à 6h00 fonctionne déjà sans cette Edge
Function.** Elle n'implémente donc PAS la sélection "factures en retard" (ce
serait un recalcul interdit d'une règle déjà couverte côté base, dans une
fonction `SECURITY DEFINER`) : c'est un complément optionnel qui appelle la
RPC SQL existante `scanner_alertes_factures_impayees()` (aucune logique de
sélection dupliquée) et compte les alertes actives (`lue = false`) pour la
réponse.

**Pas de diffusion Realtime Broadcast** (contrairement à une version
précédente de cette fonction) : un Broadcast Realtime n'est **pas** soumis
aux policies RLS, alors que `postgres_changes` l'est. `alertes_factures`
étant déjà dans la publication `supabase_realtime`, chaque INSERT/UPDATE y
est nativement diffusé via `postgres_changes`, protégé par la policy
`alertes_factures_admin_all` — c'est ce que consomme déjà
`components/admin/PaymentAlertsBell.tsx`. Diffuser en plus un Broadcast (topic
`alertes_paiement`) exposerait nom/téléphone client et montants dus à
quiconque possède la clé `anon` publique, sans aucune vérification de rôle
(finding corrigé suite à l'audit `expert-securite` du 2026-08-10 — voir aussi
la même remarque, non encore corrigée, sur `alerte-stock-bas`).

## Entrée

Aucun corps requis (`POST` sans body, ou `{}`).

## Sortie (200)

```json
{
  "scan_effectue": true,
  "alertes_actives": 2
}
```

## Authentification

Cette fonction est destinée à être appelée par `pg_cron`/`pg_net` (donc sans
JWT utilisateur), avec un des deux mécanismes suivants :

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
| Échec de la RPC SQL | 500 | Échec du scan quotidien des retards de paiement |
| Échec lecture des alertes actives | 500 | Échec de lecture |

## Câblage `pg_cron` (optionnel)

Le scan lui-même est déjà planifié en SQL pur (voir plus haut) : rien à faire
pour que la règle 10 fonctionne, avec ou sans cette Edge Function. Un job
`pg_cron` optionnel appelant cette fonction (pour déclencher un scan
supplémentaire, ou l'exposer à un bouton "Scanner maintenant" côté dashboard)
peut être ajouté sur le même modèle que `alerte-stock-bas-edge-broadcast`
(voir `supabase/functions/alerte-stock-bas/README.md`), en gardant à l'esprit
qu'aucune diffusion Broadcast n'est déclenchée par cet appel — seul
`postgres_changes` (déjà actif) notifie les clients abonnés.

## Exemple d'appel (`curl`, pour `qa-testeur`)

```bash
# Avec la clé service_role (test serveur-à-serveur) :
curl -i -X POST "$SUPABASE_URL/functions/v1/alerte-facture-impayee" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{}'

# Avec le secret pg_cron (sans clé service_role dans le corps de la requête) :
curl -i -X POST "$SUPABASE_URL/functions/v1/alerte-facture-impayee" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json" -d '{}'

# Avec une session admin :
curl -i -X POST "$SUPABASE_URL/functions/v1/alerte-facture-impayee" \
  -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN" \
  -H "Content-Type: application/json" -d '{}'
```

### Exemple `supabase-js` (écoute côté dashboard admin)

```ts
supabase
  .channel("alertes_factures")
  .on("postgres_changes", { event: "*", schema: "public", table: "alertes_factures" }, (payload) => {
    console.log("Alertes de retard de paiement", payload);
  })
  .subscribe();
```

(C'est exactement ce que fait `components/admin/PaymentAlertsBell.tsx` — pas
besoin d'appeler cette Edge Function pour recevoir les alertes en temps réel.)

## Points d'attention pour `expert-securite`

- Confirmer que `verify_jwt = false` est bien configuré pour cette fonction dans
  `supabase/config.toml` (sinon la passerelle Supabase rejette les appels
  `x-cron-secret` sans JWT avant même d'atteindre le code applicatif) — voir
  `supabase/config.toml` livré avec ce lot.
- Vérifier que `CRON_SECRET`, s'il est utilisé, est bien un secret fort stocké
  dans les variables d'environnement de la fonction (jamais commité), et
  **partagé** avec `alerte-stock-bas` uniquement si c'est un choix assumé (les
  deux fonctions acceptent le même header `x-cron-secret` / la même variable
  d'env `CRON_SECRET` — pas de secret dédié par fonction dans ce lot).
- Cette fonction ne diffuse plus de Realtime Broadcast (retiré suite à
  l'audit du 2026-08-10 : un Broadcast n'est pas soumis à RLS, ce qui aurait
  exposé nom/téléphone client et montants dus à quiconque possède la clé
  `anon`). Ne pas réintroduire de diffusion Broadcast sur cette fonction sans
  passer par un canal Realtime **privé** avec policy RLS dédiée sur
  `realtime.messages`.
