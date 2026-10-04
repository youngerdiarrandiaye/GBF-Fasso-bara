# GFB-STOCK — Facture PDF, itération 2 (inspiration "MineAxis / 3ST")

Statut : **Spécification prête pour reprise par `dev-backend-edge`** — sauf le point 3 (QR code),
explicitement **non tranché** et documenté comme tel (voir §5).
Auteur : `designer-ui-ux` (agent). Périmètre strict : visuel et positionnement du gabarit PDF généré
par `supabase/functions/generer-facture-pdf/index.ts`. Aucune règle métier n'est modifiée.

Ce document **complète** `docs/facture-pdf-design.md` (v1, déjà implémentée et validée — le bug de
chevauchement cachet/totaux est corrigé, cf. son §5) et `docs/design-system.md` (référence unique de
la palette et des règles de composants web). Il ne réécrit pas ce qui reste valable : il documente
les **deltas** à appliquer sur le code déjà en place. **Toute section de v1 non mentionnée ici reste
inchangée et fait toujours foi.**

---

## 0. Cadrage — ce qu'on adapte et ce qu'on n'adapte pas

Le document de référence cité (permis interne "MineAxis — MANAGEM | 3ST") est un document
d'habilitation individuelle, pas un document commercial. Certains de ses partis pris ne se
transposent pas tels quels à une facture, et je le documente explicitement plutôt que de forcer une
ressemblance superficielle :

| Élément de référence | Transposable à la facture GFB ? | Décision |
|---|---|---|
| Carte unique bordée, padding généreux | **Oui** | §2 |
| Badge "STATUT" très visible en haut à droite | **Oui** — répond à un vrai besoin (proforma vs définitif) | §1 |
| Libellés de section gris + filet | **Oui**, en complément de ce qui existe déjà | §3 |
| Petits cadres bordés groupant des infos courtes | **Déjà couvert par v1** (boîtes Client/Agent, §4.2 v1) | inchangé |
| Badges pilule "✓ SST" | **Partiellement** — voir §4 (divergence assumée) | §4 |
| QR code de vérification | **Non réaliste à court terme** | §5 (bloquant produit, pas bloquant pour le reste) |
| Petit libellé orange "SITE MINIER" au-dessus du titre | **Non** — aucune donnée GFB équivalente (pas de champ "secteur/site" en base), inventer ce libellé serait fabriquer une information | Non repris |
| Pied de page signature = simple ligne de soulignement | **Non** — v1 garde un cadre bordé, car "Cachet et signature" désigne un vrai tampon d'entreprise physique à apposer (contexte commercial sénégalais), pas seulement un paraphe. Le permis de conduite n'a pas cette contrainte. | Cadre v1 conservé tel quel |

---

## 1. Badge de statut de la facture (nouveau)

### 1.1 Constat qui justifie le changement

Le code actuel bloque déjà la génération PDF pour le statut `brouillon` (`index.ts` lignes 169-177,
`409` explicite) : **seuls 5 des 6 statuts atteignent réellement ce gabarit** —
`proforma, validee, payee_partielle, payee, annulee`. `brouillon` est traité ici de façon défensive
(mapping prévu, mais normalement jamais atteint).

Le titre actuel (`titrePourStatut`, ligne 628) ne distingue que 3 cas : `"FACTURE PROFORMA"`,
`"FACTURE ANNULEE"`, et `"FACTURE"` pour tout le reste — **`validee`, `payee_partielle` et `payee`
produisent exactement le même titre**. Un client qui reçoit une facture `validee` (stock décrémenté,
mais rien n'est encore payé) ne peut pas la distinguer visuellement d'une facture `payee`. C'est
précisément le problème que le badge du document de référence résout pour "VALIDE" vs les autres
états d'un permis.

**Décision** : le titre existant (`titrePourStatut`) **ne change pas** (il continue à distinguer le
type de document — proforma = devis non engageant, annulée = mise en avant redondante volontaire
d'un état terminal négatif, cf. cas de test 8 de v1 déjà validé). Le badge est un **composant
supplémentaire**, pas un remplacement.

### 1.2 Mapping statut → badge (aligné sur `docs/design-system.md` §5.1 et §4.2)

Les libellés reprennent **mot pour mot** ceux déjà définis pour le badge web (§5.1 du design
system), en majuscules — pas de nouveau vocabulaire inventé pour le PDF. Les couleurs de texte
foncées réutilisent **exactement** les variantes "texte sur fond clair" déjà tranchées en §4.2 du
design system (aucune couleur nouvelle inventée pour cette itération) ; le fond pastel de chaque
badge est calculé par la même méthode que le pastel vert déjà utilisé en v1 pour le total général
(mélange ~85% blanc / 15% couleur de la palette de référence).

| Statut | Libellé badge | Couleur texte/bordure (`rgb`, = design-system §4.2) | Fond pastel (`rgb`) |
|---|---|---|---|
| `brouillon` (défensif, normalement inatteignable) | "BROUILLON" | `#595959` → `rgb(0.35,0.35,0.35)` (= `COLOR_TEXT_SECONDARY` déjà existant) | `rgb(0.93,0.93,0.93)` (= `COLOR_TAG_BG` déjà existant) |
| `proforma` | "PROFORMA" | `#B45309` → `rgb(0.706,0.325,0.035)` | `rgb(0.99,0.94,0.86)` |
| `validee` | "VALIDÉE" | `#1D4ED8` → `rgb(0.114,0.306,0.847)` | `rgb(0.87,0.91,0.99)` |
| `payee_partielle` | "PAYÉE PARTIELLE" | `#6D28D9` → `rgb(0.427,0.157,0.851)` | `rgb(0.92,0.88,0.99)` |
| `payee` | "PAYÉE" | `#15803D` → `COLOR_GREEN_DK` (déjà défini) | `rgb(0.90,0.96,0.92)` (= `COLOR_TOTAL_PASTEL_BG` déjà défini) |
| `annulee` | "ANNULÉE" | `#B91C1C` → `rgb(0.725,0.110,0.110)` | `rgb(0.99,0.89,0.89)` |

3 des 6 couleurs (`payee`, `brouillon` défensif) réutilisent des constantes **déjà déclarées** dans
le fichier (`COLOR_GREEN_DK`, `COLOR_TEXT_SECONDARY`, `COLOR_TAG_BG`) — seules 4 nouvelles constantes
sont réellement à ajouter (`proforma`, `validee`, `payee_partielle`, `annulee`, chacune en paire
texte+fond, soit 8 littéraux `rgb()` au total).

### 1.3 Structure du badge et repositionnement du bloc titre/n°/date

**Divergence assumée avec le document de référence** : pas de vrai `rounded-full` (pilule) — pdf-lib
ne supporte pas les coins arrondis natifs (déjà documenté en v1 §1.2). Le badge est un petit encadré
rectangulaire, dans le même esprit que le tag `type_client` déjà en usage (`drawTag`, ligne 774) :
fond pastel, bordure fine 0.5pt de la couleur de texte, coins droits — cohérent avec le style déjà
établi pour les petits encadrés d'information dans ce fichier, pas une exception isolée.

**Position : coin supérieur droit, au-dessus du titre statut** (reproduit l'ordre de lecture du
document de référence : le badge est ce que l'œil accroche en premier, avant même le titre).

Nouvelle disposition de la colonne droite de l'en-tête (remplace les décalages verticaux fixes de
`drawHeader`, ligne 589-617) :

```
y0 = PAGE_HEIGHT - MARGIN                         (référence, inchangée)

Badge STATUT   : boîte 120×26pt, x = MARGIN+CONTENT_WIDTH-120, y_haut = y0, y_bas = y0-26
                 eyebrow "STATUT" 6.5pt gras gris #595959, baseline y0-9
                 valeur   (libellé §1.2) 10pt gras couleur du statut, baseline y0-21, centrée
Titre statut   : 16pt gras vert (inchangé en contenu, cf. §1.1) — baseline y0-42  (était y0-14)
N° facture     : baseline y0-58                                    (était y0-32)
Date           : baseline y0-70                                    (était y0-46)
Filet vert     : y0-92, épaisseur 1.5pt                            (était y0-68)
```

**Impact en cascade à corriger (point d'attention explicite pour `dev-backend-edge`)** : la fonction
`drawClientAgentBoxes` (ligne 649) utilise aujourd'hui une constante **fixe et non dérivée** du
filet réel de l'en-tête : `const boxTop = PAGE_HEIGHT - MARGIN - 80;`. Cette valeur doit devenir
**`PAGE_HEIGHT - MARGIN - 104`** (nouveau filet à `y0-92`, plus le même écart de 12pt déjà utilisé en
v1 entre le filet et le haut des boîtes Client/Agent : `92 + 12 = 104`). C'est un changement de
constante isolé, aucune autre logique de `drawClientAgentBoxes` n'est affectée (le calcul de hauteur
dynamique des boîtes reste inchangé).

**N° de facture : mise en conformité avec `docs/design-system.md` §5.5** (constat fait en marge de
cette refonte) — la règle "identifiant en police monospace, dans un tag neutre" n'est aujourd'hui
**pas respectée** dans le PDF : le numéro est en Helvetica normale, texte brut. Changement : police
`fonts.courier` (au lieu de `fonts.regular`) pour le texte `N° {numero}`, dans un petit tag neutre
(même style que `drawTag`, fond `COLOR_TAG_BG`) plutôt qu'en texte nu. Correction mineure mais
directement liée à la cohérence de hiérarchie visuelle demandée dans ce brief.

### 1.4 Journal — pourquoi ce badge déroge à la décision D-05 de v1

**V2-D-01 — Réintroduction des couleurs de statut métier dans le PDF, en dérogation ciblée à D-05.**
v1 avait tranché : "le PDF est un document figé pour le client final, pas une interface d'état à
surveiller" (§8 D-05 de `docs/facture-pdf-design.md`), donc aucune couleur ambre/rouge/bleu/violet.
Cette itération **déroge à cette règle, mais uniquement pour le badge de statut** (§1 ci-dessus) :
le besoin exprimé — un client qui reçoit un document encore `proforma` doit voir immédiatement que ce
n'est pas définitif — est un besoin de sécurité commerciale qui prime sur le principe de sobriété.
**Le reste du document (tableau, filets de section, mise en évidence du total général) continue de
n'utiliser que le vert de marque**, exactement comme le prévoyait D-05 — la dérogation est strictement
scopée au badge, pas une réouverture générale de la palette du PDF.

---

## 2. Carte unique bordée avec marge intérieure généreuse

### 2.1 Faisabilité (vérifiée dans le code existant)

Réaliste et bas risque : un simple `page.drawRectangle({ borderWidth, borderColor })` sans fond,
en usant de la même primitive déjà éprouvée pour le cadre du bloc totaux (`drawTotalsBlock`, ligne
946-954) et pour les boîtes Client/Agent. Pas d'ombre portée (n'a pas de sens en PDF imprimé, déjà
acté en v1 §1.3 pour les coins arrondis — même logique ici) : seule l'idée de "carte délimitée" est
transposée, pas l'ombre.

### 2.2 Spécification

Nouvelle fonction `drawCardFrame(page)` :

- Rectangle bordure seule, `borderWidth: 0.75`, `borderColor: COLOR_BORDER_CLIENT_AGENT` (déjà
  défini, `rgb(0.75,0.75,0.75)` — réutilisation, pas de nouvelle couleur).
- Position : `x = CARD_INSET`, `y = CARD_INSET`, `width = PAGE_WIDTH - 2×CARD_INSET`,
  `height = PAGE_HEIGHT - 2×CARD_INSET`, avec **`CARD_INSET = 18`**.
- Avec `MARGIN = 40` (inchangé), l'espace visible entre le bord de la carte et le début du contenu
  réel est de `40 - 18 = 22pt` de chaque côté — le "padding généreux" demandé, sans toucher à aucune
  des coordonnées de contenu déjà calculées ailleurs dans le fichier (`MARGIN` reste la référence
  unique pour tout le contenu, `CARD_INSET` n'est utilisé que par cette fonction).
- **Appelée une fois par page** : à la création de la première page (juste avant `drawHeader`, pour
  qu'elle serve de fond visuel dès le départ), et dans la branche `addPage` de `ensureSpace` (ligne
  325), avant le texte "Facture ... (suite)" — chaque page d'une facture paginée doit avoir sa propre
  carte, pas seulement la première.
- Vérification de non-collision : le bas de la carte (`y=18`) reste largement sous le contenu le plus
  bas du footer légal (texte à `MARGIN+12=52`), aucun chevauchement possible avec
  `FOOTER_RESERVED_HEIGHT` (voir §3.3 pour son nouvel ajustement).

Aucun autre calcul de positionnement du fichier n'est affecté : `drawCardFrame` est purement
décorative, dessinée indépendamment du fil `ctx.y`.

---

## 3. Libellés de section gris + filet — généralisation

v1 utilise déjà ce motif pour "CLIENT", "AGENT COMMERCIAL" et "MODALITÉS DE RÈGLEMENT" (eyebrow
7.5pt vert gras majuscules). Cette itération l'étend à deux endroits qui n'en bénéficient pas encore,
et corrige une incohérence (un filet manquant là où un eyebrow existe déjà seul).

### 3.1 Nouvelle section "ARTICLES" au-dessus du tableau

Actuellement, le tableau des lignes produit démarre directement par sa ligne d'en-tête colorée
(`drawTableHeader`), immédiatement après les boîtes Client/Agent — rien ne le distingue comme une
section à part entière au même titre que les autres. Ajout, entre la fin de
`drawClientAgentBoxes` et l'appel à `drawTableHeader` :

- Eyebrow "ARTICLES" (7.5pt, `COLOR_GREEN_DK`, gras, majuscules), à `x = MARGIN`.
- Filet horizontal fin (`COLOR_BORDER_LIGHT`, 0.5pt), immédiatement sous le texte, largeur
  `CONTENT_WIDTH`.
- Espace de ~10pt avant le début de la ligne d'en-tête du tableau.
- Coût : ~18-20pt de hauteur fixe ajoutée une seule fois, avant la boucle des lignes — n'affecte pas
  la logique de pagination du tableau (celle-ci ne s'applique qu'à l'intérieur de la boucle).

### 3.2 Filet manquant sous "MODALITÉS DE RÈGLEMENT"

`drawMentionsLegales` (ligne 965) dessine déjà l'eyebrow vert mais **pas de filet** en dessous —
seule section du document dans ce cas. Ajout d'une `drawLine` fine (`COLOR_BORDER_LIGHT`, 0.5pt,
largeur `mentionsWidth`) immédiatement après l'eyebrow, avant le texte des modalités. Coût : ~4pt de
hauteur supplémentaire, à intégrer dans le précalcul `hauteurMentions` (§5 de v1, variable
`lignesMentions`/`hauteurMentions`) pour ne pas casser la réservation d'espace déjà correcte.

### 3.3 Nouvel eyebrow au-dessus de la bande légale bas de page

`drawLegalFooterBar` a déjà un filet (ligne 1046-1051) mais pas de libellé de section — contrairement
à toutes les autres zones du document. Ajout d'un eyebrow "COORDONNÉES & MENTIONS LÉGALES" (6.5pt,
gras, `COLOR_GREEN_DK`, majuscules) juste au-dessus du filet existant.

**Impact sur le budget d'espace réservé** : la bande légale utilisait `FOOTER_RESERVED_HEIGHT = 60`,
calibré pour filet + 2 lignes de texte. Avec l'eyebrow ajouté, ce budget doit passer à **`72`**
(marge confortable, pas un minimum strict) :

```
y = MARGIN
eyebrow  : baseline y+44   (nouveau)
filet    : y+34            (inchangé)
ligne 1  : y+22             (inchangée)
ligne 2  : y+12             (inchangée)
```

`FOOTER_RESERVED_HEIGHT` n'intervient que comme seuil de déclenchement de saut de page
(`ensureSpace`, ligne 323) — l'augmenter à 72 rend simplement les sauts de page légèrement plus
précoces (plus prudent), sans effet de bord sur les calculs du bloc totaux/mentions/signature (§5 de
v1, indépendant de cette constante).

### 3.4 Ce qui ne change pas

Le bloc totaux (§4.4 v1) garde son traitement en cadre englobant + fond pastel — c'est déjà,
fonctionnellement, un marqueur de section fort (plus fort qu'un simple filet), pas la peine de lui
ajouter un eyebrow séparé qui ferait doublon. Documenté ici pour qu'un futur agent ne l'ajoute pas
par souci de symétrie mal placé.

---

## 4. Badge "Inclus dans kit" — traitement enrichi, mais pas en pilule

### 4.1 Rappel du contenu actuel

Ligne 393-401 du code actuel : une simple mention italique grise `"(inclus dans le kit)"` sous la
désignation, sans encadré. Le brief demande un badge dans l'esprit des pilules "✓ SST" du document
de référence.

### 4.2 Décision : encadré à liséré gauche, pas une pilule

**Divergence assumée, documentée explicitement** : `docs/design-system.md` réserve strictement le
`rounded-full` (pilule) **aux badges de statut de facture** (§3.3 : *"`--radius-badge-pill` —
Badges de statut de facture uniquement"* ; §5.2 précise même, pour ce cas précis sur le web, un
badge **rectangle** `rounded-lg`, *"pas pill"*). Faire de "Inclus dans kit" une pilule sur le PDF
créerait une incohérence avec la propre règle du design system web — la forme pilule doit rester
un signal réservé au statut (§1 de ce document), pas se diluer sur un badge descriptif secondaire.

**Solution retenue** : un petit encadré à **liséré gauche coloré** (3px), motif déjà défini dans
`docs/design-system.md` §6.11 pour les *"alertes inline (bannières)"* — réutilisation d'un pattern
déjà normé plutôt qu'une invention. Évite aussi tout problème d'encodage : la coche "✓" (U+2713)
n'est **pas garantie** dans l'encodage WinAnsi des polices standard PDF utilisées ici — plutôt que
de risquer une exception `drawText` (cf. `_shared/pdf.ts`, `sanitizeForPdf`, déjà nécessaire pour
d'autres caractères spéciaux), le badge n'utilise que du texte ASCII/Latin-1 sûr.

Structure (remplace le texte italique actuel, ligne 393-401) :

- Petit rectangle, hauteur ~11pt, largeur = texte + padding.
- Remplissage `COLOR_TAG_BG` (déjà défini, neutre — cohérent avec le traitement "Inclus" du web,
  §5.2 design system : *"fond `surface-2`, texte `muted`"*, pas de couleur sémantique vive).
- Liséré gauche 2pt plein `COLOR_GREEN_DK` (le seul accent coloré du badge, discret).
- Texte "Inclus (kit)" 6.5pt gras, `COLOR_TEXT_SECONDARY`.
- Position : identique à l'actuel (sous la désignation, avant la fin des `designationLines`).

### 4.3 Ce qui est conservé sans changement

Le traitement métier — prix à 0 FCFA jamais affiché en chiffres, quantité réelle toujours éditable,
total de ligne à 0 n'entrant pas dans `total_ht` — reste strictement celui déjà spécifié en v1 et
implémenté. Seul l'habillage visuel du badge change (du texte italique nu vers l'encadré à liséré).

---

## 5. QR code de vérification — analyse de faisabilité, PAS tranché

### 5.1 Contrainte technique (pdf-lib)

Confirmé par lecture du code : `pdf-lib@1.17.1` n'a **aucune génération de QR native**. Deux voies
existent en théorie :

1. **Service externe de génération d'image QR** (ex. appel HTTP à une API tierce qui retourne un
   PNG) — **à éviter** : ajoute une dépendance réseau externe à une fonction dont le reste du code
   n'appelle déjà que Supabase Storage/DB (le seul appel réseau externe existant est le
   téléchargement du logo/photos produit **déjà uploadées par l'utilisateur**, pas un service tiers
   de génération). Introduirait un point de défaillance et une latence non maîtrisée pour un besoin
   non validé produit.
2. **Génération pure JS du motif QR, dessiné module par module via `drawRectangle`** — techniquement
   plus propre : des librairies comme `qrcode-generator` (bibliothèque autonome, sans dépendance
   native, expose juste la matrice booléenne des modules) permettraient de calculer la matrice, puis
   de la dessiner avec la **même primitive `drawRectangle` déjà éprouvée** dans ce fichier (un petit
   carré plein par module sombre) — pas d'image PNG à embarquer, cohérent avec la philosophie "pas de
   primitive non éprouvée" déjà suivie en v1 (D-03). Cette voie est **plausible** mais n'a **jamais
   été testée dans ce projet** (compatibilité de la lib avec le runtime Deno des Edge Functions à
   valider par un spike technique avant tout engagement de planning).

### 5.2 Le vrai blocage n'est pas technique, il est architectural

Même si la génération de la matrice QR fonctionne, **il n'existe aujourd'hui aucune page de
vérification publique vers laquelle pointer** : `docs/design-system.md` §1 le dit explicitement,
*"Aucun projet Next.js n'existe encore dans ce dépôt"*. Un QR de vérification n'a de sens que s'il
encode une URL (ou un endpoint) qui affiche un état de vérité (numéro, montant, statut, authenticité)
— construire ce QR avant que cette surface publique existe reviendrait à encoder une URL vers rien.

**Conclusion explicite** : le QR code visuel **n'est pas réaliste à court terme**, pas pour une
raison de librairie (probablement surmontable), mais parce que la fonctionnalité qu'il représente
(vérification publique d'une facture) n'a pas encore d'infrastructure porteuse. Ce n'est pas un
sujet purement visuel — décision produit et backend requise (créer une route/endpoint de
vérification) avant qu'un designer puisse spécifier utilement ce qu'affiche le QR.

### 5.3 Alternative simple, réaliste immédiatement (recommandée pour cette itération)

Ne pas bloquer le reste de la refonte sur ce point. À la place :

- **Le numéro de facture** (déjà existant) est mis en évidence conformément à §1.3 (police
  monospace, tag neutre) — il joue déjà, textuellement, le rôle d'identifiant unique scannable/
  copiable que le brief demande pour "un numéro de référence du document".
- Ajouter, dans la zone mentions légales ou juste sous le badge de statut (à trancher par
  `dev-backend-edge` selon l'espace disponible réel une fois §1 implémenté), une ligne de texte sobre
  optionnelle : *"Document généré électroniquement le {date} — original valable avec cachet et
  signature."* — purement informative, aucune dépendance technique nouvelle, cohérente avec le cadre
  signature déjà en place (§4.5 v1, conservé).
- **Point d'extension documenté** : si `architecte-bdd`/`dev-backend-edge` décident de construire une
  page de vérification publique (probablement au moment de l'initialisation du projet Next.js, cf.
  `docs/design-system.md` §1), revenir vers `designer-ui-ux` pour spécifier le QR à ce moment — la
  voie technique "matrice dessinée en `drawRectangle`" (§5.1 point 2) reste la recommandation de
  départ pour cette future itération.

---

## 6. Récapitulatif — prêt à coder vs nécessite une décision produit

### 6.1 Prêt à implémenter immédiatement (aucune dépendance externe, primitives déjà éprouvées)

1. Badge de statut de facture (§1) — 5 statuts atteignables + 1 défensif, couleurs = valeurs déjà
   tranchées dans `docs/design-system.md` §4.2, aucune nouvelle décision de couleur à prendre.
2. Repositionnement du bloc titre/n°/date + correction de la constante `boxTop` dans
   `drawClientAgentBoxes` (§1.3) — changement de constantes numériques, pas de nouvelle logique.
3. Numéro de facture en Courier + tag neutre (§1.3) — alignement avec une règle déjà écrite dans le
   design system, pas encore respectée dans le PDF.
4. Carte unique bordée (§2) — une fonction `drawCardFrame`, appelée deux fois (page initiale +
   branche pagination), aucun impact sur les calculs existants.
5. Eyebrow "ARTICLES" + filet (§3.1), filet manquant sous "Modalités de règlement" (§3.2), eyebrow
   "Coordonnées & mentions légales" + `FOOTER_RESERVED_HEIGHT` 60→72 (§3.3).
6. Badge "Inclus (kit)" à liséré gauche (§4) — remplace le texte italique actuel, primitives déjà
   utilisées ailleurs dans le fichier (rectangle + petit rectangle liséré).

### 6.2 Nécessite une décision produit avant tout code (hors périmètre de cette spécification)

7. **QR code de vérification (§5)** — non bloquant pour le reste de cette refonte. Nécessite : (a)
   une décision produit sur l'existence et le contenu d'une page de vérification publique, (b) le
   démarrage effectif du projet Next.js (`docs/design-system.md` §1), (c) un spike technique de
   validation de la librairie de génération de matrice QR dans le runtime Deno des Edge Functions.
   L'alternative textuelle (§5.3) peut être livrée dès maintenant sans aucune de ces trois
   conditions.

---

## 7. Cas de test QA à ajouter (`qa-testeur`) — en complément de v1 §7

1. **Chacun des 5 statuts atteignables** (`proforma, validee, payee_partielle, payee, annulee`) :
   badge affiché avec le bon libellé et la bonne couleur (§1.2), sans chevaucher le titre statut
   16pt vert juste en dessous, ni le N°/date.
2. **Statut `payee_partielle`** (libellé le plus long, "PAYÉE PARTIELLE") : tient sur une seule ligne
   dans la boîte de 120pt de large, ne déborde pas du cadre.
3. **Facture paginée sur 2+ pages** (>15 lignes produit, cf. v1 cas de test 3) : la carte bordée
   (§2) apparaît sur **chaque** page générée, pas seulement la première.
4. **Facture avec `notes` renseignées ET la nouvelle bordure sous "Modalités de règlement"** : le
   filet ajouté (§3.2) ne doit pas décaler le point d'ancrage `yFooterTop` de façon à faire chevaucher
   à nouveau mentions/signature (non-régression du fix v1 §5 — vérifier que le filet est bien inclus
   dans `hauteurMentions`/`lignesMentions`).
5. **Ligne produit `inclus_dans_kit`** : badge à liséré gauche visible, lisible, ne chevauche pas la
   ligne de séparation du tableau en dessous même si `rowHeight` est la valeur minimale (36pt).
6. **Bande légale bas de page** avec le nouvel eyebrow (§3.3) : les 2 lignes de contenu
   (entreprise/banque) restent complètes et lisibles dans le nouveau budget de 72pt, aucun texte
   tronqué ni superposé au filet.
7. **Non-régression complète des 8 cas de test de v1 §7** — cette itération ne doit rien casser du
   fix de positionnement dynamique (§5 de v1), qui reste la logique d'ancrage de référence.

---

## 8. Handoff

**Prêt pour reprise par `dev-backend-edge`** pour les points §6.1 (1 à 6) — modification de
`supabase/functions/generer-facture-pdf/index.ts` uniquement, `_shared/pdf.ts` reste inchangé (aucun
nouveau helper requis : tout se construit avec `drawRectangle`/`drawLine`/`drawText` déjà en usage).

**Non tranché, à remonter au produit avant tout code** : le QR de vérification (§5, point 7 de
§6.2). Ce point ne doit **pas** retarder l'implémentation des points 1 à 6 ci-dessus, qui sont
indépendants et livrables immédiatement.

Toute question non couverte par ce document, par v1 (`docs/facture-pdf-design.md`) ou par le journal
`docs/design-system.md` §10 doit remonter à `designer-ui-ux` avant d'être tranchée dans le code —
même principe de gouvernance que les deux documents de référence.
