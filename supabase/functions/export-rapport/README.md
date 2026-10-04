# `export-rapport`

Génère un rapport « ventes » ou « stock », au format PDF ou Excel (`.xlsx`),
dépose le fichier dans le bucket privé `rapports` et retourne une URL signée à
durée limitée.

Aucune règle métier n'est recalculée : les montants proviennent tels quels des
colonnes déjà calculées par les triggers SQL (`total_ht`, `total_general`...).

## Entrée

```jsonc
{
  "type": "ventes",           // "ventes" | "stock"
  "format": "pdf",            // "pdf" | "excel" (défaut: "pdf")
  "periode": {                // requis pour type="ventes", ignoré pour type="stock"
    "date_debut": "2026-06-01",
    "date_fin": "2026-06-30"
  },
  "agent_id": "uuid"           // optionnel — voir règles d'autorisation ci-dessous
}
```

Validation Zod : `type`/`format` doivent être dans l'énumération autorisée,
`periode.date_debut`/`date_fin` au format `AAAA-MM-JJ` avec `date_debut <= date_fin`,
`agent_id` doit être un UUID s'il est fourni. `periode` est obligatoire pour
`type="ventes"` (erreur 400 sinon) ; il est accepté mais ignoré pour
`type="stock"`, qui est toujours une photographie du stock **au moment de
l'appel** (pas d'historique de stock dans le schéma actuel).

## Sortie (200)

```json
{
  "url": "https://<project>.supabase.co/storage/v1/object/sign/rapports/....xlsx?token=...",
  "expire_dans_secondes": 3600,
  "type": "ventes",
  "format": "excel",
  "nb_lignes": 42,
  "genere_le": "2026-08-02T09:00:00.000Z"
}
```

TTL de l'URL signée configurable via `EXPORT_RAPPORT_SIGNED_URL_TTL_SECONDS`
(défaut `3600`).

## URL signée inutilisable en développement local : `PUBLIC_SUPABASE_URL`

Même piège que pour `generer-facture-pdf` (voir son README pour le détail
complet) : en local, `SUPABASE_URL=http://kong:8000` (hôte interne au réseau
Docker) fuite dans l'URL signée `url` retournée ci-dessus, ce qui la rend
inutilisable depuis un navigateur. Confirmé par test réel.

Le correctif (`toPublicUrl()` dans `_shared/clients.ts`, appliqué à `url` juste
avant la réponse) est activé en définissant, dans `supabase/functions/.env` :

```
PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
```

Sans effet en production Cloud (où `SUPABASE_URL` est déjà l'URL publique
réelle). **Ne pas** nommer cette variable `SUPABASE_PUBLIC_URL` : le CLI
Supabase rejette silencieusement tout nom de variable commençant par le
préfixe réservé `SUPABASE_` dans `supabase/functions/.env` (vérifié en
conditions réelles), et cette même restriction s'applique à `supabase secrets
set` sur Supabase Cloud.

## Autorisation

Header `Authorization: Bearer <jwt utilisateur>` obligatoire. La fonction lit
d'abord le profil de l'appelant via un client lié à ce JWT (`utilisateurs`,
soumis à RLS — un utilisateur ne peut lire que sa propre fiche), pour connaître
son rôle et son statut `actif` :

- **admin** : accès à toutes les ventes (avec filtre optionnel `agent_id`) et à
  tout le catalogue produit (actifs + inactifs) pour le rapport stock.
- **agent** :
  - `type="ventes"` : `agent_id` est forcé à son propre id, quelle que soit la
    valeur envoyée ; si un `agent_id` différent est explicitement fourni, la
    requête est refusée (`403`) plutôt que silencieusement ignorée, pour éviter
    toute ambiguïté côté frontend.
  - `type="stock"` : ne voit que les produits `actif = true`, exactement comme
    la policy RLS `produits_lecture_agent` le ferait (reproduite manuellement
    ici car les requêtes volumineuses passent par `service_role`, qui bypass
    RLS — voir commentaires dans `index.ts`).
- Compte introuvable ou `actif = false` → `403`.

## Idempotence du fichier généré

Chemin déterministe dans le bucket `rapports` :
- Ventes : `{scope}/ventes_{date_debut}_{date_fin}.{ext}`
- Stock : `{scope}/stock_{AAAA-MM-JJ du jour}.{ext}`

où `scope` = id de l'agent (agent, ou admin filtré sur un agent précis) ou
`tous_agents` (admin sans filtre). Upload avec `upsert: true` : rejouer le
même export dans la même journée écrase le fichier existant au lieu d'en
créer un orphelin ; un nouvel appel un autre jour (ou sur une autre période)
produit naturellement un nouveau fichier, ce qui est le comportement attendu
pour un rapport dont les données sous-jacentes évoluent dans le temps.

## Bucket `rapports` — non déclaré dans la migration initiale

`supabase/migrations/0001_schema_initial.sql` déclare les buckets `factures`,
`produits-photos` et `logo`, mais pas `rapports`. Cette fonction le crée donc
de façon défensive et idempotente à chaque appel (`storage.createBucket`, en
ignorant l'erreur "already exists"), en `public: false`. Comme **tout** accès
au fichier passe par une URL signée générée avec `service_role`, aucune policy
RLS sur `storage.objects` n'est nécessaire pour ce bucket.

**Recommandation pour `architecte-bdd`** : ajouter, pour rester cohérent avec
le reste du schéma, ce bucket directement dans une future migration :

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('rapports', 'rapports', false)
ON CONFLICT (id) DO NOTHING;
```

Cette fonction continuera de fonctionner sans modification si ce bucket est
créé en amont (elle détecte qu'il existe déjà et ne tente pas de le recréer).

## Cas d'erreur gérés

| Cas | Code | Message |
|---|---|---|
| Méthode ≠ POST | 405 | Méthode non autorisée |
| Header `Authorization` absent | 401 | Authentification requise |
| Corps JSON invalide / schéma Zod non respecté | 400 | Entrée invalide + détail Zod |
| `periode` manquante pour `type="ventes"` | 400 | periode requis |
| `date_debut > date_fin` | 400 | date_debut doit être <= date_fin |
| Profil appelant introuvable / inactif | 403 | Compte introuvable ou désactivé |
| Agent demandant les données d'un autre agent | 403 | Un agent ne peut exporter que ses propres données |
| Rôle inconnu | 403 | Rôle utilisateur non reconnu |
| Échec requête de données, upload, ou signature d'URL | 500 | Erreur interne / message dédié |

## Exemple d'appel (`supabase-js`)

```ts
const { data, error } = await supabase.functions.invoke("export-rapport", {
  body: {
    type: "ventes",
    format: "excel",
    periode: { date_debut: "2026-06-01", date_fin: "2026-06-30" },
  },
});
if (error) throw error;
window.open(data.url, "_blank");
```

## Exemple d'appel (`curl`, pour `qa-testeur`)

```bash
# Rapport ventes, admin, filtré sur un agent précis, format PDF
curl -i -X POST "$SUPABASE_URL/functions/v1/export-rapport" \
  -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"ventes","format":"pdf","periode":{"date_debut":"2026-06-01","date_fin":"2026-06-30"},"agent_id":"<uuid agent>"}'

# Rapport stock, agent connecté, format Excel
curl -i -X POST "$SUPABASE_URL/functions/v1/export-rapport" \
  -H "Authorization: Bearer $AGENT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"stock","format":"excel"}'
```

## Points d'attention pour `expert-securite`

- Vérifier spécifiquement le test « agent A tente `agent_id` = B » → doit
  renvoyer `403`, pas un export vide silencieux (le choix fait ici est de
  rejeter explicitement plutôt que d'ignorer, à confirmer/valider en revue).
- Comme les requêtes de données passent par `service_role` (pas par RLS), la
  reproduction manuelle des restrictions de périmètre dans `index.ts`
  (`eq('agent_id', ...)`, `eq('actif', true)`) est le SEUL rempart : toute
  modification de ce fichier doit être re-testée contre les scénarios RLS
  équivalents du cahier des charges.
