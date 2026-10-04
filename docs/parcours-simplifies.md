# Parcours simplifiés — septembre 2026

## Modifications

- Facture agent et administrateur : Client → Produits → Vérifier, avec retour sans perte des données, validation avant de continuer et accès aux brouillons/proformas.
- Clients récemment ajoutés et première sélection de produits visibles sans saisie. La recherche reste disponible. Les réponses périmées de recherche sont ignorées, notamment lors d'un changement d'entrepôt.
- Livraison : Client/facture → Produits → Confirmation. Les données d'une facture liée restent imposées et les livraisons autonomes restent possibles.
- Paiement : modes présentés en grandes options radio, référence facultative repliée, champs et fermeture bloqués pendant l'enregistrement.
- Accueils : raccourcis nommés ; historique avant les analyses repliables de l'administration. Navigation mobile avec Créer et Livraisons visibles.
- Hauteur commune de la navigation basse et des pieds de formulaire, zone de sécurité du téléphone comprise.

## Règles préservées

Les actions serveur, migrations, politiques d'accès, calculs et contrats de données ne sont pas modifiés. Une facture ne retire aucun stock ; la création du bon de livraison reste l'opération de déstockage. Une livraison liée reprend toute la facture et ne permet pas une livraison partielle. Les contrôles serveur restent décisifs.

## Vérifications automatisées

```powershell
node --test tests/stock-livraison.test.mjs lib/supabase/read-all.test.mjs
npx.cmd tsc --noEmit
npm.cmd run build
```

Les 15 tests existants couvrent les lectures paginées et les règles de stock/livraison, dont les refus d'accès, la double création et le rollback. Ils ne simulent pas les interactions des nouveaux écrans.

## Recette à effectuer avec une session authentifiée

- Agent et administrateur : sélectionner un client sans taper, rechercher puis créer un nouveau client.
- Ajouter plusieurs produits, modifier les quantités, revenir au client et vérifier que les lignes sont conservées.
- Changer d'entrepôt pendant une recherche : aucun ancien résultat ne doit être sélectionnable.
- Vérifier les totaux avec remise, transport, TVA, produit inclus dans un kit et vente à crédit.
- Enregistrer/reprendre un brouillon et une proforma ; vérifier le refus d'un crédit non autorisé.
- Créer une facture : ouverture de sa fiche et accès aux actions PDF existantes.
- Livraison autonome et liée : retour entre les étapes, données imposées pour la facture liée, message explicite avant déstockage.
- Livraison : date vide à corriger à la confirmation ; erreur de stock sur une ligne ramenant à l'étape produits.
- Paiement partiel/complet, modes radio au clavier, référence facultative et double clic pendant l'enregistrement.
- Écrans de 360 et 430 px, avec zone de sécurité basse : absence de recouvrement des boutons, accès à toutes les actions et absence de défilement horizontal.

Cette recette navigateur n'a pas été effectuée dans cette session. Les contrôles de code et les tests métier ne garantissent pas à eux seuls l'absence de toute régression visuelle.
