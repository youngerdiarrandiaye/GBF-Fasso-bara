# GFB-STOCK — Spécification de mise en page du PDF de facture

Statut : **Phase 2 bis — prête pour reprise par `dev-backend-edge`.**
Auteur : `designer-ui-ux` (agent). Périmètre strict : visuel et positionnement du gabarit PDF généré
par `supabase/functions/generer-facture-pdf/index.ts`. Aucune règle métier (calcul de totaux,
numérotation, statuts) n'est modifiée ici — ce document ne fait que spécifier la mise en forme d'un
contenu déjà calculé en base (voir en-tête du fichier source, lignes 6-11).

Ce document complète `docs/design-system.md` (référence de la palette et de la hiérarchie
typographique de l'application web) pour le cas spécifique du PDF imprimable, qui obéit à des
conventions différentes (voir §1.3).

---

## 1. Diagnostic — pourquoi le cadre signature chevauche les totaux

### 1.1 Cause exacte du bug signalé

Code actuel, `generer-facture-pdf/index.ts` lignes 452-475 :

```ts
// Zone de tampon / signature, en bas à droite de la même zone.
const sigX = MARGIN + CONTENT_WIDTH - 180;
const sigY = ctx.y + 90 > PAGE_HEIGHT - MARGIN ? ctx.y : ctx.y + 90;
ctx.page.drawRectangle({ x: sigX, y: sigY - 90, width: 180, height: 90, ... });
```

À ce point du code, `ctx.y` n'est **plus** la position juste sous le bloc des totaux : c'est la
position courante après avoir déjà dessiné tout le bloc "Modalités de règlement / délai de
disponibilité / validité de la proforma / notes" (lignes 420-450), qui décrémente `ctx.y` d'une
quantité **variable** selon le nombre de lignes de texte réellement présentes (une facture sans
`delai_disponibilite` ni `notes` a un `ctx.y` bien plus haut qu'une facture avec les deux).

Le calcul `sigY = ctx.y + 90` tente de "remonter" le haut du cadre signature de 90pt au-dessus de
cette position basse — mais comme `ctx.y` dépend directement de la longueur du texte des mentions
légales, rien ne garantit que `sigY` reste sous la ligne "TOTAL GENERAL HTVA". Sur le cas réel signalé
(une seule ligne produit, mentions légales courtes), `ctx.y` est encore haut, donc `sigY` remonte
**au-dessus** du bas du bloc des totaux : le bord supérieur du rectangle (`sigY`, qui est une ligne
horizontale pleine largeur `sigX → sigX+180`) traverse visuellement le texte "TOTAL GENERAL HTVA",
car les deux blocs se chevauchent aussi horizontalement (`sigX = totauxX + 40`, largement dans
l'emprise des totaux `totauxX → MARGIN+CONTENT_WIDTH`).

**Le bug n'est donc pas un cas limite rare : c'est une erreur de calcul systématique**, qui ne
provoque un chevauchement visible que lorsque le texte des mentions légales est court — exactement
le cas testé par GFB. Avec des mentions plus longues, le même calcul produirait l'inverse (cadre
signature trop bas, débordant sur le footer légal ou la page suivante). Aucune valeur de `ctx.y`
observée ici n'est fiable pour positionner le cadre : il faut le désolidariser du fil du texte des
mentions et le rattacher à un point de référence fixe, calculé une seule fois.

### 1.2 Contraintes techniques réelles (pdf-lib 1.17.1, vérifiées dans le code existant)

- **Origine bas-gauche, dessin impératif** : chaque `page.drawXxx()` s'exécute immédiatement, dans
  l'ordre d'appel. Il n'existe pas de moteur de layout (pas de flexbox/flow) : toute position doit
  être calculée par le code **avant** l'appel `draw`, jamais déduite après-coup. C'est la source du
  bug — corriger cela demande de calculer les points de référence une fois, dans des variables
  dédiées, jamais de réutiliser une position "de travail" (`ctx.y`) qui a bougé entre-temps pour un
  autre usage.
- **`wrapText()` ne dessine rien** (`_shared/pdf.ts` lignes 87-102) : elle calcule uniquement le
  nombre de lignes nécessaires pour un texte donné à une largeur/police/taille fixées. C'est
  l'outil clé pour **précalculer une hauteur de bloc avant de le dessiner** (déjà utilisé pour la
  désignation produit, ligne 282) — la même technique doit être appliquée au bloc mentions légales
  pour rendre la pagination fiable (voir §5).
- **3 polices standard embarquées** : Helvetica, HelveticaBold, HelveticaOblique. **`Courier` et
  `CourierBold` sont également des polices standard PDF (14 polices de base), disponibles sans
  fichier externe ni coût de rendu supplémentaire** — à utiliser pour les montants (voir §3.2), en
  cohérence avec la règle "montants toujours en police monospace" de `docs/design-system.md` §5.5
  et §7.
- **Pas de coins arrondis natifs** : `page.drawRectangle()` ne supporte pas de `border-radius`. Le
  PDF ne peut donc pas répliquer visuellement `rounded-lg/xl/2xl` du design system web — c'est une
  divergence assumée et documentée (§1.3), pas un oubli.
- **Primitives fiables déjà en usage dans ce fichier** : `drawRectangle` (remplissage et/ou
  bordure), `drawLine`, `drawText`, `drawImage`. Toute nouvelle spécification de dessin (placeholder
  photo, encadrés) doit se limiter à ces primitives déjà éprouvées dans ce code, pour rester
  implémentable sans risque de régression sur une API pdf-lib incertaine.
- **Pagination existante (`ensureSpace`)** : le mécanisme actuel (lignes 261-276) vérifie l'espace
  restant ligne de tableau par ligne de tableau, et redessine un en-tête de tableau sur la page
  suivante. Ce mécanisme est correct pour le tableau ; il n'est en revanche **jamais appelé avec une
  estimation correcte pour le bloc totaux + mentions + signature**, qui est traité comme une suite
  de petits blocs indépendants (`ensureSpace(110)` puis `ensureSpace(120)` — deux appels distincts,
  arbitraires, qui ne garantissent pas que l'ensemble tienne sur la même page sans coupure disgracieuse).

### 1.3 Divergence assumée avec `docs/design-system.md`

Le design system web impose un corps de texte **16px minimum** (règle terrain, lisibilité en
extérieur sur écran). **Cette règle ne s'applique pas telle quelle au PDF imprimé** : un PDF A4
suit les conventions d'un document commercial/légal classique (8-10pt de corps de texte est standard
sur ce format pour faire tenir un tableau de lignes produit + totaux + mentions légales sur une page
lisible à l'impression). Le PDF reste sobre, vert + noir/gris, sans les micro-interactions (hover,
focus, animations) qui n'ont pas de sens sur un document statique imprimé. Seules sont reprises du
design system : la couleur d'accent verte (`--color-green-dk` `#15803D`, jamais le vert vif
`#16A34A` qui est moins lisible en petits corps sur fond blanc — cf. décision D-03 du design
system), la règle "montants en monospace, alignés à droite" (§5.5), et le principe de hiérarchie
visuelle forte. Toute future divergence de ce type doit être documentée ici (§8, journal des
décisions), pas tranchée silencieusement dans le code.

---

## 2. Carte générale des zones (page A4, 595.28 × 841.89 pt, marge 40pt)

Proportions **relatives**, la hauteur réelle de chaque zone dynamique dépendant du contenu (nombre
de lignes produit, longueur des mentions légales). Les hauteurs indiquées sont des **ordres de
grandeur pour une facture à une seule ligne produit** — jamais des positions fixes à coder en dur.

```
┌──────────────────────────────────────────────────────────────┐
│ 1. EN-TÊTE ENTREPRISE + BLOC TITRE/N°/DATE          ~95 pt    │
├──────────────────────────────────────────────────────────────┤
│ 2. ZONE CLIENT (boîte) | ZONE AGENT (boîte)     ~90-130 pt    │
├──────────────────────────────────────────────────────────────┤
│ 3. TABLEAU DES LIGNES PRODUIT              variable (≥36pt/l) │
│    (peut paginer, en-tête répété — inchangé)                  │
├──────────────────────────────────────────────────────────────┤
│ 4. BLOC TOTAUX (encadré, total général mis en évidence) ~95pt │
├──────────────────────────────────────────────────────────────┤
│    ↕ ESPACEMENT OBLIGATOIRE — 28 pt minimum                   │
├───────────────────────────┬────────────────────────────────────┤
│ 5a. MENTIONS LÉGALES       │ 5b. CACHET / SIGNATURE (fixe, 100pt)│
│     (largeur ~300pt,        │     (largeur 180pt, ancrée au MÊME │
│      hauteur variable)      │      point de départ Y que 5a)      │
├───────────────────────────┴────────────────────────────────────┤
│ 6. BANDE LÉGALE BAS DE PAGE (fixe, réservée, 60pt)             │
└──────────────────────────────────────────────────────────────┘
```

**Règle d'or qui élimine la classe de bug rencontrée** : les zones 5a et 5b partagent un seul et
même point d'ancrage vertical, calculé **une fois**, immédiatement après la zone 4 — jamais recalculé
à partir de la position d'écriture d'un des deux blocs. Voir §5 pour l'algorithme exact.

---

## 3. Hiérarchie typographique du PDF

| Niveau | Taille | Police | Couleur | Usage |
|---|---|---|---|---|
| Titre document | 16pt | HelveticaBold | `#15803D` (green-dk) | "FACTURE" / "FACTURE PROFORMA" / "FACTURE ANNULEE" |
| Nom entreprise | 14pt | HelveticaBold | Noir `#000000` | Identité légale — reste noir, pas vert (autorité du document, pas branding) |
| Libellé de section (eyebrow) | 7.5pt, MAJUSCULES | HelveticaBold | `#15803D` | "CLIENT", "AGENT COMMERCIAL", "MODALITÉS DE RÈGLEMENT", en-têtes de colonnes du tableau |
| Nom client / montant total général | 10-13pt (voir §4.4) | HelveticaBold / CourierBold | Noir | Données qui doivent ressortir |
| Corps de texte | 8pt | Helvetica | Noir `#212121` | Désignations, adresses, mentions légales |
| Texte secondaire / méta | 7-7.5pt | Helvetica | Gris `#595959` (≈ rgb 0.35) | Activités entreprise, sous-lignes d'adresse, agent commercial |
| Note italique | 6.5-8pt | HelveticaOblique | Gris `#595959` | "(inclus dans le kit)", "Cachet et signature" |
| Montants (tous, y compris tableau) | 8pt (lignes), 9pt (sous-totaux), 13pt (total général) | **Courier / CourierBold** | Noir | Alignement à droite, cohérence avec la règle monospace du design system |
| Bande légale bas de page | 6.5pt | Helvetica | Gris `#4D4D4D` | NINEA, RC, RIB, IBAN, SWIFT |

**Changement concret par rapport au code actuel** : les montants (`P.U.`, `Total` ligne, `Total HT`,
`Forfait transport`, `TVA`, `TOTAL GENERAL`) doivent passer de `fontRegular`/`fontBold` (Helvetica) à
deux polices supplémentaires à embarquer : `StandardFonts.Courier` et `StandardFonts.CourierBold`.
Aucun coût technique (polices standard, pas de fichier à charger), gain direct de cohérence avec le
reste de l'application et de lisibilité des chiffres (chiffres à chasse fixe = alignement des
milliers impeccable colonne par colonne).

---

## 4. Spécification détaillée par zone

### 4.1 En-tête entreprise + bloc titre (zone 1)

Structure actuelle globalement correcte (logo + nom + activités + adresses + téléphones + email à
gauche ; titre + numéro + date alignés à droite). Ajustements :

- Nom entreprise : 13pt → **14pt**, inchangé en noir.
- Titre statut ("FACTURE"/"FACTURE PROFORMA"/"FACTURE ANNULEE") : 14pt → **16pt**, couleur
  **`#15803D`** (au lieu de noir) — c'est le premier élément que l'œil doit accrocher après le nom de
  l'entreprise.
- La ligne de séparation horizontale en bas de zone (actuellement noire, 1pt) passe à **couleur
  `#15803D`, épaisseur 1.5pt** — un unique filet vert en haut de page suffit à installer l'identité
  visuelle sans surcharger un document qui doit rester imprimable en N&B (un filet plein s'imprime
  toujours proprement, contrairement à un fond coloré étendu).
- Aucun changement de position/dimensions du logo (contrainte image externe hors périmètre visuel).

### 4.2 Zone Client / Agent (zone 2) — rééquilibrage

**Constat** (point 5 du brief) : le schéma `clients` expose `nom, type_client, adresse, telephone,
email, ninea` — tous déjà affichés sauf `type_client`, qui doit être ajouté (voir ci-dessous). Le
schéma `utilisateurs` (table de l'agent), lui, n'expose que `nom` — **aucun téléphone ni email agent
n'existe en base**. Le déséquilibre visuel actuel n'est donc pas un manque de champs côté agent (rien
à ajouter, la donnée n'existe pas) mais un manque de **traitement graphique symétrique** : le bloc
client est une liste de texte à même le fond de page, le bloc agent une simple ligne grise flottante
sans cadre. La correction est purement visuelle :

**Deux encadrés de même hauteur, côte à côte**, bordure fine `#BFBFBF` (0.75pt), padding interne 8pt :

- **Boîte Client** — largeur ≈ 58% de `CONTENT_WIDTH` (≈ 300pt), à gauche.
  - Eyebrow "CLIENT" (7.5pt, vert, gras, majuscules).
  - Nom du client (10pt gras noir) **+ tag type_client** juste à droite du nom, sur la même ligne si
    la largeur le permet, sinon ligne suivante : petit rectangle gris clair (`fill #EDEDED`, bordure
    `#D9D9D9` 0.5pt), texte 6.5pt gras noir, libellé "PARTICULIER" / "ENTREPRISE" / "COOPÉRATIVE"
    (même traitement neutre que les autres tags descriptifs du design system, cf. D-05 — pas de
    couleur sémantique, c'est une donnée factuelle, pas un état).
  - Adresse, téléphone, email : 8pt gris `#595959`, une ligne chacun si présents (inchangé).
  - NINEA : conservé, affiché seulement si `type_client !== 'particulier'` (règle actuelle
    conservée, cohérente avec le tag ci-dessus qui rend déjà cette distinction visible).
- **Boîte Agent** — largeur ≈ 38% de `CONTENT_WIDTH` (≈ 195pt), à droite, même hauteur que la boîte
  client (voir calcul ci-dessous), même style de bordure.
  - Eyebrow "AGENT COMMERCIAL" (7.5pt, vert, gras, majuscules).
  - Nom de l'agent (10pt gras noir).
  - Pas d'autre champ (rien de plus à afficher, cf. constat ci-dessus) — l'équilibre visuel vient de
    la boîte elle-même (bordure + padding identiques), pas d'un remplissage artificiel de contenu.

**Calcul de hauteur (à faire avant de dessiner les bordures)** : compter le nombre de lignes réelles
du bloc client (1 pour le nom+tag, +1 par champ optionnel présent parmi adresse/téléphone/email/
NINEA) et du bloc agent (fixe : eyebrow + nom = 2 lignes). La hauteur des **deux** boîtes est fixée à
`max(hauteur_client, hauteur_agent) + padding`, puis les deux rectangles de bordure sont dessinés à
cette hauteur commune. La zone tableau (zone 3) démarre juste sous cette hauteur commune, quel que
soit le contenu réellement présent — élimine tout risque de bordures de hauteurs différentes ou de
chevauchement avec le tableau.

### 4.3 Tableau des lignes produit (zone 3) — colonne Photo

**Décision retenue (option la plus simple et robuste, cf. brief point 3)** : **réduction/masquage
conditionnel de la colonne, tranché une seule fois avant de dessiner le tableau**, pas une décision
ligne par ligne.

Algorithme :
1. Avant de dessiner l'en-tête du tableau, calculer `aUneAuMoinsUnePhoto = lignes.some(l =>
   Boolean(photoCache.get(l.produit?.photos_urls?.[0])))` (le cache est déjà rempli en amont dans le
   code actuel, lignes 240-254 — cette vérification ne coûte rien de plus).
2. **Si aucune ligne n'a de photo** : la colonne "Photo" est entièrement supprimée. Sa largeur
   (36pt) est réaffectée à la colonne "Désignation" (196 → 232pt), qui en a le plus l'usage
   (désignations longues type "Spray Tube (Laser Spray) - Rouleau 100m"). L'en-tête de colonne
   "Photo" n'est pas dessiné. C'est le cas le plus simple à implémenter (un `if` unique en amont, le
   reste du code de rendu de ligne n'a pas besoin de connaître ce cas).
3. **Si au moins une ligne a une photo** : la colonne est conservée pour toutes les lignes (largeurs
   de colonnes identiques ligne à ligne = alignement du tableau garanti). Pour chaque ligne **sans**
   photo (`photoUrl` absent OU téléchargement échoué), un **placeholder discret** est dessiné à la
   place, construit uniquement avec les primitives déjà utilisées dans ce fichier :
   - Carré 22×22pt centré dans la cellule (au lieu de 30×30 pour les vraies photos, légèrement plus
     petit pour bien signaler visuellement "absence", pas une vraie image réduite).
   - `drawRectangle` : fond `#F2F2F2`, bordure `#D9D9D9` 0.5pt.
   - Une seule `drawLine` en diagonale (coin bas-gauche → coin haut-droit du carré), couleur
     `#C9C9C9`, épaisseur 0.75pt — pictogramme minimal universellement compris ("image
     indisponible"), sans dépendre d'une police d'icônes ou d'une primitive `drawEllipse` non encore
     éprouvée dans ce fichier.
   - Aucun texte dans la cellule (une légende "pas de photo" serait plus lourde visuellement que
     l'absence actuelle — le placeholder graphique suffit et reste discret comme demandé).

### 4.4 Bloc totaux (zone 4) — mise en évidence du total général

Constat (point 4 du brief) : `Total HT`, `Forfait transport`, `TVA` et `TOTAL GENERAL` ont
aujourd'hui exactement le même traitement (9-10pt, une seule ligne noire au-dessus). Correction :

- **Cadre englobant léger** : un rectangle bordure seule (`#D9D9D9`, 0.75pt, pas de fond) autour de
  l'ensemble du bloc totaux (de `Total HT` jusqu'à `TOTAL GENERAL` inclus), largeur = largeur de la
  colonne totaux (`totauxX - 10` → `MARGIN + CONTENT_WIDTH`), hauteur = calculée dynamiquement
  (nombre de lignes réellement affichées : 2 fixes + 1 si TVA > 0, + hauteur de la ligne total
  général qui est plus grande). Ce cadre regroupe visuellement l'information et sépare nettement ce
  bloc du tableau au-dessus (répond aussi au point 2 du brief : hiérarchie/séparation des sections).
- **Ligne "Total HT" et "Forfait transport"** : inchangées (8-9pt Helvetica, valeurs en Courier).
- **Ligne "TVA (x%)"** : inchangée, affichée seulement si `tva_taux > 0` (règle métier existante,
  non modifiée).
- **Filet de séparation avant le total général** : passe de noir 1pt à **`#15803D`, 1.25pt** (accent
  vert, cohérent avec le reste du document).
- **Ligne "TOTAL GENERAL HTVA" / "TOTAL GENERAL TTC"** : traitement distinct et volontairement plus
  lourd —
  - Fond pastel vert très clair derrière toute la largeur de la ligne (`rgb(0.90, 0.96, 0.92)`,
    dérivé de `--color-green` à 15% cf. règle "fond pastel des badges" du design system) — ce ton
    est assez clair pour rester lisible en photocopie N&B (perçu comme un très léger gris).
  - Libellé "TOTAL GENERAL HTVA"/"TTC" : 10pt HelveticaBold (au lieu de 9-10pt actuel, peu de
    changement mais gras confirmé).
  - Montant : **13pt CourierBold**, contre 10pt actuellement — c'est le montant qui doit sauter aux
    yeux en premier dans tout ce bloc, conformément au constat 4 du brief.
  - Padding vertical de la ligne augmenté (min 22pt de hauteur au lieu de ~16pt) pour que le fond
    pastel respire autour du texte plus grand.

### 4.5 Mentions légales + signature (zone 5) — correctif du chevauchement

Voir algorithme complet §5. Règles de contenu (inchangées, juste repositionnées) :

- Colonne gauche (mentions, largeur 300pt) : "Modalités de règlement" (eyebrow vert 7.5pt gras
  majuscules, au lieu de simple gras noir 8pt actuel) puis texte 8pt noir, puis "Délai de
  disponibilité" si renseigné, puis "Validité de la proforma", puis "Notes" si renseignées —
  contenu et ordre inchangés.
- Colonne droite (signature, largeur 180pt, **hauteur fixe 100pt** — légèrement agrandie par
  rapport aux 90pt actuels pour un rendu moins compressé) : cadre bordure `#999999` 0.75pt, texte
  "Cachet et signature" en haut (italique gris 8pt), "LE PRESIDENT" centré en bas (gras noir 10pt).
  Contenu inchangé, seule la méthode de calcul de position change.

### 4.6 Bande légale bas de page (zone 6)

Inchangée dans son contenu (nom entreprise/adresses/téléphones, puis NINEA/RC/RIB/IBAN/SWIFT).
Seul ajustement : le filet séparateur au-dessus (`drawLine` ligne 657-662) passe de gris `rgb(0.7)`
à **`#15803D` à 40% d'opacité visuelle**, obtenue en pdf-lib par une couleur atténuée plutôt qu'une
vraie opacité (non supportée sur `drawLine`) : utiliser `rgb(0.70, 0.82, 0.75)` (mélange gris/vert
clair) plutôt que le vert plein, pour rester discret en bas de page.

**Recommandation optionnelle (hors périmètre strict de ce correctif, à évaluer plus tard avec
`dev-backend-edge`)** : ajouter une numérotation "Page N / Total" en bas à droite de chaque page,
utile dès qu'une facture a beaucoup de lignes (kits à composants multiples) et pagine sur 2+ pages.
Techniquement réalisable en pdf-lib via une seconde passe sur `pdfDoc.getPages()` juste avant
`pdfDoc.save()`, une fois le nombre total de pages connu. Non requis pour corriger le bug signalé —
à ne traiter que si `dev-backend-edge` juge le coût d'implémentation négligeable.

---

## 5. Algorithme de positionnement dynamique (correctif du bug)

Objectif : garantir, **quel que soit** le nombre de lignes produit, la longueur des mentions légales
(présence ou non de `delai_disponibilite`/`notes`) et le taux de TVA, qu'il n'existe **aucune**
position calculée à partir d'une variable ayant déjà servi à un autre usage. Chaque bloc a son point
d'ancrage propre, dérivé une seule fois du bloc précédent.

Pseudocode (à adapter par `dev-backend-edge` dans le style du fichier existant — ceci est une
spécification, pas du code à copier tel quel) :

```
// --- 1. Précalcul de la hauteur du bloc totaux (fixe, ne dépend que de tva_taux) ---
nbLignesTotaux = 2 + (tvaTaux > 0 ? 1 : 0)   // Total HT, Forfait transport, [TVA]
hauteurTotaux  = nbLignesTotaux * 16 + 10 (filet) + 22 (ligne total général) + 16 (paddings cadre)

// --- 2. Précalcul de la hauteur du bloc mentions (variable, dépend du texte réel) ---
lignesMentions = []
lignesMentions += 1 (eyebrow "Modalités de règlement")
lignesMentions += wrapText(entreprise.modalites_reglement, ...).length
if (entreprise.delai_disponibilite) lignesMentions += wrapText(`Délai...`, ...).length
lignesMentions += wrapText(validiteTexte, ...).length
if (facture.notes) lignesMentions += 1 + wrapText(facture.notes, ...).length
hauteurMentions = lignesMentions * 11 + 4 (marge "Notes" éventuelle)

// --- 3. Hauteur du bloc signature : TOUJOURS fixe ---
hauteurSignature = 100

// --- 4. Réservation d'espace ATOMIQUE pour tout le bloc bas de page ---
GAP_APRES_TOTAUX = 28
hauteurBlocBasDePage = hauteurTotaux + GAP_APRES_TOTAUX + max(hauteurMentions, hauteurSignature)
ensureSpace(hauteurBlocBasDePage)   // saut de page AVANT de commencer à dessiner,
                                    // jamais en cours de dessin de ce bloc

// --- 5. Dessin du bloc totaux (inchangé dans son contenu, cf. §4.4) ---
dessinerBlocTotaux(ctx.page, ctx.y, ...)
ctx.y -= hauteurTotaux

// --- 6. Point d'ancrage UNIQUE pour mentions + signature ---
const yFooterTop = ctx.y - GAP_APRES_TOTAUX   // calculé UNE FOIS, jamais réassigné avant
                                               // que les deux colonnes soient dessinées

// --- 7a. Colonne mentions : dessinée à partir de yFooterTop, dans une variable LOCALE ---
let yMentions = yFooterTop
yMentions = dessinerMentionsLegales(ctx.page, yMentions, ...)   // décrémente une copie locale

// --- 7b. Colonne signature : ancrée à yFooterTop DIRECTEMENT, jamais via ctx.y ---
const sigTop = yFooterTop           // <-- LE FIX : plus de "ctx.y + 90", ancrage direct
dessinerCadreSignature(ctx.page, sigX, sigTop, largeur=180, hauteur=100)

// --- 8. Reprise du fil de page après le MAX des deux hauteurs réellement utilisées ---
ctx.y = min(yMentions, yFooterTop - hauteurSignature)
```

**Pourquoi ce fix élimine la classe de bug entière, pas seulement le cas observé** :

- Le cadre signature ne dépend plus **jamais** de la longueur du texte des mentions légales — son
  point d'ancrage (`yFooterTop`) est fixé avant même que la colonne mentions ne soit dessinée.
- La réservation d'espace (`ensureSpace(hauteurBlocBasDePage)`) est faite **avant** de dessiner quoi
  que ce soit dans ce bloc, avec une estimation qui inclut la vraie longueur du texte (via
  `wrapText`, qui ne dessine rien — cf. §1.2) : impossible qu'un saut de page tombe **au milieu** du
  bloc totaux/signature, quel que soit le nombre de lignes de mentions.
- Le nombre de lignes produit (tableau, zone 3) n'intervient pas directement dans ce calcul — il
  influence seulement la valeur de `ctx.y` au moment d'entrer dans cette section, ce qui est déjà
  géré correctement par les appels `ensureSpace` existants ligne par ligne dans la boucle du tableau
  (aucun changement requis à cet endroit).

---

## 6. Palette PDF (sous-ensemble imprimable de `docs/design-system.md`)

| Usage | Couleur | RGB pdf-lib (`rgb(r,g,b)`, 0-1) |
|---|---|---|
| Texte principal | `#212121` | `rgb(0.13, 0.13, 0.13)` |
| Texte secondaire / méta | `#595959` | `rgb(0.35, 0.35, 0.35)` |
| Accent vert (titres de section, filets, total général) | `#15803D` (green-dk) | `rgb(0.086, 0.502, 0.235)` |
| Fond pastel total général | dérivé vert 15% | `rgb(0.90, 0.96, 0.92)` |
| Bordures fines (cadres, tags) | `#D9D9D9` | `rgb(0.85, 0.85, 0.85)` |
| Bordures cadres client/agent/signature | `#999999` / `#BFBFBF` | `rgb(0.6, 0.6, 0.6)` / `rgb(0.75, 0.75, 0.75)` |
| Fond tag neutre (type_client) | `#EDEDED` | `rgb(0.93, 0.93, 0.93)` |
| Fond placeholder photo absente | `#F2F2F2` | `rgb(0.95, 0.95, 0.95)` |
| Ligne diagonale placeholder photo | `#C9C9C9` | `rgb(0.79, 0.79, 0.79)` |
| Fond en-tête de tableau | inchangé, neutre | `rgb(0.92, 0.92, 0.92)` |

**Note volontaire** : ambre, rouge, bleu, violet (statuts métier du design system web) ne sont **pas
repris** dans le PDF. Le PDF est un document commercial figé pour le client final, pas une interface
d'état à surveiller — sa seule couleur d'accent est le vert de marque, en usage sobre (filets,
libellés de section, mise en valeur du total général). Si un besoin futur apparaît (ex. filigrane
"ANNULÉE" en rouge diagonal sur les factures annulées), il devra faire l'objet d'une nouvelle entrée
au journal des décisions (§8) avant implémentation — non couvert par ce correctif.

---

## 7. Cas de test pour la QA (`qa-testeur`) après implémentation

À vérifier explicitement, car ce sont exactement les scénarios qui auraient dû faire échouer le
code actuel avant sa mise en prod :

1. **Facture à une seule ligne produit, mentions légales courtes** (le cas signalé par GFB,
   `FP20260803001`) : le cadre signature doit rester strictement sous le bloc totaux, avec au moins
   28pt d'espace visible, aucune ligne ne doit traverser "TOTAL GENERAL HTVA".
2. **Facture avec `delai_disponibilite` ET `notes` renseignés** (mentions légales longues,
   plusieurs lignes de wrap) : le cadre signature doit rester à la **même hauteur relative** que le
   cas 1 (ancré à `yFooterTop`, pas décalé vers le bas par le texte), et ne doit jamais chevaucher le
   texte des mentions à sa droite.
3. **Facture avec >15 lignes produit** (pagination du tableau) : le bloc totaux + mentions +
   signature ne doit jamais être coupé entre deux pages — soit il tient entièrement sur la page
   courante après le dernier produit, soit **tout le bloc** bascule sur une nouvelle page.
4. **Facture avec `tva_taux > 0`** : vérifier que l'ajout de la ligne TVA dans le bloc totaux ne
   décale pas la mise en évidence du total général (fond pastel + taille) ni ne casse l'espacement
   avec le footer.
5. **Aucun produit de la facture n'a de photo** : colonne "Photo" absente, "Désignation" élargie,
   alignement des autres colonnes inchangé.
6. **Mélange de lignes avec et sans photo** dans la même facture : placeholder discret uniquement
   sur les lignes sans photo, pas de décalage de colonnes entre les lignes.
7. **Client `entreprise` ou `cooperative` avec NINEA** vs **client `particulier`** : tag type_client
   visible dans les deux cas, NINEA visible seulement si non particulier (règle inchangée).
8. **Statut `annulee`** : titre "FACTURE ANNULEE" toujours lisible en 16pt vert — vérifier qu'aucun
   changement de cette spec ne masque accidentellement ce libellé (aucune modification prévue ici,
   simple garde-fou de non-régression).

---

## 8. Journal des décisions (cas non couverts par le CDC initial)

**D-01 — Corps de texte 8pt vs règle "16px minimum" du design system web.** Décision : le PDF suit
les conventions d'un document imprimé A4 (8-10pt de corps standard), la règle 16px du design system
ne s'applique qu'à l'interface web (voir §1.3). Documenté ici pour qu'un futur agent ne "corrige" pas
le PDF à tort vers du 16pt, ce qui ferait exploser la pagination.

**D-02 — Colonne Photo : masquage total vs réduction partielle.** Décision : masquage total de la
colonne si aucune ligne n'a de photo (option la plus simple, un seul `if` en amont), plutôt qu'une
réduction proportionnelle par ligne qui casserait l'alignement du tableau (voir §4.3).

**D-03 — Placeholder photo absente construit uniquement avec primitives déjà éprouvées.** Décision :
carré + une diagonale (`drawRectangle` + `drawLine`), pas d'icône vectorielle complexe ni de
primitive `drawEllipse` non encore utilisée dans ce fichier, pour rester implémentable sans risque
(voir §4.3).

**D-04 — Montants du PDF en Courier/CourierBold.** Décision : alignement avec la règle "montants en
monospace" du design system web (§5.5), rendu possible sans coût car Courier fait partie des 14
polices PDF standard (voir §1.2 et §3).

**D-05 — Pas de couleurs de statut métier (ambre/rouge/bleu/violet) dans le PDF.** Décision : le PDF
est un document figé pour le client final, pas une interface de suivi d'état ; seule la couleur verte
de marque y figure, en usage sobre (voir §6). Point d'extension documenté si un filigrane de statut
est demandé plus tard.

---

## 9. Handoff

**Cette spécification est prête à être reprise par `dev-backend-edge`** pour modification de
`supabase/functions/generer-facture-pdf/index.ts` (et, si besoin, ajout de deux polices standard
Courier/CourierBold dans `buildFacturePdf`, sans toucher à `_shared/pdf.ts` qui reste inchangé — les
helpers `wrapText`/`formatFcfa`/`sanitizeForPdf`/`fetchImageBytes` existants couvrent déjà tous les
besoins de cette spec).

Aucune ligne de `generer-facture-pdf/index.ts` n'a été modifiée par cet agent (périmètre visuel
uniquement, conformément à sa mission). Points d'attention explicites pour l'implémentation :

- Le fix prioritaire (chevauchement signature/totaux) est isolé au §5 — il peut être livré seul,
  indépendamment du reste de la hiérarchie typographique (§3-4), si une correction urgente est
  nécessaire avant le reste de la refonte visuelle.
- Toute question non couverte par ce document ou par le journal §8 doit remonter à `designer-ui-ux`
  avant d'être tranchée dans le code, pour que la cohérence survive aux prochaines sessions —
  même principe que `docs/design-system.md` §10.
