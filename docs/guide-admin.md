# GFB-STOCK — Guide de l'administrateur

Ce guide couvre la configuration et le pilotage quotidien de GFB-STOCK côté Admin, y compris
les modules ajoutés par l'avenant Crédit / Bon de livraison / Multi-entrepôts.

## Sommaire

1. [Gérer les entrepôts et les transferts](#1-gérer-les-entrepôts-et-les-transferts)
2. [Configurer le seuil de crédit](#2-configurer-le-seuil-de-crédit)
3. [Lire le dashboard et les alertes](#3-lire-le-dashboard-et-les-alertes)
4. [Gestion des ajustements de stock](#4-gestion-des-ajustements-de-stock)
5. [Crédits & Recouvrement](#5-crédits--recouvrement)
6. [Bons de livraison](#6-bons-de-livraison)

---

## 1. Gérer les entrepôts et les transferts

Depuis la migration de l'avenant, le stock n'est plus suivi globalement par produit : il est
suivi **par entrepôt**. Chaque produit a une ligne de stock distincte par site.

### Créer un entrepôt

1. Ouvrez **Entrepôts** (menu, juste après Stock).
2. Cliquez sur **+ Nouvel entrepôt**.
3. Renseignez le **nom** (obligatoire, unique) et l'**adresse** (optionnelle).
4. Validez avec **Créer l'entrepôt**.

Seul l'admin peut créer ou modifier un entrepôt. Un entrepôt peut être désactivé (case
« Entrepôt actif ») depuis sa fiche de modification — un entrepôt inactif disparaît des
sélecteurs utilisés à la création de factures et de bons de livraison, mais son historique
reste consultable.

### Ajouter un produit au stock d'un entrepôt

1. Ouvrez la fiche de l'entrepôt (cliquez sur sa carte depuis la liste **Entrepôts**).
2. Cliquez sur **+ Ajouter un produit à cet entrepôt**.
3. Choisissez le produit dans la liste (seuls les produits actifs qui n'ont pas encore de
   ligne de stock dans cet entrepôt apparaissent).
4. Renseignez la **quantité de départ** et un **motif obligatoire** (au moins 5 caractères,
   ex. « inventaire physique », « premier arrivage »).
5. Confirmez.

Le même écran (« Ajuster le stock manuellement ») sert aussi à corriger une quantité déjà en
stock dans cet entrepôt : chaque ajustement exige un motif et est journalisé.

### Créer et suivre un transfert entre entrepôts

Un transfert déplace une quantité d'un produit d'un entrepôt **source** vers un entrepôt
**destination**. Il suit un cycle en 3 étapes : **Demandé → En transit → Réceptionné**
(ou **Annulé**).

1. Depuis **Transferts**, cliquez sur **+ Nouvelle demande de transfert**.
2. Choisissez le produit, l'entrepôt source, l'entrepôt destination (les deux sélecteurs
   s'excluent mutuellement : impossible de choisir deux fois le même entrepôt) et la
   quantité.
3. Validez — le transfert apparaît au statut **Demandé**, aucun mouvement de stock n'a encore
   eu lieu.
4. Cliquez sur **Marquer en transit** : le stock de l'entrepôt source est décrémenté
   immédiatement.
5. Cliquez sur **Réceptionner** pour confirmer l'arrivée : le stock de l'entrepôt
   destination est incrémenté. **Cette action est définitive** — un transfert réceptionné ne
   peut plus être annulé ; pour corriger une erreur, créez un nouveau transfert en sens
   inverse.
6. **Annuler** reste possible tant que le transfert n'est pas réceptionné (aux statuts
   Demandé ou En transit). Si le transfert était déjà En transit, le stock décrémenté à la
   source est restitué.

**Qui peut réceptionner un transfert : uniquement l'administrateur.** Toute transition de
statut (marquer en transit, réceptionner, annuler) est réservée à l'admin — y compris pour un
transfert que vous avez vous-même demandé. Un agent peut voir la liste des entrepôts et du
stock, mais l'écran de création/suivi des transferts n'existe aujourd'hui que côté Admin.

## 2. Configurer le seuil de crédit

Le **seuil de crédit global** plafonne la somme des soldes restants dus par **tous les
clients à crédit confondus** — ce n'est pas un plafond par client.

1. Ouvrez **Paramètres**.
2. Faites défiler jusqu'à la section **Crédit client**.
3. Renseignez le champ **Seuil de crédit global (FCFA)**.
4. Cliquez sur **Enregistrer les paramètres**.

**Par défaut, ce seuil est à 0**, ce qui désactive complètement la vente à crédit : tant
qu'aucun montant n'est configuré ici, aucun agent ne peut ouvrir de crédit, quel que soit le
client. C'est un choix de sécurité volontaire — la vente à crédit doit être activée
consciemment par vous, pas par défaut.

Une fois le seuil configuré, chaque tentative d'ouverture de crédit (depuis Nouvelle facture,
espace Agent) est comparée à l'encours déjà en cours + le montant de la nouvelle vente : si
le total dépasserait le seuil, la vente à crédit est refusée (la facture peut toujours être
validée en vente comptant).

## 3. Lire le dashboard et les alertes

Le tableau de bord Admin affiche, en plus des cartes déjà connues (chiffre d'affaires,
factures, stock...), une carte **« Crédit non recouvré »** : une jauge comparant l'encours de
crédit total à recouvrer au seuil global configuré.

- Jauge verte à ambre : encours en dessous des deux tiers du seuil.
- Jauge ambre : encours entre les deux tiers et le seuil.
- Badge rouge **« Seuil de crédit atteint »** : l'encours a atteint ou dépassé le seuil —
  aucun nouveau crédit ne pourra être ouvert tant que du recouvrement ne l'a pas fait
  redescendre.
- Badge neutre **« Crédit désactivé — seuil non configuré »** : le seuil est encore à 0
  (valeur par défaut), avec un lien direct vers Paramètres pour le configurer.

Cliquer sur cette carte ouvre directement l'écran **Crédits & Recouvrement**.

Les alertes de stock bas restent visibles comme en V1, mais sont désormais **calculées par
couple (produit, entrepôt)** plutôt que globalement par produit : un même produit peut être
en alerte dans un entrepôt et confortable dans un autre. Le message d'alerte précise toujours
l'entrepôt concerné (ex. *« Stock bas pour "Spray Tube HYB1-3" à l'entrepôt "Thiès" : 2
restant(s), seuil d'alerte 5 »*).

## 4. Gestion des ajustements de stock

Depuis l'avenant, tout ajustement manuel de stock se fait **par entrepôt**, depuis la fiche
de l'entrepôt concerné (**Entrepôts > [nom de l'entrepôt] > Actions** sur la ligne du
produit) — voir la marche à suivre détaillée en [section 1](#ajouter-un-produit-au-stock-dun-entrepôt).
Un motif d'au moins 5 caractères est obligatoire à chaque ajustement, entrée ou sortie.
Chaque ajustement est journalisé et consultable dans l'historique des mouvements de stock du
produit.

## 5. Crédits & Recouvrement

Ouvrez **Crédits & Recouvrement** dans le menu.

- La liste par défaut affiche les crédits **en cours**, triés du plus ancien au plus récent
  (priorité de recouvrement). Un onglet **Historique (soldés)** affiche les crédits déjà
  remboursés intégralement.
- Deux compteurs en tête d'écran : nombre de crédits en cours, et encours total à recouvrer.

### Enregistrer un recouvrement (« caisse du soir »)

1. Cliquez sur **+ Enregistrer un recouvrement** (en tête de liste, ou sur la fiche d'un
   crédit précis).
2. Choisissez le client (si non présélectionné) — seuls les clients avec un crédit en cours
   apparaissent, avec le solde restant dû affiché.
3. Renseignez le **montant récupéré aujourd'hui**, la **date du recouvrement**, et une note
   optionnelle (ex. numéro de reçu).
4. Cliquez sur **Enregistrer le recouvrement**.

Vous pouvez enregistrer plusieurs remboursements par soir sur un même crédit : le formulaire
reste ouvert après chaque enregistrement pour enchaîner la tournée sans le rouvrir à chaque
client.

Dès que le cumul des remboursements atteint le montant total du crédit, celui-ci passe
automatiquement au statut **Soldé** et le client peut immédiatement se voir ouvrir un nouveau
crédit.

> Note de terrain : c'est actuellement le **seul** point d'enregistrement d'un recouvrement
> dans l'application (aucun écran équivalent côté Agent). Si un agent collecte de l'argent sur
> le terrain, il doit vous transmettre le montant pour que vous l'enregistriez ici.

## 6. Bons de livraison

Ouvrez **Bons de livraison** pour voir tous les BL, tous agents confondus, filtrables par
statut (**Livré, non payé** / **Livré, payé**). Un bon de livraison n'est **pas un document
financier** : aucun prix n'y figure, uniquement les quantités livrées par produit.

**Le BL est le seul document qui retire du stock** : valider une facture ne touche pas au
stock. À la création, le BL et toutes ses lignes sont enregistrés en une seule opération ; si
un produit manque dans l'entrepôt de départ, rien n'est enregistré.

Vous pouvez créer un BL vous-même depuis **+ Nouveau bon de livraison** (mêmes champs que
côté Agent : client, entrepôt de départ, facture liée optionnelle, produits/quantités). Un BL
lié à une facture validée reprend obligatoirement son client, son entrepôt et toutes ses
quantités ; un seul BL par facture, pas de livraison partielle.

Une fois créé, le client, l'entrepôt et les lignes d'un BL ne sont plus modifiables, y compris
par un admin — seul le statut (livré non payé / livré payé) change. Annuler une facture livrée
ne remet pas la marchandise en stock : enregistrez un ajustement de stock si elle revient
réellement.

Cas particulier : une facture validée **avant** ce changement (septembre 2026) a déjà retiré
son stock. La création d'un BL pour elle est refusée avec un message explicite ; vérifiez ses
mouvements de stock et régularisez-les avant de livrer. Voir `docs/destockage-livraison.md`.

---

## Changelog de ce guide

- **4 octobre 2026** — Section Bons de livraison : le stock sort au BL, plus à la validation
  de la facture (migration 0017) ; BL immuable après création ; factures historiques.

- **21 août 2026** — Ajout des sections Avenant Crédit / Bon de livraison / Multi-entrepôts :
  gestion des entrepôts et des transferts, configuration du seuil de crédit, lecture de la
  carte « Crédit non recouvré » sur le dashboard, écran Crédits & Recouvrement, écran Bons de
  livraison.
- Base : sections Dashboard / Ajustements de stock reprises et adaptées à partir du périmètre
  Admin effectivement livré au moment de la rédaction (ce guide ne couvre pas encore la
  configuration initiale V1 — informations entreprise, catégories de produits, comptes
  agents — ni la génération des rapports, hors périmètre de cette mise à jour).
