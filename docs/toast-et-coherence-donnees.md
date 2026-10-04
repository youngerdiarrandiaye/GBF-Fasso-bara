# GFB-STOCK — Système de Toasts & Garanties de cohérence des données

Statut : **spécification prête pour reprise par `dev-frontend-agent` / `dev-frontend-admin`.**
Auteur : `designer-ui-ux` (agent). Complète `docs/design-system.md` (référence unique de vérité
visuelle) sans dupliquer ses tokens — ce document référence `design-system/tokens.css` et
`design-system/tailwind.tokens.js` tels quels, n'en recrée aucun.

Déclencheur : hydration mismatch React confirmé en log serveur sur `components/ui/Toast.tsx`
(`typeof document !== "undefined" && createPortal(...)`). Ce document (1) diagnostique précisément
la cause, (2) impose une structure corrigée, (3) spécifie exhaustivement le comportement des 4
types de toasts, et (4) fixe les garanties de cohérence des données à l'écran pour les 3 écrans les
plus sensibles (stock, paiement, facturation), avec un état des lieux du code existant (conforme ou
à corriger) constaté à la lecture de `lib/actions/*.ts` et des composants `components/agent/*` /
`components/admin/*` au moment de la rédaction.

**`components/ui/Toast.tsx` est un composant partagé, utilisé à la fois par l'Espace Admin et
l'Espace Agent** (`ToastProvider` doit englober les deux layouts racine). Toute correction ci-dessous
ne se code **qu'une seule fois**, dans ce fichier unique — ne jamais dupliquer un second système de
toasts propre à un espace.

## Sommaire

1. [Principe directeur](#1-principe-directeur)
2. [Diagnostic du bug d'hydratation](#2-diagnostic-du-bug-dhydratation)
3. [Spécification du composant Toast](#3-spécification-du-composant-toast)
4. [Garanties de cohérence des données (règles transversales)](#4-garanties-de-cohérence-des-données-règles-transversales)
5. [Fiches par écran sensible](#5-fiches-par-écran-sensible)
6. [Anomalies constatées à corriger](#6-anomalies-constatées-à-corriger)
7. [Checklist de recette](#7-checklist-de-recette)
8. [Handoff](#8-handoff)

---

## 1. Principe directeur

> « Ne construis pas des écrans ; construis un système où l'utilisateur fait confiance à ce qu'il
> voit sans jamais vérifier deux fois. »

Trois conséquences concrètes, non négociables, pour tout ce qui suit :

1. **Un toast n'est jamais une promesse, toujours un constat.** Il ne peut apparaître qu'après
   confirmation serveur réelle (réponse d'une Server Action / d'un trigger SQL déjà exécuté) —
   jamais avant, jamais "en optimiste" sur une action touchant stock, paiement ou validation.
2. **Un toast et l'écran qu'il commente doivent raconter exactement la même histoire, au même
   instant.** Si le texte dit "stock mis à jour" et que le tableau encore visible affiche l'ancienne
   quantité — ne serait-ce que pendant une fraction de seconde perceptible — c'est un bug de
   cohérence prioritaire absolu, à traiter avant tout défaut esthétique.
3. **Un toast nomme toujours l'objet concerné.** Jamais "Enregistré avec succès" seul : toujours le
   numéro de facture, le nom du produit, le montant formaté — l'utilisateur doit pouvoir vérifier
   l'information sans avoir à deviner à quoi elle se rapporte.

---

## 2. Diagnostic du bug d'hydratation

### 2.1 Code actuel (fautif)

```tsx
// components/ui/Toast.tsx, ligne 55-56 (extrait)
{typeof document !== "undefined" &&
  createPortal(<div>...</div>, document.body)}
```

### 2.2 Pourquoi ça casse précisément

Le rendu React qui sert à l'hydratation se déroule en deux temps :

1. **Serveur** : `typeof document` y est toujours `"undefined"` → la condition vaut `false` → rien
   n'est rendu à cet endroit de l'arbre.
2. **Client, tout premier rendu (celui utilisé par React pour comparer à l'HTML serveur avant de
   "prendre la main")** : ce rendu s'exécute **dans le navigateur**, où `document` existe déjà de
   façon synchrone, avant même qu'un seul `useEffect` n'ait eu la moindre chance de s'exécuter. La
   condition `typeof document !== "undefined"` y vaut donc immédiatement `true`, et
   `createPortal(...)` est appelé dès ce premier rendu.

Résultat : le rendu comparé côté serveur (`false`, rien) et le rendu comparé côté client au moment de
l'hydratation (`true`, un portail entier) **diffèrent structurellement au même point de l'arbre**,
avant même que quoi que ce soit ne soit monté. C'est exactement le anti-pattern documenté par React
("do not use `typeof window` / `typeof document` directly dans le JSX rendu") — la détection
d'environnement est évaluée **pendant le rendu**, alors qu'elle doit être déduite du **cycle de vie**
(monté / pas monté), qui lui seul garantit que la divergence n'apparaît qu'*après* l'hydratation.

### 2.3 Le correctif imposé — un drapeau d'état, jamais une détection d'environnement

```tsx
const [portalReady, setPortalReady] = useState(false); // identique serveur ET 1er rendu client
useEffect(() => {
  setPortalReady(true); // ne s'exécute JAMAIS pendant le rendu comparé par l'hydratation
}, []);

// ...
{portalReady ? createPortal(<ToastViewport ... />, document.body) : null}
```

Pourquoi ceci élimine le bug, précisément :

- `useState(false)` retourne **la même valeur initiale quel que soit l'environnement** — serveur et
  premier rendu client affichent tous les deux `null` à cet endroit. Le rendu comparé par
  l'hydratation est donc **identique des deux côtés** : aucune divergence possible.
- `useEffect` ne s'exécute, par construction de React, **qu'après le commit** — jamais pendant le
  rendu utilisé pour l'hydratation. Le passage de `portalReady` à `true` déclenche un second rendu,
  strictement post-hydratation, qui n'est **plus jamais comparé** à quoi que ce soit issu du serveur.
- Le point d'ancrage du portail reste **au même endroit de l'arbre React** sur les deux passes ; seul
  le contenu qu'il projette bascule de `null` à un vrai nœud DOM, et ce basculement est piloté par le
  cycle de vie React, jamais par une inspection d'environnement en plein rendu.

**Point de vigilance supplémentaire (à vérifier par `dev-frontend-agent`/`dev-frontend-admin` lors
de l'implémentation) :** `counter.current` et tout `Date.now()`/`Math.random()` utilisés pour générer
un `id` de toast doivent rester dans un gestionnaire d'événement ou un effet — jamais calculés en
plein rendu — pour la même raison (valeur potentiellement différente entre rendu serveur et premier
rendu client). Le composant actuel utilise déjà `useRef` + incrémentation dans un `useCallback`
déclenché par une action utilisateur : ce point est **déjà conforme**, ne pas y toucher.

Une alternative plus "lourde" (réserver un `<div id="toast-root" />` statique dans le HTML rendu par
le layout racine, puis le récupérer par `document.getElementById` dans un effet) est également valide
sur le plan technique, mais introduit une dépendance entre `Toast.tsx` et les deux fichiers de layout
(`app/(admin)/layout.tsx`, `app/(agent)/layout.tsx`). Le correctif au drapeau d'état ci-dessus est
**celui retenu**, car il reste entièrement contenu dans `components/ui/Toast.tsx` — un seul fichier
à corriger pour les deux espaces, conformément à la contrainte de composant partagé.

---

## 3. Spécification du composant Toast

### 3.1 API du contexte (`useToast`)

```ts
type ToastVariant = "success" | "warning" | "error" | "info";

interface ShowToastOptions {
  /** Empêche l'auto-dismiss même sur une variante qui s'auto-ferme normalement
   *  (usage réservé : "info" tant qu'un état reste actif — ex. perte réseau). */
  persistent?: boolean;
  /** Clé stable : un second appel avec la même clé REMPLACE le toast existant
   *  au lieu d'en empiler un nouveau (ex. "connexion-reseau" : le toast "Connexion perdue"
   *  se transforme en "Connexion rétablie" au lieu de s'additionner). */
  key?: string;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant, options?: ShowToastOptions) => string; // retourne l'id
  dismissToast: (idOrKey: string) => void;
}
```

`options` et `dismissToast` sont des **ajouts** à l'API actuelle (`showToast(message, variant)`
seul) — nécessaires pour couvrir la règle INFO "reste affiché tant que non résolu" (§3.4) et pour
permettre à un écran de fermer explicitement un toast qu'il a lui-même déclenché (ex. reconnexion
réseau détectée).

### 3.2 Structure DOM stable (fix hydratation) — voir détail §2.3

Rappel synthétique de l'invariant à respecter dans l'implémentation :

- Le drapeau qui décide si le portail est projeté doit être un `useState` initialisé à une valeur
  fixe (`false`), jamais dérivé d'une détection d'environnement.
- Ce drapeau ne passe à `true` que dans un `useEffect` sans dépendances (montage).
- Le conteneur de toasts (`ToastViewport`) lui-même peut toujours être **vide** (`toasts.length === 0`)
  sans que cela pose de problème — un conteneur vide et invisible (`aria-live` région présente mais
  sans enfant) est un état parfaitement stable et silencieux, à la différence de son *absence
  conditionnelle au rendu*, qui est la source du bug.

### 3.3 Position & responsive

| Contexte | Ancrage | Classes cibles (guidance) | Empilement |
|---|---|---|---|
| **Admin**, toutes largeurs | Coin **supérieur droit**, sous la Topbar (`h-16` = 64px) | `fixed top-20 right-4 z-toast w-96 flex flex-col-reverse gap-2` | Nouveau toast entre en haut de la pile (le plus proche du coin), les précédents descendent. |
| **Agent**, `≥ 640px` (tablette/desktop, cf. breakpoint `sm` des tokens) | Coin **supérieur droit**, sous la Navbar (`h-16`) — **aligné sur la règle générale** | `sm:top-20 sm:right-4 sm:w-96 sm:flex-col-reverse` | Idem Admin. |
| **Agent**, `< 640px` (mobile terrain) | **Bas d'écran**, au-dessus de la `BottomTabBar` — **exception documentée, conservée** | `inset-x-4 bottom-20 flex flex-col gap-2` | Nouveau toast entre en bas de la pile (le plus proche du pouce/de la dernière action), les précédents remontent. |

**Décision D-Toast-01 (mobile Agent = exception au "coin supérieur droit").** Le brief demande une
position générale en coin supérieur droit, en laissant à `designer-ui-ux` le soin de trancher pour
mobile Agent. Décision : **conserver le bas d'écran sur mobile Agent (`< 640px`)**, ne pas aligner
sur le coin supérieur haut, pour trois raisons vérifiées sur le layout réel :

1. `NavBar` (Agent) et `Topbar` (Admin) sont toutes deux `sticky top-0` avec un bouton avatar
   circulaire en haut-droite (`components/agent/NavBar.tsx`, `components/admin/Topbar.tsx`) — un
   toast en haut-droite sur un écran `xs` (360px, plus petit mobile terrain supporté) chevaucherait
   ce bouton et son menu déroulant.
2. Sur `NouvelleFactureForm.tsx`, les boutons d'action ("Enregistrer en brouillon", "Valider...")
   sont dans une barre **sticky en bas d'écran** (`sticky bottom-16 ... md:bottom-0`). Un toast qui
   confirme le résultat de CETTE action doit apparaître **près du point d'action**, pas à l'opposé de
   l'écran où l'œil devrait se déplacer volontairement — c'est un renfort direct de la règle "un
   toast doit être vérifiable immédiatement à l'écran" (§1, règle 2).
3. La `BottomTabBar` (Agent mobile) est `fixed bottom-0`, avec un bouton flottant "Nouvelle facture"
   qui dépasse encore plus haut (`-mt-6`) — la position actuelle `bottom-20` (80px) a déjà été choisie
   pour dégager cette zone ; elle est **ratifiée telle quelle**, aucun changement de valeur numérique
   requis, seulement une confirmation qu'elle reste la référence documentée (avant cette
   spécification, ce choix n'était formalisé nulle part).

Au-delà de `640px` (tablette paysage/desktop Agent), la contrainte de portée du pouce ne s'applique
plus de la même façon : aligner sur la règle générale (coin supérieur droit) réduit l'écart de
comportement entre les deux espaces sans justification suffisante pour le maintenir.

**Point de vigilance mineur (non bloquant) :** en coin supérieur droit, la cloche d'alertes
(`AlertsBell`, menu `w-80`) et le menu utilisateur (`w-56`) s'ouvrent eux aussi près du même coin, en
`z-dropdown` (20), sous le toast (`z-toast` = 60). Un toast affiché pendant qu'un de ces menus est
ouvert le recouvrira visuellement — acceptable car transitoire (toasts succès/info/warning
s'auto-ferment) ; pour un toast d'erreur (persistant), l'utilisateur reste libre de le fermer
manuellement pour dégager le menu dessous. Aucune action corrective requise, simplement documenté
pour ne pas être re-découvert comme "bug" en recette.

### 3.4 Timing & comportement par variante

| Variante | Couleur / icône | Auto-dismiss | Condition de fermeture manuelle |
|---|---|---|---|
| **Succès** | Vert · icône **check** (`✓`) | **4000 ms** | Toujours possible (bouton ×) |
| **Attention** (warning) | Ambre · icône **triangle** (`▲`) | **5000 ms** (volontairement plus long que succès — le message est un signal à retenir, pas une simple confirmation) | Toujours possible |
| **Erreur** | Rouge · icône **croix** (`✕`) — *correction requise, voir §6* | **Aucun** — reste affiché jusqu'à fermeture manuelle explicite. Ne s'applique qu'aux erreurs qui bloquent une action métier (stock insuffisant, échec de validation/paiement/ajustement) — pas aux simples soucis de saisie déjà signalés par un message de champ (`InlineAlert`/erreur de formulaire), qui n'ont pas besoin d'un toast en plus. | Bouton × obligatoire, toujours visible |
| **Info** | Bleu · icône **i** | **4000 ms**, **sauf** si l'état signalé reste actif (`persistent: true`) — alors reste affiché tant que l'état n'est pas résolu, et doit être fermé/replacé **par le code** dès que l'état se résout (ex. reconnexion réseau détectée → `dismissToast("connexion-reseau")` ou remplacement par un toast succès bref via le même `key`) | Toujours possible manuellement en plus |

Règle transversale de contenu : **toute variante doit nommer l'objet concerné** — numéro de facture
(`FP20260803001`), nom de produit, montant déjà formaté (`formatMontant()`, jamais un nombre brut).

Exemples conformes (repris/complétés du brief) :

- Succès : `Facture FP20260803001 validée — stock mis à jour.`
- Succès : `Paiement de 50 000 FCFA enregistré — facture FP20260803001.`
- Attention : `Stock du Spray Tube HYB1-3 sous le seuil (5 restants).`
- Attention : `Facture enregistrée en brouillon — non encore validée.`
- Erreur : `Stock insuffisant pour SV1 : 3 disponibles, 5 demandés.` (identifie la ligne en cause)
- Erreur : `Impossible de valider cette facture (elle a peut-être déjà été traitée par ailleurs, ou ne vous appartient pas).`
- Info : `Facture proforma FP20260701004 expire dans 3 jours.`
- Info persistant : `Connexion perdue — les actions de facturation restent bloquées jusqu'au rétablissement.`

Exemples **non conformes**, à ne jamais produire : `"Succès"`, `"Une erreur est survenue"`,
`"Opération effectuée"`, `"Paiement de ${montant} FCFA enregistré"` où `montant` est un nombre brut
JavaScript non formaté (perd le séparateur de milliers, viole §5.5 de `docs/design-system.md`).

### 3.5 Anti-optimistic UI — règle absolue

**Aucun `showToast` de succès ne doit être appelé avant que la Server Action ait retourné une donnée
confirmée par le serveur.** Concrètement : le seul endroit légitime pour appeler `showToast(...,
"success")` est **après** un `await` sur l'action serveur, à l'intérieur du bloc qui vérifie que
`result.error` est absent ET que `result.data` est présent — jamais avant l'appel, jamais dans un
gestionnaire de clic qui met à jour l'état local en supposant que le serveur va confirmer.

Ce point est **déjà respecté** dans le code lu à ce jour (`NouvelleFactureForm.tsx`,
`PaymentModal.tsx`, `StockAdjustModal.tsx` : le toast est systématiquement à l'intérieur du bloc
post-`await`, après vérification de `result.error`/`resultat.error`). Ce document formalise la règle
pour qu'elle survive aux prochains écrans, et sert de critère de revue de code explicite : **tout
nouvel écran touchant stock/paiement/validation doit suivre exactement ce patron**, jamais de
variante "je mets à jour l'UI tout de suite et je corrige si le serveur refuse".

### 3.6 Accessibilité

- Toast succès/attention/info : `role="status"`, `aria-live="polite"`.
- Toast erreur : `role="alert"`, `aria-live="assertive"` (déjà en place dans le code actuel — à
  conserver).
- Bouton de fermeture : toujours `aria-label="Fermer la notification"`, cible tactile ≥ 44px sur
  Espace Agent (actuellement plus petit visuellement — vérifier la zone cliquable réelle, pas
  seulement l'icône visible, cf. `--tap-target-min`).
- Le texte du toast ne doit jamais être la SEULE source de l'information : pour les erreurs
  bloquantes qui désignent une ligne de facture (ex. rupture de stock sur une ligne), la ligne
  elle-même doit aussi porter un état visuel (bordure rouge, message inline) — le toast complète,
  ne remplace jamais l'état inline (cf. `ligneEnErreur` déjà utilisé dans `NouvelleFactureForm.tsx`,
  patron à conserver).

### 3.7 Style visuel — tokens réutilisés, aucun nouveau token

- Fond pastel : classes `badge-pastel-{green,amber,red,blue}` déjà définies dans `app/globals.css`
  (formule `color-mix(in srgb, var(--color-*) 15%, var(--color-surface))`, documentée
  `docs/design-system.md` §6.3) — **réutilisées telles quelles**, ne pas recréer une variante propre
  aux toasts.
- `z-index` : `var(--z-toast)` = 60 (déjà défini dans `design-system/tokens.css`).
- Rayon : **`rounded-2xl` (16px, `--radius-modal`)** — *décision explicite, voir D-Toast-02
  ci-dessous*, pas `rounded-lg` (8px) actuellement utilisé (`rounded-input`) dans le composant.
- Ombre : `shadow-lg` (déjà en place).
- Animation d'entrée : `animate-toast-in` (déjà défini dans `design-system/tailwind.tokens.js`,
  `fade + translateY(8px)→0`, 200ms `--ease-standard`) — inchangé.
- Icône : cercle 20px (`h-5 w-5`), couleur héritée du texte pastel de la variante — voir correction
  d'icône erreur en §6.

**Décision D-Toast-02 (rayon des toasts = `rounded-2xl`, pas `rounded-lg`).** Le tableau de radius de
`docs/design-system.md` §3.3 ne mentionnait explicitement que "modals" pour `rounded-2xl` ; le
composant actuel utilise `rounded-input` (8px). Le présent brief regroupe explicitement
"modals/toasts" sous `rounded-2xl` — décision : **aligner les toasts sur `rounded-modal` (16px)**,
cohérent avec le fait qu'un toast, comme un modal, est un élément flottant au-dessus du contenu de
page (z-index élevé), par opposition aux inputs/badges qui sont incrustés dans le flux normal. Cette
décision doit être répercutée dans `docs/design-system.md` §3.3 et §6.7 (fait, voir modifications
apportées à ce fichier en parallèle de la présente spécification).

---

## 4. Garanties de cohérence des données (règles transversales)

Ces règles priment sur toute considération esthétique. Chacune est reliée à son état constaté dans
le code actuel (conforme à préserver, ou à corriger).

**a) Jamais d'écran vide en chargement ; bouton d'action → `disabled` + spinner pendant l'appel
serveur.**
État constaté : **conforme**. Le composant `Button` (`components/ui/Button.tsx`) désactive
intrinsèquement le bouton dès que `loading` est vrai (`disabled={disabled || loading}`,
`aria-busy={loading}`) — impossible de double-cliquer un bouton en cours de chargement, quel que soit
l'écran qui l'utilise. C'est le patron de référence à ne jamais contourner (ex. ne jamais mettre
`loading` sur un `<span>` custom sans repasser par ce composant).

**b) Pas d'optimistic UI sur validation facture / paiement / ajustement stock.**
État constaté : **conforme** (voir §3.5). Règle formalisée pour les prochains écrans.

**c) Synchronisation temps réel Agent↔Admin via Supabase Realtime — aucune donnée de stock
périmée de plus de quelques secondes.**
État constaté : **partiellement conforme**.
- Côté Admin : `components/admin/RealtimeRevalidate.tsx` s'abonne à `postgres_changes` sur les
  tables passées en prop et déclenche `router.refresh()` (debounce 400ms) — utilisé sur les pages
  Admin pour refléter en direct les factures créées côté Agent. `components/admin/AlertsBell.tsx`
  s'abonne en direct à `alertes_stock` (INSERT/UPDATE) et déclenche lui-même un `showToast` dès
  qu'une alerte est insérée par le trigger SQL — **ce déclenchement est conforme à la règle
  anti-optimiste** puisqu'il réagit à une écriture serveur déjà committée, jamais anticipée.
- Côté Agent, écran **Nouvelle facture** : **aucun abonnement Realtime constaté** sur la table
  `produits`. Le stock affiché sur une ligne déjà ajoutée (`stock_disponible`, capturé une seule fois
  au moment de `ajouterProduit()` dans `NouvelleFactureForm.tsx`) reste figé pendant toute la
  composition de la facture — si un autre agent vide le stock d'un produit pendant que la facture est
  en cours de rédaction, rien ne le signale avant la tentative de validation (le blocage réel arrive
  alors côté serveur, sans confort visuel préalable). **Gap identifié**, voir §5.1 et §6.

**d) Un même montant affiché à deux endroits doit toujours provenir de la même source serveur,
jamais recalculé indépendamment.**
État constaté : **conforme, mais fragile**. `app/(admin)/admin/paiements/page.tsx` et
`app/(admin)/admin/factures/[id]/page.tsx` calculent tous les deux le "reste à payer" avec
exactement la même formule (`Math.max(0, total_general - somme(paiements.montant))`), à partir des
mêmes colonnes (`factures.total_general`, `paiements.montant`) — aucun écart constaté aujourd'hui.
Le calcul est cependant dupliqué **textuellement** dans deux fichiers plutôt qu'extrait dans une
fonction unique partagée (ex. `lib/format.ts` ou `lib/facture-calculs.ts`) : recommandation
(non-bloquante, garde-fou de cohérence future) — extraire cette formule dans une seule fonction
utilitaire importée aux deux endroits, pour qu'une évolution future (ex. gestion d'un escompte) ne
puisse pas diverger silencieusement entre les deux écrans.

**e) États vides toujours avec message + action claire ; donnée nulle par design ("inclus dans un
kit") jamais affichée "0 FCFA" nu.**
Déjà spécifié en détail dans `docs/design-system.md` §5.2 (badge "Inclus") et §6.8/§9 (skeletons,
listes vides) — pas de redondance ici, ce document ne fait que confirmer qu'aucune dérogation n'est
tolérée sur les 3 écrans sensibles étudiés en §5.

**f) Perte de connexion réseau : bandeau discret mais visible ; aucune action de facturation
annoncée réussie tant que la connexion n'est pas rétablie et confirmée par le serveur.**
État constaté : **non implémenté à ce jour** (aucun composant de bandeau réseau ni détection
`navigator.onLine`/heartbeat trouvé dans le code lu). Spécification pour l'implémentation à venir :
- Un bandeau fin, non bloquant, en haut de la zone de contenu (sous la Navbar/Topbar, au-dessus du
  reste de la page), fond `amber` pastel, texte "Connexion perdue — vérification en cours...",
  apparaît dès la détection d'une perte de connexion (événement `offline` navigateur **et** échec
  d'appel réseau, pas l'un sans l'autre — un simple événement `offline` du navigateur peut être un
  faux positif sur certains réseaux mobiles).
- Pendant que le bandeau est visible, **tout bouton d'action de facturation/paiement/stock doit
  rester désactivable dès l'échec réel d'une requête** (pas nécessairement avant, l'utilisateur peut
  tenter une action qui échouera proprement et affichera un toast d'erreur explicite plutôt qu'un
  blocage préventif agressif) — mais **aucun toast de succès ne doit jamais être affiché tant que la
  requête correspondante n'a pas reçu une réponse serveur positive**, ce qui découle directement de
  la règle anti-optimiste (§3.5) : elle couvre déjà ce cas sans règle supplémentaire à coder.
- Dès la reconnexion confirmée (`navigator.onLine` redevient vrai **et** un ping/health-check léger
  réussit), le bandeau passe brièvement au vert ("Connexion rétablie") puis disparaît après ~2s — ce
  comportement est le cas d'usage canonique du toast **info persistant à clé stable** (§3.1, `key:
  "connexion-reseau"`) : `showToast("Connexion perdue...", "info", { persistent: true, key:
  "connexion-reseau" })` puis, à la reconnexion, soit `dismissToast("connexion-reseau")`, soit un
  second `showToast("Connexion rétablie.", "success", { key: "connexion-reseau" })` qui remplace le
  précédent au lieu de l'empiler.

---

## 5. Fiches par écran sensible

### 5.1 Nouvelle facture (Agent) — `app/(agent)/nouvelle-facture/`, `NouvelleFactureForm.tsx`

**Sources de données actuelles :**
- Client sélectionné : `ClientAutocomplete` (requête Supabase directe côté client à la frappe).
- Résultats de recherche produit (`ProduitAutocomplete.tsx`) : requête Supabase directe, fraîche à
  chaque frappe (debounce 200ms) sur `produits` — fiable **au moment de la recherche**.
- Ligne de facture (`lignes` state) : à l'ajout, capture un **instantané** du produit
  (`stock_disponible: produit.quantite_stock`), qui **ne se remet plus à jour automatiquement**
  pendant la composition (cf. §4c, gap identifié).
- Totaux (`totalHT`, `montantTva`, `totalGeneral`) : calculés côté client à partir des `lignes` en
  mémoire — c'est acceptable ici car ce sont des valeurs **provisoires, jamais affichées comme
  définitives ailleurs** ; le serveur ne recalcule et ne fige les totaux qu'à l'enregistrement
  (`enregistrerBrouillon`), et c'est cette version serveur qui fait foi partout ailleurs (liste des
  factures, détail Admin) — pas de double source pour la même donnée "figée".

**Quand un toast peut apparaître :**
- Succès uniquement après retour positif de `enregistrerBrouillon` ou `validerFacture` (déjà
  conforme, §3.5) — jamais au moment du clic.
- Erreur : persistant, désigne la ligne en cause via `ligneEnErreur` (déjà conforme) — ex. rupture de
  stock détectée par le trigger serveur au moment de la validation.
- **Manque actuel** : aucun toast "Attention" ne prévient l'agent qu'un produit déjà ajouté à sa
  facture a vu son stock changer **pendant qu'il compose** (ex. un autre agent vient de valider une
  facture qui vide le même produit). Recommandation d'implémentation (non codée ici, à la charge de
  `dev-frontend-agent`) : abonnement Realtime `postgres_changes` (`UPDATE` sur `produits`, filtré aux
  `produit_id` présents dans `lignes`) déclenchant (1) une mise à jour du `stock_disponible` affiché
  sur la ligne concernée, (2) un toast "Attention" nommant le produit ("Le stock de Spray Tube
  HYB1-3 a changé pendant votre saisie : 2 restants."), et (3) un état visuel bref (ex. léger flash
  ambre) sur la jauge/le badge de la ligne concernée pour que le changement soit repéré même sans
  lire le toast.

**Quand un état "en cours" doit bloquer l'action :**
`actionEnCours` (`"brouillon" | "proforma" | "validee" | null`) désactive les **trois** boutons dès
qu'une action est lancée (`disabled={actionEnCours !== null}`, déjà conforme) — empêche qu'un agent
clique "Valider" pendant qu'un "Enregistrer en brouillon" est encore en vol, ce qui aurait pu créer
une facture en double ou une incohérence de statut. Ce patron (un seul état d'action partagé par
plusieurs boutons mutuellement exclusifs) est le **modèle de référence** pour tout futur écran ayant
plusieurs actions serveur concurrentes possibles sur le même objet.

### 5.2 Enregistrer un paiement (Admin) — `components/admin/PaymentModal.tsx`, `lib/actions/paiements.ts`

**Sources de données :**
- `resteAPayer` (prop passée au modal) : calculé une seule fois par la page appelante
  (`total_general - somme(paiements)`), **pas recalculé dans le modal** — le modal se contente
  d'afficher cette valeur en indication (`hint`), jamais de la recalculer lui-même. Conforme à la
  règle 4d.
- Le **statut de la facture** (`validee → payee_partielle → payee`) n'est **jamais** recalculé ni
  écrit par cette Server Action — c'est le trigger SQL `appliquer_paiement()` qui s'en charge à
  l'INSERT dans `paiements` (commentaire explicite dans `lib/actions/paiements.ts`). C'est **exactement**
  la garantie recherchée par la règle 4d : une seule source de vérité serveur pour un état qui
  apparaît à plusieurs endroits (badge de statut sur la liste des factures, sur le détail facture, sur
  la liste des paiements).

**Quand un toast peut apparaître :** uniquement après retour positif de `enregistrerPaiement` (déjà
conforme). **Deux corrections de contenu requises** (voir détail §6) :
1. Le montant doit être formaté via `formatMontant()` (séparateur de milliers), jamais interpolé brut.
2. Le toast doit nommer la facture concernée (numéro), pas seulement le montant — indispensable car
   ce modal est ouvert depuis une **liste** de plusieurs factures (`/admin/paiements`), où un toast
   générique ne permet pas de savoir, sans re-scanner tout le tableau, laquelle vient d'être mise à
   jour.

**Quand un état "en cours" doit bloquer l'action :** `isSubmitting` (React Hook Form) désactive le
bouton "Enregistrer le paiement" pendant l'appel serveur — conforme. **Point d'attention sur
l'ordonnancement** (à corriger, voir §6) : la séquence actuelle est `showToast(...)` → `reset()` →
`onClose()` → `router.refresh()`. Le modal se ferme et révèle la page sous-jacente **avant** que
`router.refresh()` n'ait fini de rapatrier les données serveur fraîches — fenêtre courte mais réelle
où la ligne du tableau "Paiements" peut encore afficher l'ancien "Reste à payer" pendant que le toast
affiche déjà "Paiement enregistré". Recommandation : ne fermer le modal (et n'afficher le toast) que
lorsque le rafraîchissement est acquis — par exemple en pilotant `router.refresh()` via
`startTransition` et en gardant le bouton en état `loading`/le modal ouvert jusqu'à ce que la
transition associée retombe (`isPending` à `false`), au lieu de considérer l'action terminée dès la
réponse de la Server Action seule.

### 5.3 Ajustement de stock (Admin) — `components/admin/StockAdjustModal.tsx`, `lib/actions/produits.ts`

**Sources de données :**
- `produit.quantite_stock` (valeur "avant") vient des props passées par la page serveur qui a ouvert
  le modal — pas d'appel supplémentaire dans le modal pour la relire.
- Le motif de l'ajustement (texte libre, ≥ 5 caractères) est **obligatoire** avant activation du
  bouton de confirmation (`motifValide`) — conforme à `docs/design-system.md` §6.6.
- Le mouvement de stock (`mouvements_stock`, `type = 'ajustement'`) est créé automatiquement par le
  trigger SQL dès l'`UPDATE` de `quantite_stock` ; l'action serveur fait un second `UPDATE` ciblé pour
  y injecter le motif réel saisi par l'admin (le trigger ne connaît qu'un texte générique) — c'est une
  correction de métadonnée sur une ligne déjà créée, **pas** une duplication d'écriture. Bon patron à
  préserver tel quel.

**Quand un toast peut apparaître :** uniquement après retour positif de `ajusterStock` (conforme). Le
texte actuel nomme déjà le produit et la transition de quantité (`"Stock de \"X\" ajusté : 12 → 5
pièces."`) — **conforme à la règle "toujours nommer l'objet concerné"**, à conserver tel quel comme
référence de bonne rédaction.

**Quand un état "en cours" doit bloquer l'action :** `enCours` désactive le bouton de confirmation
pendant l'appel — conforme, mais avec la **même fenêtre de risque d'ordonnancement** qu'en §5.2
(`showToast` → `onClose()` → `router.refresh()`) : la fiche produit affichée derrière la modale (avec
sa jauge de stock) peut être vue, l'espace d'un instant, avec l'ancienne quantité pendant que le
toast annonce déjà la nouvelle. Même recommandation qu'en §5.2 : ne fermer/annoncer qu'une fois le
rafraîchissement des données de la page confirmé, pas seulement la Server Action.

---

## 6. Anomalies constatées à corriger

Récapitulatif actionnable, classé par fichier, pour `dev-frontend-agent`/`dev-frontend-admin` :

| # | Fichier | Anomalie | Correction attendue |
|---|---|---|---|
| 1 | `components/ui/Toast.tsx` | Hydration mismatch (`typeof document !== "undefined" && createPortal(...)`) | Remplacer par un drapeau d'état `useState(false)` basculé dans un `useEffect` de montage — voir §2.3, structure exacte imposée. Composant **partagé**, une seule correction pour les deux espaces. |
| 2 | `components/ui/Toast.tsx` | Icône d'erreur actuelle = `"!"` (point d'exclamation) | Remplacer par une croix (`✕`), conformément au brief ("icône croix") et pour se distinguer visuellement du triangle d'avertissement. |
| 3 | `components/ui/Toast.tsx` | Rayon actuel `rounded-input` (8px) | Passer à `rounded-modal` (16px) — décision D-Toast-02, §3.7. |
| 4 | `components/ui/Toast.tsx` | Timing uniforme 4000ms pour tout sauf erreur ; pas de variante "persistent" | Ajouter la distinction warning = 5000ms (§3.4), et l'option `persistent`/`key` à l'API du contexte (§3.1). |
| 5 | `components/ui/Toast.tsx` | Position mobile Agent conservée, mais position ≥640px encore en bas-droite | Passer `sm:` en haut-droite (`sm:top-20 sm:right-4 sm:flex-col-reverse`), garder `<sm` inchangé (§3.3, D-Toast-01). |
| 6 | `components/admin/PaymentModal.tsx` | Toast `"Paiement de ${values.montant} FCFA enregistré."` — montant brut, pas de séparateur de milliers | Utiliser `formatMontant(values.montant)` (déjà importé/disponible via `lib/format.ts`). |
| 7 | `components/admin/PaymentModal.tsx` + `components/admin/RegisterPaymentButton.tsx` | Aucun numéro de facture transmis jusqu'au toast — message générique dans un contexte de liste multi-factures | Faire remonter le `numero` de la facture en prop (`RegisterPaymentButton` → `PaymentModal`) et l'inclure dans le texte du toast, ex. `"Paiement de 50 000 FCFA enregistré — facture FP20260803001."`. |
| 8 | `components/admin/PaymentModal.tsx`, `components/admin/StockAdjustModal.tsx` | Séquence `showToast()` → fermeture modal → `router.refresh()` : fenêtre où l'écran sous-jacent peut encore afficher une donnée périmée pendant que le toast annonce déjà la mise à jour | Ne fermer la modale / afficher le toast qu'une fois le rafraîchissement des données de la page effectivement acquis (ex. piloter `router.refresh()` via `startTransition`, garder l'état "en cours" jusqu'à ce que la transition retombe). |
| 9 | Écran **Nouvelle facture** (Agent) | Aucun abonnement Realtime sur `produits` pendant la composition d'une facture — `stock_disponible` figé à l'ajout de la ligne | Ajouter un abonnement `postgres_changes` (`UPDATE` sur `produits`, filtré aux produits déjà dans `lignes`) qui met à jour l'affichage + déclenche un toast "Attention" nommant le produit (§5.1). |
| 10 | `app/(admin)/admin/paiements/page.tsx` + `app/(admin)/admin/factures/[id]/page.tsx` | Formule "reste à payer" dupliquée textuellement dans deux fichiers (identique aujourd'hui, mais fragile) | Extraire dans une fonction utilitaire unique (ex. `lib/facture-calculs.ts`), importée aux deux endroits — non bloquant, garde-fou de cohérence. |
| 11 | Aucun fichier existant | Pas de bandeau de perte de connexion réseau (§4f) | À implémenter : bandeau discret + toast info persistant à clé stable `"connexion-reseau"` (§3.1, §4f). |

---

## 7. Checklist de recette

À cocher par `qa-testeur` (ou équivalent) avant de considérer un écran touchant stock/paiement/
facturation comme conforme :

- [ ] Aucun toast de succès n'apparaît avant la résolution de la Server Action correspondante
      (couper le réseau en DevTools doit produire un toast d'erreur, jamais un toast de succès suivi
      d'un rollback silencieux).
- [ ] Chaque toast de succès/erreur nomme explicitement l'objet concerné (numéro de facture, nom de
      produit, montant formaté) — aucun texte générique de type "Opération réussie".
- [ ] Un toast "stock mis à jour"/"paiement enregistré" apparaît **au plus tôt en même temps que**,
      jamais **avant**, la mise à jour visible de la donnée correspondante à l'écran (tester en
      ralentissant le réseau : la donnée affichée derrière un modal qui se ferme ne doit jamais
      "flasher" une ancienne valeur après la fermeture).
- [ ] Un toast d'erreur bloquant (stock insuffisant, échec de validation) reste affiché tant qu'il
      n'est pas fermé manuellement — vérifier qu'il ne disparaît pas seul après quelques secondes.
- [ ] Le bouton d'action concerné est désactivé (spinner visible) pendant toute la durée de l'appel
      serveur — double-clic rapide ne doit produire qu'une seule écriture.
- [ ] Aucune couleur de toast codée en dur dans un composant — uniquement les classes
      `badge-pastel-*` et tokens existants.
- [ ] Sur mobile Agent (`< 640px`), le toast n'empiète pas sur la `BottomTabBar` ni sur le bouton
      flottant "Nouvelle facture". Sur Admin et Agent `≥ 640px`, le toast apparaît en haut-droite,
      sous la barre de navigation, sans chevaucher le contenu de page utile.
- [ ] Aucune donnée nulle par design ("inclus dans un kit") n'apparaît comme "0 FCFA" — toujours le
      badge "Inclus".

---

## 8. Handoff

**Cette spécification est prête à être reprise par `dev-frontend-agent` et `dev-frontend-admin`.**

Rappels de périmètre :
- `components/ui/Toast.tsx` est **partagé** par l'Espace Admin et l'Espace Agent — la correction du
  bug d'hydratation (§2.3) et toutes les évolutions d'API (§3.1) ne se codent **qu'une seule fois**,
  dans ce fichier, jamais dupliquées côté Admin ou côté Agent séparément.
- Aucune requête Supabase, aucun trigger SQL, aucune règle de calcul métier n'est spécifié ici — ce
  document s'arrête au visuel, au texte des messages et à l'orchestration front (ordre
  toast/refresh/fermeture de modal). Les abonnements Realtime mentionnés (§5.1, §6 #9) sont décrits
  par leur **effet attendu à l'écran**, pas par leur implémentation Supabase — à la charge de
  `dev-frontend-agent`.
- Toute divergence rencontrée en cours de développement (nouveau cas de toast non couvert, nouvel
  écran sensible touchant stock/paiement/facturation) doit remonter à `designer-ui-ux` pour
  arbitrage et mise à jour de ce document — jamais tranchée localement dans le code.
- `docs/design-system.md` reste la référence unique pour tout ce qui n'est pas spécifique aux toasts
  et à la cohérence des données (composants de base, micro-interactions générales, palette, domaine
  métier → design). Ce document (`docs/toast-et-coherence-donnees.md`) le complète sans le
  dupliquer ; ses §3.7 et §3.3 ont entraîné une mise à jour ciblée de `docs/design-system.md` §3.3,
  §6.7 et §10 (décisions D-Toast-01/D-Toast-02 référencées depuis le journal des décisions).

---

## 9. Écarts v3 — audit ciblé (brief commanditaire du 05/08/2026)

Ce brief recoupe très largement les §1 à §8 ci-dessus (déjà implémentés : hydratation, icônes,
timing par variante, position, séquencement toast/refresh de `PaymentModal.tsx` et
`StockAdjustModal.tsx`). Cette section **n'est pas une nouvelle spécification** : elle vérifie
uniquement les six points potentiellement nouveaux du brief contre l'état réel du code au
05/08/2026, et documente les correctifs concrets pour les écarts trouvés. Elle ne remplace aucune
section précédente ; elle les affine ponctuellement là où c'est indiqué (V3.2).

### V3.1 — Regroupement des alertes de stock bas — **écart réel, à corriger**

Fichier : `components/admin/AlertsBell.tsx`, gestionnaire `INSERT` sur `alertes_stock`
(lignes 26-36).

Constat : un toast **existe déjà** aujourd'hui (contrairement à l'hypothèse "juste le badge de la
cloche, pas de toast" à vérifier) — mais il est déclenché **une fois par alerte insérée**, sans
aucun regroupement :

```tsx
(payload) => {
  const nouvelle = payload.new as AlerteStockRow;
  setAlertes((prev) => [nouvelle, ...prev].slice(0, 20));
  showToast(nouvelle.message, nouvelle.type === "rupture" ? "error" : "warning"); // ← un par alerte
}
```

Si le trigger `verifier_seuil_stock()` insère 3 lignes en quasi-simultané (ex. une facture avec
plusieurs lignes qui font chacune franchir un seuil différent), l'admin voit s'empiler 3 toasts
distincts au lieu du récapitulatif demandé.

**Correctif imposé** : introduire un tampon (buffer) qui regroupe les insertions arrivées dans une
courte fenêtre glissante avant de décider du toast à afficher.

- Deux `useRef` supplémentaires dans `AlertsBell.tsx` : un tableau tampon (`bufferRef`) et un id de
  timeout (`timeoutRef`).
- À chaque `INSERT` : pousser l'alerte dans `bufferRef`, annuler le timeout en cours s'il existe,
  reprogrammer un timeout de **1200 ms** (fenêtre volontairement courte — c'est un regroupement de
  rafale, pas un digest périodique).
- À l'expiration du timeout (flush) :
  - si `bufferRef.length === 1` → conserver le comportement actuel, message nommant le produit
    (`nouvelle.message`), variante selon `type`.
  - si `bufferRef.length > 1` → un seul toast récapitulatif :
    `"${bufferRef.length} produits sont passés sous leur seuil de stock."`, variante `"error"` si au
    moins une alerte du lot est de type `"rupture"`, sinon `"warning"`.
  - vider le tampon après le flush.
- Le compteur de la cloche (`nonLues`, dérivé de `alertes` state) **n'a besoin d'aucun changement** :
  il agrège déjà correctement chaque alerte individuellement dans le menu déroulant, indépendamment
  du regroupement du toast — seul le toast est concerné par ce correctif.

Responsable : **dev-frontend-admin** (fichier `components/admin/AlertsBell.tsx`, Espace Admin
uniquement).

### V3.2 — Bandeau persistant de perte de connexion réseau — **fonctionnalité manquante, confirmée**

Recherche exhaustive (`navigator.onLine`, `addEventListener("online"/"offline")`, `NetworkBanner`,
`isOnline`) dans `app/`, `components/`, `lib/` : **aucune occurrence**. Confirmé : rien n'est
implémenté à ce jour, ni côté Admin ni côté Agent.

Ce cas était déjà anticipé en §4f/§6#11 du présent document, mais avec une ambiguïté que le brief
lève explicitement : §4f décrivait un "bandeau" en prose tout en renvoyant, pour son
implémentation, vers le mécanisme du **toast info persistant à clé stable** (`persistent: true,
key: "connexion-reseau"`) — c'est-à-dire un widget flottant en coin d'écran (§3.3), pas un élément
structurel de layout. Le brief insiste : *"jamais un simple toast"*. Décision qui **affine §4f sans
le contredire sur le fond** (la détection reste la même, seul le mode de rendu change) :

**Décision D-Toast-03 (bandeau réseau = composant de layout dédié, pas le système de Toast).**

- Nouveau composant partagé `components/ui/NetworkStatusBanner.tsx` (client component), au même
  statut que `Toast.tsx` : codé une seule fois, monté dans les deux layouts racines.
- Emplacement exact :
  - `app/(admin)/admin/layout.tsx` : entre `<Topbar .../>` (ligne 65) et `<main>` (ligne 66), à
    l'intérieur du `div.flex.min-w-0.flex-1.flex-col` (ligne 64) — pleine largeur de la zone de
    contenu, sous la Topbar, jamais dans la `Sidebar`.
  - `app/(agent)/layout.tsx` : entre `<NavBar .../>` (ligne 38) et `<main>` (ligne 39) — pleine
    largeur de l'écran (l'Agent n'a pas de sidebar).
- Détection réaliste (double condition, comme déjà exigé §4f — un `offline` seul peut être un faux
  positif) :
  - écouteurs passifs `window.addEventListener("online"/"offline", ...)` pour une réaction
    immédiate ;
  - **et** un health-check actif léger, répété toutes les 15-20s tant que la page est visible
    (`document.visibilityState === "visible"`) et systématiquement après un événement `offline`,
    via une requête minimale sans cache (`fetch` vers une route `app/api/health/route.ts` à créer —
    quelques octets, `no-store` — ou à défaut une requête Supabase déjà bon marché comme
    `select("id").limit(1)` sur une table peu volumineuse). Le bandeau ne s'affiche que si les DEUX
    signaux concordent (navigateur hors-ligne ET health-check en échec), et ne se masque que quand
    les deux redeviennent positifs.
- Rendu :
  - État masqué par défaut : **aucun nœud rendu** (pas `display:none`), état initial identique
    serveur/premier rendu client (`useState(false)` + bascule uniquement en `useEffect`, même
    invariant anti-hydration-mismatch que celui déjà corrigé en §2.3 sur `Toast.tsx` — même s'il n'y
    a ici aucun risque de mismatch puisque l'état ne dépend que d'écouteurs `useEffect`).
  - Amber pastel (`badge-pastel-amber`), pleine largeur, compact (`py-2 px-4`, `text-body-sm`),
    icône triangle, texte `"Connexion perdue — vérification en cours..."`.
  - **Aucun bouton de fermeture** — à la différence d'un toast, ce bandeau ne se ferme jamais
    manuellement tant que la reconnexion n'est pas confirmée : c'est précisément le point que le
    brief distingue du toast.
  - À la reconnexion confirmée (double signal positif) : bascule 2s en vert pastel
    (`"Connexion rétablie."`), puis démontage.
- Conséquence sur §4f : le couple `persistent`/`key: "connexion-reseau"` du système de Toast **ne
  doit plus être utilisé pour ce cas précis** une fois ce bandeau construit (le bandeau remplit seul
  ce rôle, de façon plus robuste qu'un toast en coin — cf. le point de vigilance déjà noté §3.3 sur
  le chevauchement possible avec `AlertsBell`/menu utilisateur). L'option `persistent`/`key` de
  l'API du Toast reste disponible pour d'autres cas futurs, simplement plus assignée à celui-ci.
  Aucune autre partie de §4f n'est remise en cause (règle anti-optimiste inchangée : aucun toast de
  succès tant que le serveur n'a pas confirmé).

Responsable : **dev-frontend-admin ET dev-frontend-agent** (composant partagé `components/ui/`,
câblage dans les deux layouts respectifs — comme pour `Toast.tsx`, une seule implémentation, deux
points de montage).

### V3.3 — Toast d'ajustement de stock avec ancien ET nouveau niveau — **écart mineur (motif manquant)**

Fichier : `components/admin/StockAdjustModal.tsx`, ligne 80-83 :

```tsx
showToast(
  `Stock de "${produit.nom}" ajusté : ${ajustementConfirme.quantiteAvant} → ${ajustementConfirme.quantiteApres} ${libelleUnite(...)}.`,
  "success"
);
```

Le texte contient déjà l'ancien **et** le nouveau niveau (`12 → 5 pièces`) — ce point précis reste
conforme, comme déjà noté §5.3. Mais le **motif** saisi par l'admin (`motif` state, obligatoire
≥ 5 caractères, déjà validé et transmis à `ajusterStock`) n'apparaît nulle part dans le toast, alors
que le brief l'exige explicitement (`"Stock ajusté : 12 → 8, motif : casse transport"`).

**Correctif** :
1. Ajouter `motif: string` au type de `ajustementConfirme` (ligne 42-45) — même logique que les
   quantités déjà figées à cet endroit (le commentaire en place explique déjà pourquoi : éviter
   toute ambiguïté si l'admin modifiait encore le champ pendant la fenêtre d'attente de
   rafraîchissement).
2. Texte corrigé :
   `` `Stock de "${produit.nom}" ajusté : ${quantiteAvant} → ${quantiteApres} ${unite} — motif : ${motifAffiche}.` ``
   avec `motifAffiche` = motif tronqué à ~60 caractères + `…` si plus long (le motif est un champ
   libre multi-lignes ; le toast doit rester lisible en une ligne — le motif complet reste consultable
   dans l'historique des mouvements de stock, aucune perte d'information, seulement de présentation
   dans le toast).

Responsable : **dev-frontend-admin**.

### V3.4 — Séquence toast en deux temps pour l'export PDF — **partiellement conforme, un vrai manque identifié**

**a) Toast INFO pendant la génération (>1s)** — déjà satisfait autrement, aucune action requise.
`GeneratePdfButton.tsx` désactive le bouton et affiche son spinner via `loading={enCours}`
(`enCours` state, `setEnCours(true)` avant l'appel, `setEnCours(false)` après) — ceci remplit déjà
le rôle du toast INFO demandé par le brief, conformément à la règle 4a déjà documentée ("bouton
disabled + spinner pendant l'appel serveur", *jamais d'écran vide en chargement*). Ajouter un toast
INFO séparé pour la **même** action ponctuelle (pas une tâche de fond détachée du bouton) créerait
un doublon de signal sans valeur ajoutée. Décision : ne pas ajouter de toast INFO ici — le spinner du
bouton est le mécanisme retenu, comme pour toute autre action de ce type dans le reste du produit.

**b) Toast SUCCÈS final avec lien/téléchargement** — **manquant, à corriger**.

Constat (`components/admin/GeneratePdfButton.tsx`, lignes 19-33) : le chemin d'erreur affiche déjà un
toast (`"Impossible de générer le PDF de cette facture."`, ligne 28), mais le chemin de succès
n'affiche **aucun toast** — seulement `window.open(data.pdf_url, "_blank")` (ligne 32), silencieux.
Ceci viole la règle absolue §1.3 (toute action confirmée doit nommer l'objet concerné) côté succès,
et prive l'admin de toute confirmation nommée sur une action qui produit un document facturable.

Risque technique aggravant à signaler : `handleClick` est `async` et n'appelle `window.open` qu'
**après** un `await` sur l'Edge Function — hors du tour de boucle synchrone du geste utilisateur, ce
que de nombreux navigateurs (Safari en particulier) traitent comme une ouverture de popup non
sollicitée et bloquent silencieusement, sans aucun message d'erreur ni de succès pour prévenir
l'admin qu'un fichier était pourtant prêt. Le toast succès devient donc aussi un filet de secours
nécessaire, pas seulement une confirmation cosmétique.

**Correctif** :
1. Ajouter une prop `factureNumero: string` à `GeneratePdfButton` — trivial à câbler, `facture.numero`
   est déjà dans le scope de l'unique appelant (`app/(admin)/admin/factures/[id]/page.tsx`, ligne 95).
2. Après succès : `showToast(\`PDF de la facture ${factureNumero} généré.\`, "success")`, **et**
   conserver `window.open(...)` en plus (pas en remplacement) : le toast confirme nommément l'action
   et sert de repli descriptif si le popup a été bloqué. Un lien cliquable dans le toast lui-même
   (ex. libellé "Télécharger" pointant vers `data.pdf_url`) serait la solution la plus robuste au
   blocage de popup, mais nécessite un ajout d'API mineur au Toast (aujourd'hui `ShowToastOptions` ne
   porte que `persistent`/`key`, aucun contenu enrichi) — recommandé comme évolution ciblée
   (`actionLabel`/`actionHref` optionnels, rendus en lien discret sous le texte), réutilisable
   également pour l'export rapport ci-dessous ; à défaut, la solution de repli
   toast-texte + `window.open` conservé reste suffisante pour ce cas.

**Équivalent export rapport** (`components/admin/ReportsClient.tsx`, fonction `handleExport`, lignes
45-67) : **même défaut, à corriger de la même façon**. Aucune occurrence de `showToast` dans tout le
fichier (confirmé) — les échecs sont affichés via un `InlineAlert` local (`erreur` state) plutôt que
par le système de Toast, ce qui dévie du patron employé partout ailleurs pour les erreurs bloquantes
d'action serveur (§3.4/§3.6), et le succès est totalement silencieux (`window.open(data.url, "_blank")`
seul, ligne 66). Correctif identique en substance : remplacer `setErreur`/`InlineAlert` par
`showToast(..., "error")` (persistant, fermeture manuelle) pour l'échec, et ajouter un toast succès
nommant le type de rapport et la période, ex.
`"Rapport des ventes du 01/08/2026 au 05/08/2026 généré (PDF)."`.

Responsable : **dev-frontend-admin** (les deux fichiers concernés sont admin).

### V3.5 — Nuance du toast de paiement (soldée vs partielle) — **fonctionnalité manquante**

Fichier : `components/admin/PaymentModal.tsx`, lignes 85-88 — le texte actuel est uniforme, quel que
soit le résultat du paiement sur le statut de la facture :

```tsx
showToast(
  `Paiement de ${formatMontant(paiementConfirme.montant)} enregistré — facture ${factureNumero}.`,
  "success"
);
```

Le brief demande de distinguer *"Paiement enregistré — facture soldée"* de *"Paiement partiel
enregistré — reste 25 000 FCFA"*. Ce n'est pas seulement un texte à changer : **la donnée
nécessaire n'existe pas encore côté client**. `enregistrerPaiement` (`lib/actions/paiements.ts`,
lignes 24-73) retourne uniquement la ligne `paiements` insérée (`data as PaiementRow`, ligne 72) —
ni le statut à jour de la facture (`validee → payee_partielle → payee`, recalculé par le trigger SQL
`appliquer_paiement()` à l'INSERT, comme déjà documenté §5.2), ni le reste à payer post-paiement. Le
modal ne connaît que `resteAPayer` (prop figée **avant** le paiement) et `values.montant` (le montant
qu'il vient de soumettre) — recalculer `resteAPayer - montant` côté client pour choisir le texte
violerait directement la règle 4d déjà documentée ("un même montant... jamais recalculé
indépendamment") : c'est exactement le trigger SQL qui doit rester la seule source de vérité de ce
chiffre, y compris pour un cas limite comme un paiement concurrent inséré par un autre admin entre
l'ouverture du modal et la soumission.

**Correctif** :
1. `lib/actions/paiements.ts` — enrichir le retour de `enregistrerPaiement` d'une lecture
   supplémentaire (pas un recalcul, une lecture de l'état déjà écrit par le trigger) : après l'insert,
   sélectionner `factures.statut` (et, si déjà exposé ailleurs par une vue/fonction serveur existante,
   le reste à payer correspondant) pour la facture concernée, et les inclure dans la réponse, ex.
   `{ data: { paiement: PaiementRow, factureStatut: StatutFacture, resteAPayer: number } }`. Ceci
   reste une lecture de données déjà calculées par SQL, pas une nouvelle règle métier — dans le
   périmètre "orchestration front" déjà défini §8 du présent document, pas une intervention backend.
2. `components/admin/PaymentModal.tsx` — dans le bloc `useEffect` (lignes 80-100), distinguer :
   - `factureStatut === "payee"` →
     `` `Paiement de ${formatMontant(montant)} enregistré — facture ${factureNumero} soldée.` ``
   - sinon (`payee_partielle`) →
     `` `Paiement partiel de ${formatMontant(montant)} enregistré — facture ${factureNumero}, reste ${formatMontant(resteAPayer)}.` ``
   en utilisant exclusivement le `resteAPayer` renvoyé par le serveur à l'étape 1, jamais une
   soustraction locale.

Responsable : **dev-frontend-admin** (fichier UI `PaymentModal.tsx` + contrat de retour de l'action
`lib/actions/paiements.ts`, lecture seule, sans nouvelle règle métier).

### V3.6 — Cohérence du badge de statut liste/détail facture — **déjà conforme, rien à faire**

Vérifié : `app/(admin)/admin/factures/page.tsx` (ligne 106) et
`app/(admin)/admin/factures/[id]/page.tsx` (ligne 88) importent tous les deux le même composant
`@/components/ui/StatusBadge` et lui passent directement `facture.statut`
(`<StatusBadge statut={facture.statut} />`) sans aucune transformation intermédiaire entre les deux
écrans. Aucune divergence possible aujourd'hui — aucune action requise.

### Synthèse actionnable v3

| # | Fichier(s) | Écart | Verdict | Responsable |
|---|---|---|---|---|
| V3.1 | `components/admin/AlertsBell.tsx` | Un toast par alerte insérée, aucun regroupement de rafale | Écart réel | dev-frontend-admin |
| V3.2 | Nouveau : `components/ui/NetworkStatusBanner.tsx` + `app/(admin)/admin/layout.tsx` + `app/(agent)/layout.tsx` | Aucun bandeau/détection réseau implémenté ; §4f pointait vers le toast, pas un bandeau structurel | Fonctionnalité manquante | dev-frontend-admin + dev-frontend-agent |
| V3.3 | `components/admin/StockAdjustModal.tsx` | Toast avant/après conforme, motif absent du texte | Écart mineur | dev-frontend-admin |
| V3.4a | `components/admin/GeneratePdfButton.tsx` | Toast INFO pendant génération | Déjà conforme (spinner du bouton) | — |
| V3.4b | `components/admin/GeneratePdfButton.tsx`, `components/admin/ReportsClient.tsx` | Aucun toast succès, échec incohérent (InlineAlert au lieu de Toast pour l'export rapport), risque de popup bloqué non couvert | Fonctionnalité manquante | dev-frontend-admin |
| V3.5 | `components/admin/PaymentModal.tsx` + `lib/actions/paiements.ts` | Texte uniforme, pas de distinction soldée/partielle ; donnée serveur manquante pour la faire | Fonctionnalité manquante | dev-frontend-admin |
| V3.6 | `app/(admin)/admin/factures/page.tsx`, `.../[id]/page.tsx` | Aucun — même composant, même donnée | Déjà conforme | — |
