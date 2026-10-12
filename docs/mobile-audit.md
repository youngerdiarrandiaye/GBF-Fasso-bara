# Audit mobile — 12 octobre 2026

L'audit couvre les mises en page de l'administration, de l'espace agent, de
l'authentification et des composants partagés. Il vise les débordements
horizontaux, les textes et montants longs, les actions accessibles au toucher
et les dialogues sur petit écran. Les calculs métier, règles d'accès et
soumissions restent inchangés.

## Correctifs

- **Composants partagés** : éléments flex/grid autorisés à rétrécir, textes
  longs pouvant revenir à la ligne, boutons et champs adaptés aux petites
  largeurs, badges et états vides contenus dans leur parent. Les jauges,
  tickets et sélecteurs conservent une présentation lisible sur mobile.
  Le dialogue peut défiler dans une hauteur limitée à `92dvh`, réserve la
  zone sûre inférieure et conserve son mécanisme de focus.
- **Administration** : actions et filtres peuvent s'empiler ou revenir à la
  ligne ; les contrôles de dates ne forcent plus la largeur à 320 px.
  Les listes, coordonnées et documents détaillés accueillent les libellés
  longs. Pagination, téléchargements d'images, actions de transfert et
  réglages de stock restent utilisables sur petit écran.
- **Agent** : navigation haute complète à partir de `lg`, onglets inférieurs
  jusque-là ; le pied de livraison réserve leur hauteur au même breakpoint.
  Les factures et livraisons empilent leurs informations sur mobile. Les
  quantités/prix se présentent sur une colonne sous 420 px. Le total et
  l'action de validation de facture occupent deux rangées sous `sm`, avec
  un espace réservé sous le formulaire. Les coordonnées et références
  longues reviennent à la ligne, et les grands montants ne concurrencent
  plus les libellés dans les cartes et récapitulatifs.
- **Authentification** : conteneurs et formulaires adaptés aux petites
  largeurs ; les écrans de connexion et de récupération restent accessibles.

## Vérifications dans Chrome

| Couverture | Largeurs en pixels | Méthode |
| --- | --- | --- |
| Connexion, mot de passe oublié, réinitialisation | 320, 360, 390, 414, 768, 1024, 1440 | Routes locales réelles |
| Composants partagés et administration | 320, 360, 390, 414, 768, 1024, 1440 | Pages temporaires avec composants réels et données fictives |
| Composants métier agent | 320, 360, 390, 414, 768, 1024, 1440 | Lignes facture/BL et récapitulatif réels, état local |
| Routes administrateur accessibles | 320, 390, 768, 1024 | Session administrateur, lecture seule |
| Dialogue sur écran court | 320 × 568 | Ouverture, hauteur/scroll et maintien du focus pendant la saisie |

Routes administrateur parcourues : `/admin`, `/admin/stock`, `/admin/clients`,
`/admin/entrepots`, `/admin/transferts`, `/admin/factures`,
`/admin/nouvelle-facture`, `/admin/bons-livraison`,
`/admin/bons-livraison/nouveau`, `/admin/paiements`, `/admin/credits`,
`/admin/rapports` et `/admin/parametres`.

Les mesures comparent la largeur du document au viewport et recherchent les
éléments débordants ou tronqués. Le contenu volontairement masqué pour les
lecteurs d'écran et le défilement horizontal contenu dans un tableau ne sont
pas assimilés à un débordement de page. Les contrôles de date des factures et
rapports à 320 px ont fait l'objet d'une correction et d'une nouvelle mesure
ciblée. Le maintien du focus pendant la saisie contrôlée dans le dialogue à
320 × 568 a réussi. Le menu latéral, le menu utilisateur, les alertes de
stock/paiement et la recherche globale ouverts à 320 × 568 ne débordent pas.

Les données fictives incluent noms, codes et références sans séparateur,
montants élevés, alertes de stock, TVA, remise et transport. Les interactions
de ces fixtures modifient uniquement l'état React local. Aucune insertion de
données métier, création de compte agent ou soumission en production n'a été
nécessaire. Les routes de fixture ont été retirées avant livraison.

## Limites et contrôles de livraison

- Les détails nécessitant des factures, clients, crédits ou produits absents
  des données disponibles ont été revus statiquement ; leur rendu complet
  avec données réelles n'est pas déclaré testé.
- Le rôle agent a été couvert par ses composants avec données fictives.
  Il ne s'agit pas d'un parcours connecté complet avec un compte agent.
- `/admin/utilisateurs` n'était pas disponible localement sans clé serveur :
  cette page est exclue des routes déclarées testées dans le navigateur.
- L'émulation Chrome ne remplace pas un essai sur Safari/iOS ou Android réel,
  avec clavier ouvert, zoom texte ou réglages d'accessibilité particuliers.
- L'audit visuel ne prouve pas les opérations métier, la délivrabilité des
  e-mails, ni le succès du CI/CD. Les résultats TypeScript, lint, build et
  déploiement doivent être consignés après les contrôles consolidés.

Contrôles locaux consolidés : TypeScript (`npx tsc --noEmit`) et ESLint sur
les 58 fichiers TSX modifiés réussis. La compilation de production et le
déploiement sont également contrôlés par GitHub Actions avant mise en ligne.
