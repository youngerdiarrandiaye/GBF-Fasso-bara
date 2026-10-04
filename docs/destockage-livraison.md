# Déstockage à la livraison

## Règle appliquée

- Créer ou valider une facture ne contrôle ni ne retire le stock.
- Créer un bon de livraison retire le stock de son entrepôt. L'en-tête,
  les lignes et les mouvements sont enregistrés dans une transaction unique.
- Un BL issu d'une facture validée ou payée reprend exactement son client,
  son entrepôt et ses quantités, regroupées par produit. Ces champs sont
  affichés en lecture seule. Le serveur vérifie à nouveau leur correspondance.
- Un seul BL complet peut être créé depuis une facture. Une nouvelle tentative
  est refusée sous verrou de la facture. Les livraisons partielles ne sont pas
  proposées dans ce parcours.
- Les BL autonomes restent disponibles.
- L'annulation d'une nouvelle facture ne remet pas les marchandises en stock,
  même si un BL existe : elle n'est pas un retour physique.

## Activation

Appliquer `supabase/migrations/0017_destockage_uniquement_livraison.sql` à la base
Supabase, puis déployer l'application correspondante. La nouvelle action appelle
`creer_bon_livraison_atomique` ; elle nécessite cette migration. Les anciens
clients qui insèrent directement les BL doivent être actualisés : ces insertions
directes sont fermées pour garantir l'atomicité et la cohérence des lignes.

La migration ne modifie aucun stock existant. Une ancienne facture ayant encore
une sortie de stock à son nom est bloquée à la création du BL, avec un message
explicite. Ses mouvements doivent être vérifiés et régularisés séparément. Pour
compatibilité, l'annulation d'une ancienne facture restitue seulement le solde
de ses mouvements de stock historiques ; elle ne restitue pas ceux du BL.

Ne pas simplement renseigner `factures.bon_livraison_id` sur une ancienne facture
pour tenter de régulariser son stock. Le lien canonique des nouvelles créations
est `bons_livraison.facture_id`.

## Vérifications

```powershell
npm.cmd install --prefix .tmp/stock-tests --no-save --package-lock=false --ignore-scripts @electric-sql/pglite
node --test tests/stock-livraison.test.mjs
npx.cmd tsc --noEmit
```

Les tests exécutent les fonctions SQL des migrations 0013 et 0017 dans un
PostgreSQL embarqué, sur un schéma de test minimal, sans toucher à la base réelle.
Ils couvrent la validation sans stock, le BL autonome ou lié, la restitution
historique, les données altérées, les droits d'insertion, la double création et
le rollback de toutes les lignes en cas de stock insuffisant.

Ils ne remplacent pas un contrôle après migration sur Supabase : vérifier le
parcours admin et agent, la recherche par numéro/client et la visibilité imposée
par les politiques RLS. La concurrence réelle entre plusieurs connexions n'est
pas simulée par le moteur embarqué.
