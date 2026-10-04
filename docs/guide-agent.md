# GFB-STOCK — Guide de l'agent commercial

Ce guide couvre l'essentiel de votre travail quotidien dans GFB-STOCK : factures, bons de
livraison, vente à crédit. Il est écrit pour être lu en moins de 30 secondes par question —
utilisez le sommaire pour aller directement à ce qui vous concerne.

## Sommaire

1. [Créer une facture en 2 minutes](#1-créer-une-facture-en-2-minutes)
2. [Brouillon, proforma, facture validée : quelle différence ?](#2-brouillon-proforma-facture-validée--quelle-différence)
3. [Que faire en cas d'alerte « stock insuffisant »](#3-que-faire-en-cas-dalerte--stock-insuffisant-)
4. [Vendre à crédit](#4-vendre-à-crédit)
5. [Enregistrer un recouvrement (important — lisez ceci)](#5-enregistrer-un-recouvrement-important--lisez-ceci)
6. [Créer un bon de livraison](#6-créer-un-bon-de-livraison)
7. [Envoyer une facture et mot de passe oublié](#7-envoyer-une-facture-et-mot-de-passe-oublié)

---

## 1. Créer une facture en 2 minutes

Depuis l'espace Agent, ouvrez **Nouvelle facture**.

1. **Entrepôt source** — en haut de l'écran, toujours visible. Choisissez l'entrepôt d'où
   partent les produits. C'est obligatoire dès le brouillon : sans entrepôt sélectionné,
   aucun bouton n'est actif.
2. **Client** — recherchez-le par nom dans le champ dédié.
3. **Produits** — recherchez chaque article par code ou par nom, il s'ajoute à la liste avec
   le stock disponible **dans l'entrepôt choisi**. Ajustez la quantité et, si besoin, le prix.
4. **Remise / transport / TVA** — dans le bloc de récapitulatif, en dessous des lignes.
   **Échéance de paiement** (facultatif) : la date à laquelle le client doit avoir payé. Sans
   date, la facture passe « en retard » 10 jours après sa validation.
5. Choisissez une action en bas d'écran :
   - **Enregistrer en brouillon** — sauvegarde sans rien valider, vous pourrez y revenir.
   - **Valider (proforma)** — génère un devis, aucun effet sur le stock.
   - **Valider (facture définitive)** — enregistre la vente. **Elle ne retire pas le
     stock** : la marchandise sort de l'entrepôt seulement à la création du bon de
     livraison (section 6). Le bouton rappelle le nom de l'entrepôt, vérifiez-le.

Si vous changez d'entrepôt en cours de saisie, les quantités disponibles affichées sur les
lignes déjà ajoutées se recalculent automatiquement pour le nouvel entrepôt.

## 2. Brouillon, proforma, facture validée : quelle différence ?

| Statut | Effet sur le stock | Usage |
|---|---|---|
| **Brouillon** | Aucun | Facture en cours de saisie, à reprendre plus tard. |
| **Proforma** | Aucun | Devis à présenter au client, sans engagement. |
| **Validée** | Aucun (le stock sort au bon de livraison) | Vente définitive. |

Après validation, une facture évolue encore selon les paiements reçus (payée partielle,
payée) ou une annulation — ces statuts s'affichent avec le même badge coloré dans **Mes
factures**.

## 3. Que faire en cas d'alerte « stock insuffisant »

Deux cas :

- **Pendant la saisie d'une facture** : un bandeau orange apparaît sur la ligne concernée —
  *« Quantité (X) supérieure au stock disponible (Y). Vous pouvez valider la facture. Le stock
  sera contrôlé et retiré lors de la création du bon de livraison. »* C'est un simple
  avertissement : la facture peut être validée.
- **À la création du bon de livraison** : c'est là que le stock est vraiment contrôlé. Si
  l'entrepôt de départ n'a pas assez de stock, le bon est refusé en entier (aucune ligne
  n'est enregistrée, rien n'est retiré) et le produit en cause est indiqué.

Avant de livrer, la marche à suivre est la même :
1. Vérifiez que vous avez bien sélectionné le **bon entrepôt** — le stock est désormais
   suivi entrepôt par entrepôt, pas globalement. Le même produit peut être disponible
   ailleurs.
2. Réduisez la quantité à ce qui est réellement disponible, ou
3. Contactez l'admin pour un transfert de stock depuis un autre entrepôt ou un
   réapprovisionnement.

## 4. Vendre à crédit

Depuis **Nouvelle facture**, une fois un client sélectionné, un bloc **« Vendre à crédit »**
apparaît sous le récapitulatif des totaux.

1. Cochez la case. Un sélecteur **Échéancier de remboursement** apparaît :
   **Journalier** ou **Mensuel** (un seul mode par crédit, pas de mélange).
2. Une jauge affiche l'encours de crédit projeté si vous validez cette facture à crédit,
   comparé au seuil global autorisé par l'entreprise.
3. Le crédit n'est **réellement ouvert qu'au moment de « Valider (facture définitive) »** —
   cocher la case sur un brouillon ou une proforma n'a aucun effet financier.

**Si le client a déjà un crédit en cours**, la validation est refusée avec le message exact :

> Crédit refusé — [Nom du client] a déjà un crédit en cours de [solde restant]

Un client ne peut avoir qu'un seul crédit en cours à la fois. Il doit d'abord être soldé (voir
section suivante) avant qu'un nouveau crédit puisse lui être ouvert.

**Si le seuil global de crédit serait dépassé**, la validation est refusée avec :

> Crédit refusé — dépasserait le seuil global ([montant projeté] / [seuil autorisé])

Le seuil global cumule les soldes restants de **tous les clients** à crédit, pas seulement
celui en cours de saisie. Si ce message apparaît, il faut soit réduire le montant de la
vente, soit attendre qu'un recouvrement libère de la marge, soit demander à l'admin
d'augmenter le seuil dans Paramètres.

Dans les deux cas de refus, la facture reste au statut brouillon : rien n'est perdu, vous
pouvez décocher « Vendre à crédit » pour finaliser une vente comptant à la place.

## 5. Enregistrer un recouvrement (important — lisez ceci)

**L'enregistrement d'un recouvrement (remboursement d'un crédit client) se fait uniquement
depuis l'espace Admin**, dans l'écran **Crédits & Recouvrement**. Il n'existe pas d'écran de
recouvrement dans l'espace Agent à ce jour.

Si vous collectez de l'argent sur le terrain pour un crédit en cours, transmettez le montant
et le nom du client à votre administrateur pour qu'il l'enregistre le soir même (« caisse du
soir ») — c'est lui qui saisit chaque remboursement avec le montant, la date et une note
optionnelle (ex. numéro de reçu).

> Ce point diffère de ce qui était envisagé au départ (recouvrement partagé agent/admin) —
> voir le changelog en fin de document.

## 6. Créer un bon de livraison

Un bon de livraison (BL) constate qu'une livraison a physiquement eu lieu — avec ou sans
facture associée. **C'est le seul document qui retire du stock.** Il n'existe pas de
brouillon : à la confirmation, le BL et toutes ses lignes sont enregistrés en une seule
fois et le stock de l'entrepôt de départ est retiré. Si une ligne manque de stock, rien
n'est enregistré.

Depuis **Mes bons de livraison > + Nouveau bon de livraison** :

1. Choisissez l'**entrepôt de départ**.
2. Sélectionnez le **client**.
3. Optionnel : liez une **facture validée** (ou payée) en la recherchant par numéro. Le
   client, l'entrepôt et les quantités de la facture sont alors repris tels quels et ne
   sont pas modifiables : une facture est livrée en une seule fois, en totalité (pas de
   livraison partielle), et un seul BL peut être créé par facture.
4. Renseignez la **date de livraison** (aujourd'hui par défaut).
5. Ajoutez les produits et quantités livrés.
6. Cliquez sur **Créer le bon de livraison** — le bouton rappelle l'entrepôt concerné.

Une fois créé, le client, l'entrepôt et les lignes d'un BL ne peuvent plus être modifiés.
Pour toute correction, contactez l'admin. Annuler une facture déjà livrée ne remet pas la
marchandise en stock : ce n'est pas un retour physique.

Vous ne pouvez consulter que vos propres bons de livraison, filtrables par entrepôt dans
**Mes factures** de la même façon.

## 7. Envoyer une facture et mot de passe oublié

Depuis le détail d'une facture validée ou d'une proforma :
- **E-mail** envoie le PDF au client, à l'adresse de sa fiche (le bouton est grisé si le
  client n'a pas d'e-mail). Une confirmation vous est demandée avant l'envoi.
- **WhatsApp / Partager** reste disponible.

**Mot de passe oublié** : sur l'écran de connexion, cliquez sur « Mot de passe oublié ? »,
saisissez votre e-mail et suivez le lien reçu (valable une heure, une seule fois). Si vous ne
recevez rien, votre administrateur peut redéfinir votre mot de passe.

---

## Changelog de ce guide

- **4 octobre 2026** — Échéance de paiement facultative, envoi de facture par e-mail, mot de
  passe oublié (section 7).
- **4 octobre 2026** — Le stock sort désormais au bon de livraison, plus à la validation de
  la facture (migration 0017). BL lié à une facture : reprise intégrale, une seule fois.

- **21 août 2026** — Ajout des sections Avenant Crédit / Bon de livraison / Multi-entrepôts :
  vendre à crédit, bon de livraison, entrepôt source obligatoire, alerte de stock désormais
  par entrepôt.
- Base : création du brouillon (facture, statuts, alerte stock) à partir du code Agent
  effectivement livré au moment de la rédaction.
