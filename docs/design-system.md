# GFB-STOCK — Design System

Statut : **Phase 2 terminée — prêt pour reprise par `dev-frontend-admin` et `dev-frontend-agent`.**
Auteur : `designer-ui-ux` (agent). Dépend du schéma livré par `architecte-bdd`
(`supabase/migrations/0001_schema_initial.sql`, `supabase/seed.sql`).

> **Mise à jour — Phase B de l'avenant Crédit / Bon de Livraison / Multi-entrepôts (plan en 7
> phases).** Suite à la livraison de `supabase/migrations/0013_avenant_credit_entrepots.sql` (Phase
> A, `architecte-bdd`), ce document est étendu avec les spécifications visuelles des nouveaux états
> métier : badges statut crédit/BL (§5.6, §5.7, §6.25), sélecteur d'entrepôt anti-erreur (§5.8,
> §6.26), jauge crédit vs seuil global (§5.9, §6.27), aucun nouveau token requis (§3.11), décisions
> D-21 à D-23 (§10). Prêt pour reprise en Phase C par `dev-frontend-admin`/`dev-frontend-agent`.

Ce document est la référence unique de vérité visuelle du projet. Aucun agent frontend ne doit
introduire une couleur, un rayon, une durée d'animation ou un pattern de composant qui n'y figure
pas — en cas de cas non couvert, se reporter au §10 (journal des décisions) ou faire trancher une
nouvelle entrée par `designer-ui-ux`.

## Sommaire

1. [Installation — où copier ces fichiers](#1-installation)
2. [Principes directeurs](#2-principes-directeurs)
3. [Tokens](#3-tokens)
4. [Deux thèmes, une palette](#4-deux-thèmes-une-palette)
5. [Domaine métier → design](#5-domaine-métier--design)
6. [Composants de base](#6-composants-de-base)
7. [Micro-interactions (règles absolues)](#7-micro-interactions-règles-absolues)
8. [Accessibilité & lisibilité terrain](#8-accessibilité--lisibilité-terrain)
9. [Breakpoints responsive](#9-breakpoints-responsive)
10. [Journal des décisions](#10-journal-des-décisions)
11. [Handoff](#11-handoff)

---

## 1. Installation

Aucun projet Next.js n'existe encore dans ce dépôt. Les fichiers sources du design system vivent
provisoirement sous :

- `design-system/tokens.css` — variables CSS (couleurs, rayons, typo, motion, spacing, z-index).
- `design-system/tailwind.tokens.js` — fragment `theme.extend` Tailwind référencant ces variables.

**Quand le projet Next.js sera initialisé** (par `dev-frontend-agent` ou `dev-frontend-admin`,
premier des deux à démarrer) :

1. Copier le contenu de `design-system/tokens.css` en tête de `app/globals.css`, avant les
   directives `@tailwind base/components/utilities`.
2. Dans `tailwind.config.ts`, importer `design-system/tailwind.tokens.js` et le fusionner dans
   `theme.extend` (voir commentaire en tête de ce fichier pour l'exemple exact).
3. Poser `data-theme="admin"` sur la racine `<html>` du layout `app/(admin)/layout.tsx`, et
   `data-theme="agent"` sur celle de `app/(agent)/layout.tsx`.
4. Installer la police **Inter** (via `next/font/google`) — fallback système déjà prévu dans les
   tokens si indisponible.
5. Ne jamais dupliquer ces fichiers ailleurs : un seul point de vérité pour les deux espaces.

---

## 2. Principes directeurs

1. **Zéro couleur codée en dur.** Tout passe par les tokens CSS / classes Tailwind générées.
2. **Lisibilité terrain avant esthétique.** Espace Agent = utilisé debout, en boutique ou en
   extérieur, parfois en plein soleil sur mobile. Corps de texte 16px minimum, contraste fort,
   cibles tactiles ≥ 44px, jamais de gris clair sur blanc pour du contenu métier.
2. **Une seule identité, deux contextes.** Même palette d'accent (vert/ambre/rouge/bleu/violet),
   même vocabulaire de composants, même rayons, mêmes micro-interactions — seul le fond/texte/
   bordure change entre thème sombre (Admin) et thème clair (Agent).
4. **Les états métier sont visuels avant d'être textuels.** Un agent ou un admin doit comprendre le
   statut d'une facture, le niveau de stock ou la nature "kit" d'un produit au premier coup d'œil,
   sans lire de texte.
5. **Jamais de logique métier ici.** Ce document spécifie structure, états et apparence — pas les
   requêtes Supabase, la validation serveur ou les règles de calcul (propriété de
   `architecte-bdd` / `dev-backend-edge`).

---

## 3. Tokens

### 3.1 Couleurs de référence (fixes, ne jamais modifier)

> **Mise à jour D-25 (octobre 2026) — direction « Comptoir ».** L'Admin est désormais **clair** par
> défaut (fond `#F4F6F3`, cartes blanches) ; le thème sombre ci-dessous reste disponible via le
> sélecteur de fond. Voir §10 D-25 pour les valeurs actuelles.

> **Retour au thème sombre "neon green" (D-14, §10).** L'Espace Admin est repassé à un fond sombre —
> la parenthèse claire "Ultraleads" (`--color-bg: #F4F5FA`, cartes blanches) est **définitivement
> abandonnée**, voir historique juste en dessous du tableau. Les valeurs ci-dessous sont les valeurs
> **actuelles**.

| Token | Hex | Usage |
|---|---|---|
| `--color-bg` | `#0F1712` | Fond principal (Admin) |
| `--color-surface` | `#16211A` | Cartes, panels (Admin) |
| `--color-surface-2` | `#1E2C22` | Hover (Admin) |
| `--color-border` | `#2C3D30` | Bordures (Admin) |
| `--color-text` | `#F0F6F2` | Texte principal (Admin) |
| `--color-muted` | `#8FA294` | Texte secondaire (Admin) — contraste ≈ 6.7:1 sur `--color-bg`, AA large |
| `--color-green` | `#16A34A` | Accent principal, validation |
| `--color-green-dk` | `#15803D` | Vert foncé (hover, en-têtes de tableau) |
| `--color-amber` | `#F59E0B` | Stock bas, proforma en attente |
| `--color-red` | `#EF4444` | Rupture de stock, facture impayée |
| `--color-blue` | `#2563EB` | Info, liens |
| `--color-purple` | `#7C3AED` | Paiement partiel |
| `--color-navy` | `#1E2A45` | Réservé à la carte CTA "Besoin d'aide ?" en bas de la sidebar blanche (D-15) — plus un accent héro du contenu (voir historique) |
| `--color-navy-dk` | `#141C30` | Navy foncé (hover) |
| `--color-sidebar-bg` | `#FFFFFF` | Fond de la sidebar Admin — seule zone claire de l'écran (D-15) |
| `--color-sidebar-text` | `#0F1712` | Texte principal sur la sidebar blanche |
| `--color-sidebar-text-muted` | `#5B6E60` | Texte secondaire sur la sidebar blanche |
| `--color-sidebar-active-bg` | `#16A34A` (= `--color-green`) | Fond de l'item de nav actif (D-16) |
| `--color-hero-start` | `#0D3320` | Extrémité "profonde" du dégradé héro |
| `--color-hero-end` | `#4ADE80` | Extrémité "néon" du dégradé héro |

> **Historique — valeurs superseded par D-14 (traçabilité, non supprimées).** Pendant la phase
> "Ultraleads" (entre D-11/D-12/D-13 et D-14), l'Admin utilisait un thème **clair** :
> `--color-bg: #F4F5FA`, `--color-surface: #FFFFFF`, `--color-surface-2: #EEF0F7`,
> `--color-border: #E2E5F0`, `--color-text: #1B2338`, `--color-muted: #7C8299`, et `--color-navy`
> servait d'accent héro plein (carte stat principale, item de nav actif). Ces valeurs ne sont plus
> appliquées nulle part dans le code depuis D-14 ; elles restent documentées ici uniquement pour
> l'historique du projet, voir §10 D-14.

Le thème Agent réutilise **exactement** ces 6 valeurs d'accent pour les fonds/bordures/icônes ; seul
le texte accentué de petite taille utilise des variantes foncées documentées (§4.2) pour rester
lisible au soleil sans jamais toucher aux 6 valeurs ci-dessus. Les tokens sidebar/hero ci-dessus sont
**scope Admin uniquement** — l'Agent n'a pas de sidebar blanche et ne les référence jamais.

### 3.2 Typographie

Police : **Inter** (fallback `system-ui`). Chiffres/montants/numéros de facture : police monospace
(`--font-mono`).

| Token | Taille | Usage |
|---|---|---|
| `--text-display` | 32px / 700 | Valeur clé d'une stat card dashboard |
| `--text-display-lg` | 40px / 700 | Valeur centrale de la jauge radiale (`RadialGauge`, §6.18), emphase exceptionnelle uniquement |
| `--text-h1` | 28px / 700 | Titre de page |
| `--text-h2` | 22px / 600 | Titre de section / carte |
| `--text-h3` | 18px / 600 | Sous-titre, en-tête de bloc |
| `--text-body` | 16px / 400 | **Corps de texte par défaut, jamais en dessous côté Agent** |
| `--text-body-sm` | 14px / 400 | Usage restreint : colonnes secondaires de tableaux denses Admin uniquement (jamais pour un montant, une quantité ou un statut) |
| `--text-caption` | 12px / 500, uppercase, tracking +0.04em | Libellés/eyebrows uniquement |

Line-height : 1.5 pour le corps de texte, 1.2 pour les titres.

### 3.3 Rayons

| Token | Valeur | Usage |
|---|---|---|
| `--radius-input` | 8px (`rounded-lg`) | Inputs, selects, badges génériques (rôle, kit, catégorie) |
| `--radius-badge-pill` | 9999px (`rounded-full`) | **Badges de statut de facture uniquement** |
| `--radius-card` | 12px (`rounded-xl`) | Cartes |
| `--radius-modal` | 16px (`rounded-2xl`) | Modals **et toasts** (voir D-06, §10 — décision détaillée dans `docs/toast-et-coherence-donnees.md` §3.7) |

### 3.4 Espacement, ombres, z-index, motion

- Échelle d'espacement : 4 / 8 / 12 / 16 / 24 / 32 / 48px (`--space-*`).
- Cible tactile minimale : 44px (`--tap-target-min`) — tout bouton/lien cliquable Espace Agent.
- Ombres : `--shadow-sm/md/lg` + `--shadow-card-hover` (valeurs différentes par thème, voir
  `tokens.css`).
- Z-index : dropdown 20, sticky header 30, overlay modal 40, modal 50, toast 60.
- Motion : voir §7 (règles absolues, rappelées ici pour référence rapide) —
  `--duration-btn` 150ms / `--ease-standard`, `--duration-card` 200ms / `ease-out`.

### 3.5 Dégradé accent (décoratif — jauges/graphiques uniquement)

Ajouté pour la reproduction fidèle de la référence "Ultraleads" (barre de progression du widget
"User Growth", jauge radiale "Customers Volume", barres du graphique "Statistics"). **Ce dégradé
n'est jamais une couleur de statut** : il ne remplace ni ne complète le système
vert/ambre/rouge/bleu/violet/neutre des factures (§5.1) — il habille exclusivement des éléments
décoratifs/informatifs (jauges et graphiques agrégés sans seuil d'alerte métier, barres de
progression).

| Token | Valeur | Usage |
|---|---|---|
| `--color-accent-start` | `#2DD4BF` (turquoise) | Extrémité "départ" des jauges/barres décoratives |
| `--color-accent-end` | `#38BDF8` (bleu ciel/cyan) | Extrémité "arrivée" des jauges/barres décoratives |
| `--gradient-accent` | `linear-gradient(90deg, var(--color-accent-start) 0%, var(--color-accent-end) 100%)` | Barres de progression horizontales (gauche → droite) |
| `--gradient-accent-y` | `linear-gradient(180deg, var(--color-accent-end) 0%, var(--color-accent-start) 100%)` | Barres verticales de graphique (bleu en haut, turquoise en bas) |

> **Écart assumé vs la référence — voir décision D-09 (§10).** La capture montre un dégradé se
> terminant vers `#3B82F6` (bleu vif, proche de `--color-blue` = `#2563EB`, la couleur du statut
> `validee`). Pour éviter toute confusion entre "ce graphique décoratif est bleu" et "cette ligne
> concerne une facture validée", l'extrémité du dégradé est décalée vers un bleu-cyan plus clair
> (`#38BDF8`) : l'effet visuel "turquoise → bleu" de la référence est conservé, la teinte finale
> reste nettement distincte du bleu de statut.

Règle d'usage stricte : ce dégradé ne doit jamais apparaître dans le même composant/carte qu'un
badge de statut de facture (§5.1) — usage réservé aux widgets KPI agrégés du dashboard Admin
(`RadialGauge`, §6.18, barres de progression décoratives), jamais au domaine facture.

### 3.6 Rayon de carte étendu — cartes vedettes du dashboard (`--radius-card-lg`)

| Token | Valeur | Usage |
|---|---|---|
| `--radius-card-lg` | `20px` (Admin uniquement — replie sur `12px` = `--radius-card` partout ailleurs) | Cartes "vedettes" de la grille de synthèse du dashboard Admin (stat card héro, cartes graphique/jauge de la rangée façon "Sales Overview") **uniquement** |

Ce token **ne remplace pas** `--radius-card` (12px, §3.3), qui reste le rayon par défaut de
**toutes les autres cartes** des deux espaces (fiches détail, cartes catalogue, cartes liste mobile
Agent...). Voir décision D-11 (§10) pour l'arbitrage complet et le rationale du scoping
`[data-theme="admin"]` avec repli sécurisé en `:root`. **Note D-14 :** le contexte visuel dans lequel
cette décision a été prise (dashboard Ultraleads clair) est remplacé par le retour au thème sombre —
la valeur du token (20px) n'est pas remise en cause et continue de s'appliquer telle quelle aux
cartes vedettes du nouveau dashboard sombre.

### 3.7 Sidebar Admin — zone claire dérogatoire (D-15, D-16)

Depuis le retour au thème sombre (D-14), la sidebar Admin est **la seule zone claire de tout
l'écran** : rupture volontaire du principe "un seul jeu de tokens partagé sidebar/contenu" en
vigueur jusqu'ici. Tokens dédiés, à n'utiliser **nulle part ailleurs** :

| Token | Valeur | Usage |
|---|---|---|
| `--color-sidebar-bg` | `#FFFFFF` | Fond de la sidebar |
| `--color-sidebar-text` | `#0F1712` | Texte principal (libellés de nav, sections) |
| `--color-sidebar-text-muted` | `#5B6E60` | Texte secondaire (sous-libellés, badges neutres) |
| `--color-sidebar-active-bg` | `#16A34A` (`--color-green`) | Fond de l'item de nav actif |
| `--color-sidebar-active-text` | `#FFFFFF` | Texte de l'item de nav actif |

**Item de nav actif : vert plein, pas navy (D-16).** Jusqu'ici (Ultraleads, D-12), l'item de nav
actif utilisait un fond `--color-navy` plein. La nouvelle référence "neon green" montre un vert plein
pour cet état. Décision : l'item de nav actif passe à `--color-sidebar-active-bg` (= `--color-green`)
+ texte blanc, `rounded-input` (8px, la règle D-08 n'est pas remise en cause : ce n'est pas un badge
de statut de facture). Rationale :
1. Sur la sidebar redevenue blanche, le vert de marque (seul accent CTA reconnu de l'application,
   D-12) est immédiatement disponible et parfaitement lisible — il n'y a plus besoin d'un second
   accent "héro" (navy) pour se distinguer d'un fond clair neutre.
2. Conserver `navy` comme fond de nav actif tout en l'utilisant aussi pour la carte CTA "Besoin
   d'aide ?" un peu plus bas dans la même sidebar aurait créé deux blocs `navy` pleins proches
   visuellement mais de fonction différente (navigation vs. CTA d'aide) — source de confusion.
   `navy` est donc **recentré exclusivement sur la carte CTA**, le vert prend l'exclusivité de l'état
   "actif" dans la nav.
3. Cela ne contredit pas D-12 ("le vert reste l'unique signal action principale reconnu") : un item
   de nav actif n'est pas une action, mais indiquer "vous êtes ici" avec l'accent de marque reste
   cohérent avec la hiérarchie visuelle déjà en place plutôt que de introduire une lecture
   supplémentaire.

`--color-navy`/`--color-navy-dk` restent **inchangés** et continuent d'habiller la carte CTA sombre
en bas de sidebar : sur le fond `--color-sidebar-bg` blanc, leur contraste est excellent (`navy` sur
blanc ≈ 14:1), largement au-dessus du seuil AA — aucune nouvelle valeur n'était nécessaire pour cet
usage.

**Point de vigilance transmis aux agents frontend (à trancher au moment du code) :** le fond sombre
du contenu principal (`--color-bg`/`--color-surface`) rend le remplissage plein `navy` quasiment
invisible s'il est réutilisé tel quel *hors sidebar* (contraste navy/fond sombre ≈ 1.2:1, très en
dessous du minimum non-texte de 3:1). Concrètement, le variant de bouton `navy` (§6.1) et l'état actif
de `SegmentedControl` (§6.17), pensés pour le fond clair Ultraleads, ne doivent **plus** utiliser un
remplissage `navy` plein sur le contenu sombre du dashboard : repli sur un remplissage
`--color-green-dk` (contraste ≈ 3.6:1 sur le nouveau fond, cohérent avec son usage déjà documenté
"hover, en-têtes de tableau") en attendant qu'une nouvelle capture de référence précise le traitement
exact souhaité pour ces éléments sur fond sombre. `navy` reste valide et inchangé uniquement dans son
usage sidebar (nav actif ancien, désormais CTA "Besoin d'aide ?").

### 3.8 Dégradé héro (`--gradient-hero`) — cartes vedettes

Nouveau dégradé, **distinct** de `--gradient-accent` (§3.5, turquoise/cyan, purement décoratif).

| Token | Valeur | Usage |
|---|---|---|
| `--color-hero-start` | `#0D3320` (vert profond) | Extrémité départ |
| `--color-hero-end` | `#4ADE80` (vert néon) | Extrémité arrivée |
| `--gradient-hero` | `linear-gradient(135deg, var(--color-hero-start) 0%, var(--color-hero-end) 100%)` | Cartes vedettes uniquement |

**Pourquoi ce n'est pas le même token que `--gradient-accent` ?** Les deux dégradés répondent à des
besoins visuellement proches (dégradé habillant un élément de dashboard) mais **sémantiquement
opposés** :
- `--gradient-accent` (turquoise → cyan) est **purement décoratif/neutre** : il habille des jauges et
  graphiques agrégés *sans* signification particulière, et sa teinte a même été délibérément décalée
  (D-09) pour ne jamais évoquer un statut ou un accent de marque.
- `--gradient-hero` (vert profond → vert néon) porte au contraire un **sens fort et volontaire** :
  "ceci est l'élément phare de l'écran" — il réutilise et amplifie le vert de marque (le seul accent
  CTA reconnu, D-12) plutôt que de s'en écarter.

Fusionner ces deux rôles dans un seul token créerait une collision de sens : un widget décoratif
secondaire habillé du même dégradé qu'une carte héro laisserait croire qu'il a la même importance.
Garder deux tokens distincts permet à un développeur de choisir la bonne intention sans ambiguïté.

**Usage prévu** : carte stat héro du dashboard, `DonutChart` "Statistique Produit" (§6.22). Ne jamais
utiliser sur un badge de statut de facture ni sur un graphique décoratif secondaire (`RadialGauge`,
§6.18, qui garde `--gradient-accent`).

### 3.9 Séries de graphiques dérivées de la palette

Nouveaux tokens pour les composants `WeeklySalesBarChart` et `NestedRadialProgress` (§6.23, §6.24).
Aucune couleur arbitraire hors palette : tout est réutilisé ou dérivé des tokens vert existants.

| Token | Valeur | Usage |
|---|---|---|
| `--color-chart-serie-1` | `var(--color-green)` = `#16A34A` | Barres "vert clair" — CA **facturé** |
| `--color-chart-serie-2` | `var(--color-green-dk)` = `#15803D` | Barres "vert foncé" — CA **encaissé** |
| `--color-agent-ring-1` | `var(--color-green)` = `#16A34A` | Anneau agent 1 |
| `--color-agent-ring-2` | `var(--color-hero-end)` = `#4ADE80` | Anneau agent 2 |
| `--color-agent-ring-3` | `var(--color-green-dk)` = `#15803D` | Anneau agent 3 |
| `--color-agent-ring-4` | `var(--color-accent-start)` = `#2DD4BF` | Anneau agent 4 |
| `--color-agent-ring-5` | `var(--color-hero-start)` = `#0D3320` | Anneau agent 5 |

### 3.10 Easing "spring" (entrée Toast, D-20)

| Token | Valeur | Usage |
|---|---|---|
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Timing-function à overshoot (dépasse 100% puis se stabilise) — simule un ressort en CSS pur |
| `--duration-toast` | `380ms` | Durée de l'animation d'entrée du Toast (remplace `200ms` sur cette seule transition) |

Aucune dépendance JS (le projet n'a pas framer-motion, `recharts` reste la seule lib de
visualisation) : l'effet "rebond" vient uniquement du dépassement de la courbe `cubic-bezier`
appliquée au keyframe `toast-in` existant (`opacity 0→1` + `translateY(8px)→0`), pas d'un nouveau
keyframe multi-étapes. Voir §6.7 pour l'usage et §10 D-20 pour le rationale complet, y compris la
mise à jour de conclusion nécessaire dans `docs/toast-et-coherence-donnees.md` §3.7.

### 3.11 Avenant Crédit / Bon de Livraison / Multi-entrepôts (Phase B) — aucun nouveau token requis

Le schéma livré par `architecte-bdd` (`supabase/migrations/0013_avenant_credit_entrepots.sql`,
règles métier 11-16) introduit trois familles d'états visuels nouveaux : statut crédit
(`statut_credit`), statut bon de livraison (`statut_bon_livraison`) et sélection d'entrepôt
(`entrepots`, `factures.entrepot_id`, etc.). **Aucune couleur hors palette, aucun nouveau rayon,
aucune nouvelle durée d'animation n'a été nécessaire** — cohérent avec le principe directeur §2.1
("zéro couleur codée en dur") et avec la pratique déjà en place pour les séries de graphiques (D-19,
§3.9) de toujours dériver/réutiliser avant de créer :

- Les badges crédit/BL (§5.6, §5.7) réutilisent `badge-pastel-amber`/`badge-pastel-green` (déjà
  définis dans `app/globals.css`, utilisés par `StatusBadge`/`InlineAlert`) et `--radius-badge-pill`.
  Le badge de statut de transfert (§5.10, complément demandé après coup) réutilise en plus
  `badge-pastel-blue`/`badge-pastel-red`, déjà existants pour les mêmes raisons.
- Le sélecteur d'entrepôt (§5.8, §6.26) réutilise `--color-green` (état sélectionné, même logique que
  l'item de nav actif de la sidebar, D-16), `--color-border`/`--color-surface-2` (état non
  sélectionné) et `--radius-input` (chips, jamais `rounded-full`, D-08).
- La jauge de crédit (§5.9, §6.27) réutilise **exactement** les tokens et la logique de zone de
  `StockGauge` (`--color-red`/`--color-amber`/`--color-green`, `animate-gauge-fill`, `--gauge-value`)
  — voir D-23 (§10) pour l'inversion de sens des zones (le risque métier est un encours **trop haut**,
  pas un stock trop bas).

Voir §5.6-5.9 (domaine métier) et §6.25-6.27 (composants) pour la spécification complète, et §10
D-21 à D-23 pour les décisions de design non tranchées par le brief.

---

## 4. Deux thèmes, une palette

| | **Espace Admin** (`data-theme="admin"`) | **Espace Agent** (`data-theme="agent"`) |
|---|---|---|
| Contexte d'usage | Bureau/back-office, dashboard, écrans denses | Boutique / extérieur, mobile & tablette, saisie rapide |
| Fond | `#0F1712` (sombre) | `#FFFFFF` (clair) |
| Densité | Tableaux denses, `text-body-sm` toléré en colonnes secondaires | Formulaires larges, `text-body` (16px) partout, jamais de texte < 16px sur un champ de saisie |
| Ombres | Fortes (fond sombre, `rgba(0,0,0,*)`) | Douces (fond clair, `rgba(15,23,18,*)`) |
| Accent (fonds/bordures/icônes) | 6 couleurs de référence, valeurs pleines | 6 couleurs de référence, valeurs pleines — identiques |
| Accent (texte de petite taille) | Couleur pleine (contraste déjà suffisant sur fond sombre) | Variante foncée "700" dédiée (`--color-text-*`), voir §4.2 |

### 4.1 Pourquoi deux jeux de "texte accentué" ?

Sur fond blanc en plein soleil, un texte `#F59E0B` (ambre) ou `#EF4444` (rouge) à 14-16px tombe
largement sous le seuil WCAG AA (4.5:1). Plutôt que d'assombrir globalement la palette (ce qui la
ferait dévier de la référence fixée), la règle est : **les fonds, bordures, icônes et points de
badge gardent toujours la couleur exacte de la palette ; seul le texte de petite taille sur fond
clair utilise une variante foncée dédiée**, définie une fois dans les tokens et jamais recréée à la
main dans un composant.

| Accent | Texte sur fond sombre (Admin) | Texte sur fond clair (Agent) |
|---|---|---|
| Vert | `#16A34A` | `#15803D` (= `--color-green-dk`, déjà un token de référence) |
| Ambre | `#F59E0B` | `#B45309` |
| Rouge | `#EF4444` | `#B91C1C` |
| Bleu | `#2563EB` | `#1D4ED8` |
| Violet | `#7C3AED` | `#6D28D9` |

Ces variantes ne s'utilisent **que** pour du texte/icônes fins (`<text>`, `<svg><path fill>` d'une
icône de statut) — jamais pour un fond de badge, une bordure ou un remplissage de jauge.

---

## 5. Domaine métier → design

Cette section traduit le schéma Supabase (`0001_schema_initial.sql`) en règles visuelles précises.

### 5.1 Statuts de facture (`statut_facture`)

6 valeurs : `brouillon`, `proforma`, `validee`, `payee_partielle`, `payee`, `annulee`.

| Statut | Couleur | Libellé badge | Icône suggérée | Rationale |
|---|---|---|---|---|
| `brouillon` | Neutre (muted/border) | "Brouillon" | crayon | Pas encore engageant, éditable librement par l'agent |
| `proforma` | Ambre | "Proforma" | horloge | Palette de référence : "proforma en attente" = ambre |
| `validee` | Bleu | "Validée" | check-circle | Stock décrémenté, en attente de paiement — état "info", pas alarmant par défaut (voir décision D-01, §10) |
| `payee_partielle` | Violet | "Payée partielle" | demi-cercle | Palette de référence : "paiement partiel" = violet |
| `payee` | Vert | "Payée" | check | Palette de référence : "validation" = vert |
| `annulee` | Rouge | "Annulée" | x-circle | État terminal négatif/bloquant — voir décision D-01, §10 |

Contenu type du badge : point coloré (8px, `background: var(--color-*)`) + libellé court (16px
Agent / 14px admissible en tableau dense Admin) + fond pastel (voir §6.3). Sur `proforma`, un
sous-texte optionnel "Expire le JJ/MM" peut apparaître sous le badge dans la vue détail (calculé
frontend à partir de `entreprise_config.validite_proforma_jours`, pas de nouveau champ DB requis).

### 5.2 Produits "inclus dans un kit" (`type_ligne_produit`, `kit_parent_id`)

Un produit `inclus_dans_kit` (ex. `SV1`, `S-307`, `S-316`) a `prix_unitaire` nul et un
`kit_parent_id` (ex. `HYB1-3`). Règles visuelles :

- **Dans le catalogue produit** : badge secondaire (rectangle `rounded-lg`, pas pill) bleu pastel,
  icône "lien/paquet", texte "Inclus dans [nom du kit parent]" — jamais affiché comme un prix à
  0 FCFA nu (source de confusion "produit gratuit").
- **Sur le produit parent** (`vendu_separement` référencé par au moins un `kit_parent_id`) : badge
  "Kit · N composants" (compte des produits enfants).
- **Sur une ligne de facture** : si le produit ajouté est `inclus_dans_kit`, la colonne prix
  affiche un badge discret **"Inclus"** (fond `surface-2`, texte `muted`) à la place du montant —
  jamais "0 FCFA" en chiffres, qui pourrait être lu comme une erreur de saisie. La quantité reste
  éditable normalement. Le total de la ligne (`total_ligne`) est bien 0 et n'entre pas dans
  `total_ht`, ce que le badge "Inclus" rend visuellement explicite.

### 5.3 Jauge de stock (`quantite_stock` vs `seuil_alerte`)

Barre SVG horizontale, `rounded-full`, animée au montage/à la mise à jour
(`animate-gauge-fill`, 600ms, `--ease-standard`).

**Zones de couleur** (règle absolue : rouge sous le seuil, ambre proche du seuil, vert au-dessus) :

| Zone | Condition | Couleur remplissage |
|---|---|---|
| Rupture / critique | `quantite_stock <= seuil_alerte` | `--color-red` |
| Proche du seuil | `seuil_alerte < quantite_stock <= seuil_alerte × 1.5` | `--color-amber` |
| Sain | `quantite_stock > seuil_alerte × 1.5` | `--color-green` |

> Décision D-02 (§10) : le multiplicateur ×1.5 pour la zone "ambre" est une heuristique purement
> visuelle côté frontend — la base de données ne connaît que le seuil binaire `seuil_alerte`
> (déclenchement `alertes_stock`). Elle donne à l'admin un signal d'anticipation avant que
> l'alerte automatique ne se déclenche réellement.

**Échelle du repère** : `gaugeMax = max(quantite_stock, seuil_alerte × 3, 10)` (heuristique
frontend, aucune colonne "capacité max" en base). Un repère vertical (tick) marque la position de
`seuil_alerte` sur la barre.

**Contenu type** : `quantite_stock` + unité (`unite_produit` : pièce/kit/mètre/rouleau/forfait) en
texte à droite de la barre, monospace, ex. `47 pièces`. Si `quantite_stock <= 0`, remplacer la
jauge par un badge plein "Rupture de stock" (rouge, pill) plutôt qu'une barre quasi invisible.

### 5.4 Autres énumérations métier → composants

| Enum | Valeurs | Composant |
|---|---|---|
| `role_utilisateur` | admin, agent | Badge rôle (rectangle `rounded-lg`) : admin = vert pastel + icône bouclier, agent = bleu pastel + icône utilisateur. Écran "Utilisateurs" (Admin only). |
| `type_client` | particulier, entreprise, cooperative | Badge tag neutre (`surface-2`/`muted`), simple libellé, pas d'accent couleur (information secondaire, pas un état à surveiller). |
| `mode_paiement` | especes, virement, mobile_money, cheque | Icône + libellé dans la liste des paiements (pas de badge coloré — c'est une donnée factuelle, pas un état). |
| `type_mouvement_stock` | entree, sortie, ajustement | Historique mouvements (fiche produit Admin) : entrée = vert + flèche haut, sortie = rouge + flèche bas, ajustement = bleu + icône curseur. |

### 5.5 Montants et numéro de facture

- Tout montant (FCFA) : police monospace, aligné à droite, séparateur de milliers `espace fine`
  (ex. `233 500 FCFA`), jamais de décimales si `.00`, sinon 2 décimales.
- `factures.numero` (format `FP20260802001`) : toujours affiché en police monospace, dans un tag
  neutre (`surface-2`, `rounded-input`), jamais en texte brut au milieu d'une phrase — c'est un
  identifiant, il doit être visuellement scannable et copiable.

### 5.6 Statut crédit client (`statut_credit`) — Phase B

2 valeurs (règles métier 11-14, `0013_avenant_credit_entrepots.sql` §1/7/8) : `en_cours`, `solde`.

| Statut | Couleur | Libellé badge | Rationale |
|---|---|---|---|
| `en_cours` | Ambre | "En cours" | Encours actif nécessitant un suivi quotidien (règle 14 : recouvrement journalier ou mensuel) — état normal et attendu du cycle de vie d'un crédit, pas un incident. Même lecture que `proforma` (§5.1) : "en attente, à surveiller", jamais alarmant par défaut. |
| `solde` | Vert | "Soldé" | État terminal positif — le cumul des remboursements a atteint le montant total (règle 14). |

Décision D-21 (§10) : **jamais rouge**, y compris pour un crédit ancien non remboursé — le rouge
reste réservé aux états bloquants/négatifs (`annulee` en facture, rupture de stock). Si un futur
besoin d'indicateur "en retard" apparaît (le schéma actuel n'a pas de date d'échéance par
remboursement, seulement une `frequence_echeance` informative), il réutilisera le rouge en surcouche
du badge `en_cours` — même mécanique que celle déjà prévue pour `validee`/facture en retard (D-01).

**Composant** : nouveau `CreditStatusBadge`, mirroir exact de `StatusBadge` (§5.1,
`components/ui/StatusBadge.tsx`) — `rounded-pill`, point 8px + libellé + fond pastel (règle absolue
§7). Ne réutilise pas `StatusBadge` tel quel car son type est figé sur `StatutFacture` ; un composant
dédié, même structure, même fichier de config `Record<StatutCredit, {label, pastel, dot}>`, évite de
transformer `StatusBadge` en composant générique multi-domaines (repousserait la limite de lisibilité
d'un seul fichier couvrant plusieurs enums métier sans rapport).

**Contenu type additionnel (vue détail crédit, pas en liste)** : sous-texte optionnel sous le badge,
`text-body-sm muted`, ex. "Solde restant : 45 000 FCFA" (calculé depuis `credits.solde_restant`,
colonne générée en base, aucun calcul frontend requis) — même pattern que le sous-texte "Expire le
JJ/MM" du badge `proforma` (§5.1).

### 5.7 Statut bon de livraison (`statut_bon_livraison`) — Phase B

2 valeurs (règle métier 15) : `livre_non_paye`, `livre_paye`.

| Statut | Couleur | Libellé badge | Rationale |
|---|---|---|---|
| `livre_non_paye` | Ambre | "Livré, non payé" | État de départ de **tout** BL (pas de brouillon, règle 15 : "matérialise un fait physique déjà survenu") — normal et majoritaire tant que le règlement n'est pas encore intervenu, pas un incident en soi. |
| `livre_paye` | Vert | "Livré, payé" | État terminal positif, symétrique à `solde` (§5.6). |

Décision D-21 (§10, même entrée que §5.6) : symétrie volontaire entre crédit et BL — un `en_cours` et
un `livre_non_paye` représentent tous deux "une somme actuellement due, suivie activement" (ambre) ;
`solde` et `livre_paye` représentent tous deux "réglé" (vert). Cette symétrie aide un agent/admin à
lire la même sémantique de couleur sur deux écrans différents sans effort supplémentaire, conforme au
principe directeur §2.4 ("les états métier sont visuels avant d'être textuels").

**Composant** : nouveau `BonLivraisonStatusBadge`, même structure/fichier de config que
`CreditStatusBadge` ci-dessus (mirroir de `StatusBadge`).

**Numéro de BL** (`bons_livraison.numero`, format `BL20260821001`) : même traitement que
`factures.numero` (§5.5) — tag neutre monospace `surface-2`/`rounded-input`, jamais en texte brut.

**Statuts de `transferts_stock`** (`demande`/`en_transit`/`receptionne`/`annule`) : initialement hors
périmètre de cette phase, désormais spécifiés en §5.10 (complément demandé par le coordinateur pour
l'écran "Transferts de stock", Phase C).

### 5.8 Sélecteur d'entrepôt — règle anti-erreur (règle métier 16)

Le multi-entrepôts introduit un risque métier explicite : une mauvaise sélection décrémente le stock
du **mauvais** entrepôt (`factures.entrepot_id`, `bons_livraison.entrepot_id`,
`transferts_stock.entrepot_source_id`/`entrepot_destination_id` sont tous obligatoires et chacun ne
mouvemente que son propre stock, règle 16). Contrainte absolue transmise pour ce composant : **jamais
un `<select>` refermé ou une valeur par défaut silencieuse** — l'entrepôt actif doit rester visible en
permanence pendant toute la saisie.

Spécification complète du composant : §6.26 `EntrepotSelector`. Utilisé sur 3 écrans :
- Formulaire Nouvelle facture / Nouveau bon de livraison (Agent) : **un** sélecteur, "Entrepôt
  source".
- Formulaire de transfert (Admin, règle 16 : demande créée par un agent, progression réservée admin) :
  **deux** sélecteurs simultanés, "Entrepôt source" et "Entrepôt destination", avec exclusion
  croisée visuelle (voir §6.26).

### 5.9 Jauge "Crédit non recouvré vs seuil global" (règle métier 12)

Dashboard Admin. Compare la somme des `solde_restant` de tous les crédits `en_cours` (tous clients
confondus, règle 12) au plafond `entreprise_config.seuil_credit_max`. **Même logique visuelle que la
jauge de stock (§5.3)**, avec les zones **inversées** : pour le stock, le risque est un niveau **bas**
(rouge sous le seuil) ; pour le crédit, le risque est un encours **trop haut** (rouge **au-dessus** du
seuil, règle 12 : aucun nouveau crédit ne peut être ouvert au-delà).

| Zone | Condition | Couleur remplissage |
|---|---|---|
| Seuil atteint / dépassé | `encoursCredit >= seuilCreditMax` | `--color-red` |
| Proche du seuil | `seuilCreditMax × (2/3) <= encoursCredit < seuilCreditMax` | `--color-amber` |
| Sain | `encoursCredit < seuilCreditMax × (2/3)` | `--color-green` |

> Décision D-23 (§10) : l'heuristique ambre `×(2/3)` (~66,7 %) est l'**inverse mathématique exact** du
> multiplicateur `×1.5` déjà utilisé par `StockGauge` (D-02) — `1 / 1.5 = 0.667` — pour garder un seul
> raisonnement de "zone tampon d'un tiers" cohérent entre les deux jauges, simplement appliqué dans le
> sens opposé selon que le risque métier est un manque (stock) ou un excès (crédit).

**Cas particulier — seuil désactivé** (`seuil_credit_max = 0`, valeur par défaut fail-safe documentée
en base, §9 de la migration 0013) : ne jamais afficher une jauge à 0/0 ou une division par zéro.
Afficher à la place un badge neutre `badge-pastel-neutral` "Crédit désactivé — seuil non configuré",
avec un lien vers l'écran Paramètres Admin (cohérent avec le traitement déjà réservé aux états vides
ailleurs dans le système, ex. §6.2 état vide de l'autocomplete).

**Cas particulier — seuil atteint/dépassé** : mirroir exact du traitement `StockGauge` en rupture
(`quantiteStock <= 0`) — remplace la barre par `<Badge tone="red">Seuil de crédit atteint</Badge>`
(composant `Badge` générique §6.4, pas `StatusBadge`, pour rester fidèle au comportement déjà codé de
`StockGauge`, `components/ui/StockGauge.tsx`) plutôt qu'une barre pleine ou débordante.

Spécification complète du composant : §6.27 `CreditGauge`.

### 5.10 Statut transfert de stock (`statut_transfert_stock`) — complément Phase B

4 valeurs (règle métier 16, `0013_avenant_credit_entrepots.sql` §1/4) : `demande`, `en_transit`,
`receptionne`, `annule`. Cycle : `demande` → `en_transit` → `receptionne` (état terminal, cf.
commentaire de migration : "receptionne est un état terminal, pour corriger un transfert déjà
réceptionné, créer un nouveau transfert en sens inverse") ; `annule` atteignable uniquement depuis
`demande` ou `en_transit`, jamais depuis `receptionne`.

| Statut | Couleur | Libellé badge | Rationale |
|---|---|---|---|
| `demande` | Ambre | "Demandé" | Une demande vient d'être créée par un agent et **attend une action admin** (RLS : seul l'admin peut faire progresser un transfert, règle 16) — état actif nécessitant un suivi, même lecture que `en_cours` (crédit, §5.6) et `livre_non_paye` (BL, §5.7) : "quelque chose est en attente de traitement", pas un incident. |
| `en_transit` | Bleu | "En transit" | Le stock a physiquement quitté l'entrepôt source (décrément déjà appliqué) mais n'est pas encore confirmé à l'arrivée — état **normal, informatif, en cours**, sans action requise de l'utilisateur qui consulte l'écran. Même lecture que `validee` (facture, D-01) : transitoire mais pas alarmant. Distinction volontaire avec `demande` (ambre = "il faut agir" vs bleu = "ça avance tout seul, rien à faire pour l'instant"). |
| `receptionne` | Vert | "Réceptionné" | État terminal positif — stock incrémenté côté destination, transfert clos. Symétrique à `payee`/`solde`/`livre_paye`. |
| `annule` | Rouge | "Annulé" | État terminal négatif — même traitement que `annulee` (facture, D-01) : transfert qui ne se conclura jamais normalement. |

> Décision D-24 (§10) : palette calquée sur le raisonnement déjà établi pour les statuts de facture
> (D-01) et de crédit/BL (D-21), pas une nouvelle doctrine — ambre = "en attente d'une action humaine",
> bleu = "en cours, normal, aucune action requise", vert = "terminé avec succès", rouge = "terminé en
> échec/annulation". `en_transit` réutilise délibérément le bleu de `validee` plutôt que l'ambre : les
> deux représentent un état intermédiaire actif et non bloquant du cycle de vie d'un document, jamais
> une file d'attente à traiter.

**Composant** : nouveau `TransfertStatusBadge`, même structure/fichier de config que
`CreditStatusBadge`/`BonLivraisonStatusBadge` (§5.6/§5.7) — mirroir de `StatusBadge`, `rounded-pill`,
point 8px + libellé + fond pastel. Aucune nouvelle classe CSS : réutilise `badge-pastel-amber`,
`badge-pastel-blue`, `badge-pastel-green`, `badge-pastel-red`, déjà tous définis dans
`app/globals.css`.

Spécification complète du composant : §6.28.

---

## 6. Composants de base

Convention : chaque composant liste sa **structure**, ses **états** (default / hover / active /
disabled, + focus si interactif) et un **contenu type**. Les composants ne portent aucune logique
métier — props uniquement.

### 6.1 Boutons

**Variantes** : `primary` (vert, action principale — "Valider", "Enregistrer"), `secondary`
(surface-2, bordure — actions neutres), `outline` (transparent, bordure), `ghost` (transparent, pas
de bordure — actions tertiaires/icônes), `destructive` (rouge — "Annuler la facture", "Supprimer").

**Variante additionnelle `navy`** (ajoutée pour la reproduction de la référence "Ultraleads", bouton
"Filter" et pilules d'action de la barre d'outils dashboard) : fond `navy` plein, texte blanc, même
structure/rayon que `primary` (`rounded-input`, voir D-08 §10 — **pas** de forme pilule malgré la
référence). **Strictement réservée aux actions d'outillage du dashboard Admin** (filtrer, changer de
vue/période) — **ne doit jamais être utilisée pour une action métier principale** : "+ Nouvelle
facture", "Valider la facture", "Enregistrer un paiement" restent `primary` (vert), seul accent de
CTA reconnu dans l'application (voir D-12, §10). Hiérarchie visuelle attendue sur un même écran :
`primary` (vert) > `navy` > `secondary`/`outline` > `ghost`.

> **Mise à jour D-14/D-18.** Ce fond `navy` plein a été pensé pour le dashboard **clair** Ultraleads.
> Depuis le retour au thème sombre (D-14), `navy` sur `--color-bg`/`--color-surface` sombres est
> quasiment invisible (contraste non-texte ≈ 1.2:1, très sous le seuil 3:1). En attendant une
> nouvelle référence visuelle dédiée à cet élément, la variante `navy` **hors sidebar** doit utiliser
> un remplissage `--color-green-dk` (contraste ≈ 3.6:1 sur le nouveau fond) plutôt que `--color-navy`
> — voir §3.7 pour le détail. `--color-navy` reste valide et inchangé uniquement dans la sidebar
> (carte CTA "Besoin d'aide ?", D-15).

**Tailles** : `sm` (36px, contextes denses Admin), `md` (44px, défaut — respecte la cible tactile),
`lg` (52px, actions principales Espace Agent type "Valider la facture").

| État | Traitement |
|---|---|
| Default | Couleur pleine (primary) / bordure `border` (outline) |
| Hover | `transform: scale(1.02)`, `transition: 150ms var(--ease-standard)`, fond légèrement éclairci/assombri selon thème |
| Active (clic) | `scale(0.98)`, pas de transition (feedback instantané) |
| Focus (clavier) | `ring-2 ring-green/20` (même traitement que les inputs) |
| Disabled | Opacité 40%, `cursor: not-allowed`, aucune interaction hover/active |
| Loading | Contenu remplacé par un spinner inline 16px + libellé conservé en `aria-live`, bouton désactivé pendant l'action |

Contenu type : libellé verbe à l'infinitif ("Enregistrer en brouillon", "Valider la facture",
"Enregistrer un paiement"), icône optionnelle à gauche (16-20px).

### 6.2 Inputs

Types couverts : texte, nombre/montant, select, textarea, recherche/autocomplete, téléphone, date,
champ tableau ("chips", pour `adresses`/`telephones` de `entreprise_config`).

**Structure commune** : label (16px, au-dessus, jamais en placeholder seul), champ (`rounded-input`,
bordure `border`, fond `surface`), aide/erreur en dessous (`text-body-sm`, `muted` ou `red-text`).

| État | Traitement |
|---|---|
| Default | Bordure `border`, fond `surface` |
| Hover | Bordure légèrement éclaircie |
| Focus | **Bordure verte + `ring-2 ring-green/20`** (règle absolue) |
| Erreur | Bordure `red`, message d'erreur sous le champ en `red-text`, icône alerte à droite |
| Disabled | Fond `surface-2`, texte `muted`, pas de bordure focus |

Spécificités :
- **Input montant/quantité** : police monospace, alignement à droite du texte saisi, clavier
  numérique forcé sur mobile (`inputMode="decimal"`), pas de flèches natives de `<input type=number>`
  (remplacées par un composant stepper +/- en usage terrain pour éviter les erreurs de scroll
  accidentel).
- **Recherche/autocomplete client & produit** : champ avec icône loupe, liste de résultats en
  dropdown (`z-dropdown`), chaque résultat = ligne 44px min avec libellé principal (nom client /
  nom+code produit) + méta secondaire (téléphone / prix+stock). État vide = message + bouton
  "Nouveau client" inline (voir §6.6 modal). Alerte inline immédiate si quantité saisie > stock
  disponible : bordure ambre + message sous le champ, sans bloquer la saisie (le blocage définitif
  reste serveur, cf. contraintes `dev-frontend-agent`).
- **Champ "chips"** (adresses/téléphones multiples, écran Paramètres Admin) : tags `rounded-input`
  supprimables (icône ×) + input d'ajout en fin de liste, `Enter` ou virgule pour valider un tag.

### 6.3 Cartes

**Stat card** (dashboard Admin) : `rounded-card`, fond `surface`, valeur en `--text-display`
monospace si numérique, libellé `text-body-sm muted` au-dessus, variation optionnelle (badge
vert/rouge + flèche) sous la valeur.

**Carte liste** (client, produit, facture en vue mobile Agent) : `rounded-card`, padding 16px,
titre `text-h3`, méta secondaire `muted`, badge de statut ou jauge en coin.

**Carte produit** (catalogue) : photo (ratio 4:3, `rounded-input` interne), nom, code (monospace,
`muted`), prix (monospace, droite) ou badge "Inclus dans kit" à la place du prix, jauge de stock
compacte.

| État | Traitement |
|---|---|
| Default | `shadow-sm` |
| Hover | `translateY(-2px)` + `shadow-card-hover`, `transition: 200ms ease-out` (règle absolue) |
| Active/sélection | Bordure `green` 2px |

**Fond pastel des badges** (référencé dans plusieurs composants) : `background:
color-mix(in srgb, var(--color-*) 15%, var(--color-surface))`, texte = `var(--color-text-*)` (§4.2),
point = `var(--color-*)` plein.

### 6.4 Badges

- **Badge de statut de facture** (§5.1) : `rounded-badge-pill` obligatoire, point + libellé + fond
  pastel — jamais de texte seul sans point coloré.
- **Badge kit / rôle / catégorie / type client** : `rounded-input` (8px), pas de point obligatoire,
  fond pastel ou `surface-2` selon si l'information est un "état à surveiller" (pastel coloré) ou
  purement descriptive (neutre `surface-2`).
- **Badge stock bas** (liste produits Admin, hors jauge complète) : version compacte `rounded-badge-pill`
  ambre/rouge, point + "Stock bas" / "Rupture".

### 6.5 Jauge de stock

Voir spécification complète §5.3. Composant SVG, `<svg>` avec un `<rect>` de fond `surface-2`
(`rounded-full`), un `<rect>` de remplissage animé (`width` piloté par `--gauge-value`, transition
`animate-gauge-fill`), une ligne verticale fine au niveau du seuil, et un label texte à droite.
Variante compacte (liste) sans label ni tick, juste la barre colorée en aperçu 6px de haut.

### 6.6 Modals

`rounded-modal` (16px), overlay `rgba(0,0,0,0.5)` (les deux thèmes), `z-modal-overlay` /
`z-modal`. Entrée : fade + scale 0.98→1, 200ms `--ease-standard`. Fermeture : `Esc`, clic overlay,
bouton ×.

Usages type :
- **Modal de formulaire rapide** ("Nouveau client" depuis l'écran facturation) : ne doit jamais
  faire perdre le contexte du formulaire de facture en cours — au submit, ferme et réinjecte le
  client créé dans le champ de recherche.
- **Modal de confirmation destructive** (annulation facture, désactivation utilisateur) : icône
  d'alerte rouge, texte expliquant la conséquence exacte (ex. "Le stock sera restauré
  automatiquement"), deux boutons (`outline` "Annuler" / `destructive` "Confirmer").
- **Modal d'ajustement de stock manuel** (Admin) : champ quantité + **motif obligatoire** (texte,
  requis avant activation du bouton de confirmation).

### 6.7 Toasts

**Spécification complète déplacée vers `docs/toast-et-coherence-donnees.md`** (composant partagé
Admin/Agent, diagnostic du bug d'hydratation de `components/ui/Toast.tsx`, API du contexte, timing
précis par variante, règle anti-optimistic-UI, garanties de cohérence des données pour les écrans
Nouvelle facture / Paiement / Ajustement de stock). Résumé rapide, voir le document dédié pour le
détail normatif :

- Position : **coin supérieur droit** (Admin toutes largeurs, Agent `≥ 640px`) ; **exception
  documentée** en bas d'écran sur Agent `< 640px` (au-dessus de la `BottomTabBar`) — voir décision
  D-06, §10.
- Rayon : `rounded-modal` (16px), pas `rounded-input` — voir décision D-07 ci-dessous et §3.3.
  **Confirmation** : `rounded-modal` (16px) est **déjà exactement** l'équivalent Tailwind de
  `rounded-2xl` — aucun ajustement de valeur requis, `components/ui/Toast.tsx` est déjà conforme sur
  ce point dès lors qu'il utilise la classe `rounded-modal` (D-07).
- `z-toast`, entrée `animate-toast-in`. Timing d'affichage (durée visible) : succès 4s, avertissement
  5s, erreur = aucun auto-dismiss (fermeture manuelle uniquement), info 4s sauf état actif non résolu
  (reste affiché) — **axe indépendant** de l'animation d'entrée ci-dessous.
- **Animation d'entrée "spring/bounce-in" (D-20, §3.10)** : `animate-toast-in` utilise désormais
  `--duration-toast` (380ms) et `--ease-spring` (`cubic-bezier(0.34, 1.56, 0.64, 1)`, courbe à
  dépassement/overshoot) au lieu de `200ms`/`--ease-standard`. Le keyframe lui-même (`opacity 0→1` +
  `translateY(8px)→0`) est inchangé : c'est le dépassement de la courbe qui produit la sensation de
  ressort, en CSS pur, sans dépendance JS (pas de framer-motion dans le projet). **Ceci met à jour la
  conclusion "inchangé" de `docs/toast-et-coherence-donnees.md` §3.7** — ce document doit être
  actualisé en conséquence lors d'une prochaine passe sur les toasts.

| Variante | Couleur | Icône | Exemple contenu |
|---|---|---|---|
| Succès | Vert | check | "Facture FP20260802001 validée — stock mis à jour" |
| Erreur | Rouge | **croix** | "Stock insuffisant pour SV1 : 3 disponibles, 5 demandés" |
| Avertissement | Ambre | triangle | "Stock du Spray Tube HYB1-3 sous le seuil (5 restants)" |
| Info | Bleu | i | "Facture proforma FP20260701004 expire dans 3 jours" |

### 6.8 Skeletons

**Jamais de spinner générique.** Chaque skeleton reprend la forme exacte du contenu final (mêmes
dimensions, mêmes rayons), shimmer animé (`animate-shimmer`, dégradé `surface-2` → `border` →
`surface-2`). Exemples : ligne de tableau facture (colonnes numero/client/statut/montant en blocs
gris de largeurs réalistes), stat card (bloc `--text-display` + libellé), carte produit (photo
4:3 + 2 lignes de texte).

### 6.9 Tables (Admin)

En-tête : fond `--color-green-dk`, texte blanc/`--color-text` clair, `text-body-sm` uppercase
tracking, colonnes triables (icône flèche). Ligne : hover `surface-2`, hauteur min 48px. Colonnes
montant : alignées à droite, monospace. Colonne statut : badge pill (§5.1). Pagination en pied de
tableau (§6.13).

### 6.10 Navigation

- **Sidebar Admin** : fond `--color-sidebar-bg` (blanc — seule zone claire de l'écran depuis D-14/
  D-15, §3.7), largeur 260px (collapsible 72px icônes seules), texte `--color-sidebar-text`/
  `--color-sidebar-text-muted`. Item actif = fond `--color-sidebar-active-bg` (vert plein) + texte
  `--color-sidebar-active-text` (blanc), `rounded-input` — remplace le traitement "fond `surface-2` +
  barre verticale verte" et le fond `navy` de D-12, voir D-16 pour le rationale complet. Item inactif
  = transparent, icône + libellé en `--color-sidebar-text-muted`, hover en léger fond
  `color-mix(in srgb, var(--color-green) 8%, var(--color-sidebar-bg))`. Carte CTA "Besoin d'aide ?"
  en bas de sidebar : fond `--color-navy`, texte blanc, `rounded-card` (D-15).
- **Navbar Agent** : fond `surface` (blanc), sticky top, logo + nom agent connecté + bouton
  déconnexion. Sur mobile, actions principales ("Nouvelle facture") accessibles en un tap depuis un
  bouton flottant `primary lg` ou une barre d'onglets basse fixe (à trancher par
  `dev-frontend-agent` selon densité d'écran finale, dans le respect des tokens boutons/nav).
- **Breadcrumbs** (Admin, fiches détail) : `text-body-sm muted`, séparateur `/`, dernier élément en
  `text-text`.
- **Tabs** (fiche produit : mouvements / historique ventes) : soulignement `green` 2px sur l'onglet
  actif, transition 150ms.

### 6.11 Alertes inline (bannières)

Bloc `rounded-input`, bordure gauche 3px de la couleur sémantique, fond pastel, icône + texte.
Usage principal : alerte stock insuffisant sur une ligne de facture en cours de saisie (ambre si
proche, rouge si dépassement), ou bannière "Facture proforma expire bientôt" (ambre) en tête de
détail facture.

### 6.12 Avatar / menu utilisateur

Cercle `rounded-full` 36px, initiales sur fond `surface-2`, menu déroulant (`z-dropdown`) avec nom,
rôle (badge §6.4), lien profil, déconnexion.

### 6.13 Pagination

Boutons `ghost` numérotés + précédent/suivant, page active = fond `green` pastel + texte `green-text`
en gras. Sur mobile Agent, préférer un scroll infini ou "Charger plus" plutôt qu'une pagination
numérotée classique (moins de zones cliquables précises requises).

### 6.14 Upload photo produit

Zone drag & drop `rounded-card`, bordure pointillée `border`, icône image + texte "Glissez une
photo ou cliquez pour parcourir". Aperçu en grille (max 4 photos/produit selon `photos_urls`),
chaque vignette avec bouton suppression au survol.

### 6.15 Graphiques (Recharts, Admin)

Palette de séries : vert (série principale, ex. ventes), bleu (secondaire), ambre (alerte/seuil),
violet (comparatif). Grille `border` en pointillés fins, axes `muted`, tooltip = carte `surface`
`rounded-input` `shadow-md`. Aucune couleur hors palette de référence.

### 6.16 Aperçu facture (détail Admin, fidèle au PDF)

Layout deux colonnes desktop : en-tête entreprise (logo, adresses multiples, téléphones) + bloc
client + tableau lignes (avec vignette photo produit 32px si disponible, badge "Inclus" pour les
lignes kit) + totaux alignés à droite (HT, forfait transport, TVA si `tva_taux > 0`, total général
en évidence `text-h2` monospace) + zone tampon/signature + mentions légales/bancaires en pied de
page. Bouton "Enregistrer un paiement" en position fixe/sticky si la facture est `validee` ou
`payee_partielle`.

### 6.17 Bascule segmentée (`SegmentedControl`)

Nouveau composant (absent de la Phase 2), introduit pour reproduire la bascule "2h / 3h / A Week /
Month" et "Customer Satisfaction / Visitor Insight" de la référence "Ultraleads" — **Admin
uniquement**, réservé aux widgets de dashboard (bascule de période/vue). Ne remplace pas les
`<select>` (§6.2) ni les `Tabs` (§6.10), qui restent pour la navigation d'une fiche détail.

**Structure** : conteneur `inline-flex`, fond `surface-2`, `rounded-input` (8px — voir D-08 §10,
**jamais** `rounded-full` malgré la pilule pleine de la référence), padding `4px`, `gap: 2px` entre
options. Chaque option est un `<button>` interne, également `rounded-input`, padding `8px 16px`,
`text-body-sm` (contexte dense Admin).

| État | Traitement |
|---|---|
| Option inactive (défaut) | Fond transparent, texte `muted`, `font-medium` |
| Option inactive, hover | Texte `text` (pas de changement de fond, pour éviter un double niveau de fond dans un conteneur déjà `surface-2`) |
| Option active | Fond `navy` plein, texte blanc, `font-semibold`, `transition: background-color 150ms var(--ease-standard)` (même timing que la règle bouton, §7) |
| Focus clavier (option) | `ring-2 ring-green/20`, comme tout élément interactif (§6.1) |
| Disabled | Opacité 40%, `cursor: not-allowed` |

**Contenu type** : 2 à 4 options texte court — ex. `Semaine · Mois · Année` (période d'un graphique
dashboard) ou `Vue clients · Vue produits` (angle d'un widget). Props suggérées : `options:
{value, label}[]`, `value`, `onChange` — aucune logique métier, le composant restitue uniquement
l'option sélectionnée à l'appelant.

### 6.18 Jauge radiale (`RadialGauge`)

Nouveau composant, **complémentaire** à `StockGauge` (§6.5) — **ne le remplace pas**. Reproduit la
jauge demi-cercle "Customers Volume" de la référence.

**Différence de domaine avec `StockGauge` (voir D-10, §10)** :
- `StockGauge` = jauge **sémantique**, linéaire, couleur rouge/ambre/vert **dictée par le seuil de
  stock** (§5.3) — reste l'unique composant représentant un niveau de stock produit.
- `RadialGauge` = jauge **décorative/informative**, demi-cercle, dégradé `--color-accent-start` →
  `--color-accent-end` (§3.5), **sans signification d'alerte**. Réservée à des KPI dashboard Admin
  agrégés n'ayant pas de seuil critique binaire : "Nouveaux clients (30 derniers jours)", "Taux de
  factures payées à l'échéance", "Part du catalogue actif", etc. **Ne jamais l'utiliser pour un
  niveau de stock** — `StockGauge` doit rester le seul langage visuel du stock.

**Structure** : `<svg>` carré, arc de 180° (demi-cercle, ouverture vers le bas), composé de **28 à
32 bâtonnets radiaux** (bouts arrondis, `stroke-linecap: round`) répartis à intervalle régulier sur
l'arc, pointant du centre vers l'extérieur. Épaisseur : 3px (`sm`) / 4px (`md`) / 5px (`lg`).
Longueur : ~18% du rayon.

- Bâtonnets **inactifs** (au-delà de `value/max`) : `--color-border` à 60% d'opacité.
- Bâtonnets **actifs** (dans la proportion `value/max`, en partant de l'extrémité gauche de l'arc) :
  couleur interpolée linéairement entre `--color-accent-start` (premier bâtonnet actif) et
  `--color-accent-end` (dernier bâtonnet actif, ou fin d'arc si `value = max`) selon la position
  d'index — jamais une couleur unique plaquée sur l'ensemble des bâtonnets actifs. Le calcul
  d'interpolation par segment est une responsabilité d'implémentation, hors périmètre de ce document.
- **Animation au montage** : apparition en cascade des bâtonnets actifs (`stagger` ~15ms/bâtonnet)
  ou scale radial 0→1, durée totale 600-800ms, `--ease-standard` (mouvement radial, distinct de
  `animate-gauge-fill` qui anime une largeur).

**Centre du demi-cercle** : valeur en `--text-display-lg` (40px, §3.2), `font-bold`, `color-text` ;
libellé en dessous `text-body-sm muted` (casse normale, pas de majuscules forcées — écart assumé vs
la référence, pour rester cohérent avec `--text-caption` déjà réservé aux eyebrows, §3.2).

**Tailles** : `sm` (120px de diamètre, listes compactes), `md` (160px, défaut dashboard), `lg`
(200px, carte dédiée pleine largeur).

### 6.19 Menu contextuel de carte (`CardMenu`, bouton "…")

Nouveau pattern (absent de la Phase 2), reproduisant le bouton "…" en coin supérieur droit des
cartes stat/widget de la référence.

**Restriction de périmètre** : **Espace Admin uniquement** (desktop, cartes dashboard/catalogue) —
jamais sur Espace Agent, dont les cartes visent un tap unique vers le détail (client/produit/
facture), cohérent avec le principe directeur "saisie rapide" (§2).

**Structure** : bouton `ghost` icône seule (icône "trois points verticaux", ex. `MoreVertical` de
`lucide-react`, 16-18px), taille 32×32px (déroge à `--tap-target-min` 44px car contexte desktop
Admin uniquement — jamais utilisé dans une zone tactile), positionné en absolu dans le coin
supérieur droit du header de carte (`top`/`right` : `--space-3` ou `--space-4` selon le padding de
la carte). Ouvre un menu déroulant ancré à droite (`rounded-input`, pas `rounded-modal` — dropdown
contextuel léger, pas un panneau de la taille d'un modal), `shadow-md`, `z-dropdown`.

| État (bouton déclencheur) | Traitement |
|---|---|
| Default | Transparent, icône `muted` |
| Hover | Fond `surface-2`, icône `text` |
| Active (menu ouvert) | Fond `surface-2` maintenu tant que le menu reste ouvert |
| Focus clavier | `ring-2 ring-green/20` |

**Contenu type du menu** : actions contextuelles courtes (`Modifier`, `Dupliquer`, `Exporter`),
items 44px min de hauteur (la dérogation tactile ne concerne que le bouton déclencheur 32px, pas le
menu déroulant lui-même), séparateur avant une action destructive (`Supprimer`, texte `red-text`).
**Règle d'accessibilité** : une action placée dans ce menu doit rester secondaire/de confort — une
action métier critique ne doit jamais être accessible uniquement via ce menu si elle existe déjà
ailleurs dans l'interface (fiche détail, ligne de tableau).

### 6.20 Badge de variation (tendance, `+22%` / `-1%`)

Ne crée pas de nouveau composant : réutilise `Badge` (§6.4) avec `tone="green"` (variation positive)
ou `tone="red"` (variation négative), préfixé d'une flèche/icône (`▲`/`▼` ou `TrendingUp`/
`TrendingDown`). Reste en `rounded-badge` (8px), **pas `rounded-full`** malgré l'apparence pilule de
la référence (voir D-08, §10). Ce badge **n'est pas** un badge de statut de facture et ne doit
jamais apparaître sur une ligne/carte de facture, pour ne pas être confondu avec `StatusBadge`
(§5.1) : usage réservé aux cartes/widgets de KPI agrégés du dashboard, jamais au domaine facture.

### 6.21 Éléments de la référence déjà couverts (aucun nouveau composant requis)

Pour éviter toute réinvention, les éléments suivants de la capture "Ultraleads" se composent avec
des patterns déjà spécifiés — aucune nouvelle entrée n'était nécessaire :

- **Dropdowns "Default View ▾" / "Weekly ▾"** : `<select>`/dropdown standard (§6.2), `rounded-input`.
- **Bouton icône rond "Export"** : `Button` variant `ghost` ou `outline`, taille `sm`, icône seule
  (§6.1) — `rounded-input`, pas de forme ronde dédiée (D-08, §10).
- **Bloc avatar + nom + rôle empilés (topbar)** : `Avatar / menu utilisateur` (§6.12), déjà couvert
  (cercle + nom/rôle empilés, menu déroulant).
- **Carte "liste avatar + texte + badge pastel de ville"** (type "Most Order by Country") :
  composition de `Carte liste` (§6.3) + `Badge` pastel (§6.4) — aucun nouveau composant, juste un
  exemple d'assemblage pour un futur widget "Dernières activités"/"Zones de livraison" si le besoin
  se présente.

### 6.22 `DonutChart` ("Statistique Produit")

Nouveau composant, introduit avec le retour au thème sombre "neon green" (D-14). **Admin
uniquement**, carte vedette du dashboard (`rounded-card-lg`, §3.6).

**Structure** : layout deux zones côte à côte (desktop ; empilé verticalement `< md`, §9) —

1. **Donut SVG** (anneau, pas de camembert plein), diamètre 160-180px, épaisseur de trait 18-20px
   (`stroke-linecap: round` sur chaque segment). Le segment principal (catégorie dominante, ou valeur
   agrégée si une seule série) utilise `--gradient-hero` appliqué le long du tracé (`stroke` en
   dégradé via `<linearGradient>` SVG référençant `--color-hero-start`/`--color-hero-end`) — c'est le
   seul composant, avec la stat héro, autorisé à utiliser ce dégradé. Les segments secondaires
   (autres catégories) utilisent, dans l'ordre, `--color-agent-ring-1` à `-5` (§3.9) pour rester dans
   une famille de teintes cohérente sans jamais sortir de la palette. Piste de fond (portion non
   remplie) : `--color-surface-2`. Centre du donut : valeur totale en `--text-display` monospace,
   libellé `text-body-sm` `muted` en dessous (même traitement que `RadialGauge`, §6.18, mais donut
   complet plutôt que demi-cercle).
2. **Légende** à droite (ou en dessous < md) : liste verticale, chaque ligne = puce carrée 10px
   (`rounded-badge`, 2px) de la couleur du segment correspondant + libellé catégorie (`text-body`) +
   valeur/pourcentage aligné à droite (monospace, `text-body-sm`).

| État | Traitement |
|---|---|
| Default | Segments statiques |
| Hover (sur un segment ou une ligne de légende) | Le segment survolé passe en opacité 100%, les autres descendent à 50% (mise en évidence croisée légende ↔ donut), `transition: opacity 150ms var(--ease-standard)` |
| Loading | Skeleton en anneau gris (forme exacte du donut, `animate-shimmer`, §6.8) + 3-4 lignes de légende skeleton |

**Animation au montage** : remplissage progressif de chaque segment (`stroke-dasharray` animé de 0 à
sa valeur finale), 600-800ms, `--ease-standard`, en cascade (`stagger` ~80ms entre segments) — cohérent
avec l'esprit de `RadialGauge` (§6.18).

### 6.23 `WeeklySalesBarChart`

Nouveau composant Recharts (Admin, §6.15). Graphique en barres groupées, deux séries par période
(jour/semaine) : CA facturé vs CA encaissé.

| Série | Token | Valeur | Signification |
|---|---|---|---|
| Série 1 (vert clair) | `--color-chart-serie-1` | `#16A34A` (`--color-green`) | CA **facturé** |
| Série 2 (vert foncé) | `--color-chart-serie-2` | `#15803D` (`--color-green-dk`) | CA **encaissé** |

**Structure** : barres verticales groupées par paire (facturé/encaissé côte à côte), `rounded`
uniquement sur les coins supérieurs des barres (~3-4px, valeur d'implémentation Recharts, pas un
token dédié — les rayons de carte/input/badge du système ne s'appliquent pas aux barres de
graphique). Grille horizontale en pointillés fins `--color-border`, axes `--color-muted`, tooltip =
carte `--color-surface` `rounded-input` `shadow-md` (cohérent §6.15) affichant les deux valeurs +
leur écart (facturé − encaissé = reste à encaisser). Légende sous le graphique : deux puces carrées
(mêmes couleurs que les séries) + libellés "CA facturé" / "CA encaissé".

| État | Traitement |
|---|---|
| Default | Barres pleines |
| Hover (sur une paire) | Tooltip carte apparaît, barres de la paire survolée légèrement éclaircies (`opacity` ou `brightness` +10%), les autres paires restent inchangées |
| Loading | Skeleton = silhouette de barres de hauteurs variables réalistes (`animate-shimmer`, jamais de spinner, §6.8) |

Cette paire de couleurs ne doit **jamais** être réutilisée pour représenter un statut de facture
(§5.1, palette figée et disjointe) : c'est une lecture purement financière agrégée (facturé vs
encaissé), pas un état de cycle de vie de facture individuelle.

### 6.24 `NestedRadialProgress` ("Répartition par Agent")

Nouveau composant, cercles concentriques imbriqués représentant la part de chiffre d'affaires (ou de
factures) de chaque agent. **Admin uniquement**, carte dashboard.

**Structure** : `<svg>` carré, un anneau `<circle>` par agent (jusqu'à 5, voir palette ci-dessous),
tous centrés, rayons décroissants du bord vers le centre.

- **Épaisseur de trait** : 8px pour chaque anneau, constante quel que soit le nombre d'agents (ne
  jamais faire varier l'épaisseur selon le nombre de séries — casserait la lisibilité comparative).
- **Espacement entre anneaux** : 6px entre le bord intérieur d'un anneau et le bord extérieur du
  suivant (`rayon(N+1) = rayon(N) - épaisseur(8px) - espacement(6px)`), soit un pas de 14px entre
  deux rayons consécutifs. Anneau le plus externe = diamètre total du composant (`sm` 120px / `md`
  160px / `lg` 200px, mêmes paliers que `RadialGauge`, §6.18, pour cohérence d'échelle sur le
  dashboard) moins la moitié de son épaisseur.
- **Chaque anneau** : piste de fond `--color-surface-2` (cercle complet), arc de progression
  (`stroke-dasharray`, partant de 12h, sens horaire, `stroke-linecap: round`) coloré selon la teinte
  de l'agent.
- **Attribution des couleurs** : séquence fixe et documentée de 5 teintes vert/teal dérivées de la
  palette (§3.9), jamais de couleur choisie librement hors de cette liste —

  | Rang | Token | Valeur |
  |---|---|---|
  | Agent 1 (anneau le plus externe) | `--color-agent-ring-1` | `#16A34A` |
  | Agent 2 | `--color-agent-ring-2` | `#4ADE80` |
  | Agent 3 | `--color-agent-ring-3` | `#15803D` |
  | Agent 4 | `--color-agent-ring-4` | `#2DD4BF` |
  | Agent 5 (anneau le plus interne) | `--color-agent-ring-5` | `#0D3320` |

  Les agents sont assignés dans l'ordre décroissant de leur valeur (CA ou nombre de factures) à ce
  jeu de 5 couleurs, de l'anneau le plus externe (rang 1, valeur la plus haute) vers le plus interne.
  **S'il y a plus de 5 agents actifs** : n'afficher que le top 5 sur le composant + une ligne
  "Autres agents (N)" agrégée dans la légende (couleur `--color-muted`, pas de nouvel anneau) — ne
  jamais introduire une 6ᵉ teinte arbitraire sans repasser par `designer-ui-ux` pour étendre la
  séquence `--color-agent-ring-*` de façon contrôlée.
- **Centre** : nom/valeur de l'agent en tête (rang 1) en `--text-h3` + valeur, ou un total agrégé si
  le composant sert de vue d'ensemble — à trancher par l'agent frontend selon le contexte d'usage
  exact, dans le respect de la hiérarchie typographique §3.2.
- **Légende** : liste sous ou à côté du composant (même pattern que `DonutChart`, §6.22), puce ronde
  8px de la couleur de l'anneau + nom agent + valeur alignée à droite (monospace).

**Animation au montage** : chaque anneau se remplit en cascade de l'extérieur vers l'intérieur
(`stagger` ~120ms entre anneaux), 600ms par anneau, `--ease-standard` — cohérent avec le principe
"jamais de spinner générique, toujours une animation qui épouse la forme finale" (§6.8/§7).

### 6.25 `CreditStatusBadge` / `BonLivraisonStatusBadge` — Phase B

Voir spécification complète §5.6 (crédit) et §5.7 (bon de livraison). Deux composants distincts,
mirroir structurel exact de `StatusBadge` (§5.1) : `rounded-pill`, point 8px + libellé + fond pastel
(`badge-pastel-amber`/`badge-pastel-green`, déjà définis dans `app/globals.css`, aucune classe CSS
nouvelle requise).

```
CreditStatusBadge({ statut: "en_cours" | "solde" })
BonLivraisonStatusBadge({ statut: "livre_non_paye" | "livre_paye" })
```

Ces deux composants dépendent des types Supabase `StatutCredit`/`StatutBonLivraison` (générés depuis
les enums `statut_credit`/`statut_bon_livraison` de la migration 0013) — génération et câblage aux
données réels : hors périmètre de cet agent (Phase C, `dev-frontend-admin`/`dev-frontend-agent`).

### 6.26 `EntrepotSelector` — Phase B

Nouveau composant, réponse directe à la contrainte métier §5.8 (règle 16) : **jamais de dropdown
refermé, jamais de valeur par défaut invisible**. Utilisé sur le formulaire Nouvelle facture, Nouveau
bon de livraison (Agent) et le formulaire de transfert (Admin).

**Ce que ce composant n'est PAS** : pas un `<select>` (§6.2 — un `<select>`, même stylé, reste fermé
par défaut et n'affiche la sélection qu'en un point unique et discret) ; pas non plus une réutilisation
de `SegmentedControl` (§6.17), explicitement restreint à l'Espace Admin et aux widgets de dashboard
non critiques (bascule de période/vue) — `EntrepotSelector` est un **champ de formulaire à risque
métier**, utilisé aussi côté Agent, ce qui justifie un composant dédié plutôt qu'un élargissement du
périmètre de `SegmentedControl`.

**Structure** : rangée de "chips" (`<button type="button">`), une par entrepôt actif
(`entrepots.actif = true` — un entrepôt désactivé n'apparaît jamais dans ce sélecteur, décision D-22),
**toutes rendues simultanément, aucune repliée derrière un menu**. `flex flex-wrap gap-2` : passage à
la ligne suivante si l'espace manque (mobile Agent), jamais de troncature du nom de l'entrepôt ni de
scroll horizontal caché qui masquerait une option. Icône `Warehouse`/`Building2` (`lucide-react`,
18-20px) à gauche du libellé dans chaque chip, pour un repérage au premier coup d'œil (principe
directeur §2.4).

- **Label du champ** : toujours affiché au-dessus (`text-body` 16px, jamais en placeholder seul —
  même règle que tout input, §6.2), ex. "Entrepôt source", "Entrepôt destination".
- **Chip** : `rounded-input` (8px — jamais `rounded-full`, D-08), padding `12px 16px`, hauteur
  minimale `--tap-target-min` (44px) côté Agent, 40px toléré côté Admin desktop dense.

| État (chip) | Traitement |
|---|---|
| Non sélectionné | Fond `surface`, bordure `border` 1px, texte `text`, icône `muted` |
| Sélectionné | Fond `--color-green` plein, texte blanc, icône blanche, `font-semibold` — même logique que l'item de nav actif de la sidebar (D-16) : indiquer un **état** ("c'est ici que vous travaillez"), pas une action, ce qui reste cohérent avec D-12 (le vert plein CTA n'est pas dilué par cet usage) |
| Hover (non sélectionné) | Bordure `green` légèrement teintée, `transform: scale(1.02)` 150ms `--ease-standard` — traitement bouton standard (§7), un chip de sélection reste un bouton |
| Focus clavier | `ring-2 ring-green/20` |
| Exclu (formulaire de transfert uniquement, voir plus bas) | Opacité 40%, `cursor: not-allowed`, aucun hover |
| Skeleton (chargement liste entrepôts) | Shimmer à la forme exacte des chips (largeurs variables réalistes), jamais de spinner (§6.8) |

**Défaut autorisé, mais jamais invisible (décision D-22, §10)** : un entrepôt peut être pré-sélectionné
à l'ouverture du formulaire (ex. dernier entrepôt utilisé par l'agent, ou entrepôt unique s'il n'y en a
qu'un) **à condition que ce défaut soit rendu par ce même composant toujours visible** — le chip
correspondant apparaît déjà en vert plein au montage. Ce qui reste strictement interdit : une valeur
portée par un champ cadré/masqué (ex. `<select>` avec une `value` déjà choisie derrière un libellé
générique "Entrepôt"), où l'utilisateur pourrait valider le formulaire sans avoir consciemment vu ni
confirmé le choix.

**Confirmation redondante au point de validation** (mitigation supplémentaire du risque métier, non
optionnelle) : le libellé du bouton de soumission du formulaire, ou une légende juste au-dessus,
rappelle explicitement l'entrepôt actif — ex. "Valider la facture — Entrepôt : Dakar". Cette
redondance n'est **pas** un simple confort visuel : elle donne une dernière occasion de repérer une
mauvaise sélection avant l'action qui décrémente réellement le stock.

**Sélection obligatoire avant soumission** : si aucun chip n'est sélectionné (uniquement possible si
le formulaire ne propose délibérément aucun défaut, ex. transfert), le bouton de soumission reste
`disabled` (§6.1) et une `InlineAlert` (§6.11) tone `amber` apparaît sous le sélecteur : "Sélectionnez
un entrepôt avant de continuer."

**État vide** (aucun entrepôt configuré — uniquement possible avant qu'un admin n'en crée un, edge
case d'initialisation) : `InlineAlert` tone `red`, "Aucun entrepôt configuré — contactez un
administrateur", formulaire entier désactivé (aucune facture/BL/transfert ne peut être créé sans
entrepôt, contrainte `NOT NULL` en base de toute façon).

**Cas du formulaire de transfert (Admin) : deux sélecteurs, exclusion croisée visuelle.** La base
impose `entrepot_source_id <> entrepot_destination_id` (contrainte `transferts_stock_source_
destination_distincts`, migration 0013 §4). Pour donner ce retour **avant** l'échec serveur (même
philosophie que l'alerte de stock insuffisant en cours de saisie, §6.2) : dès qu'un entrepôt est
sélectionné dans "Entrepôt source", le chip correspondant passe en état **Exclu** dans le sélecteur
"Entrepôt destination" (et réciproquement) — grisé, non cliquable, plutôt que de laisser l'utilisateur
choisir une paire invalide puis découvrir l'erreur au clic sur "Créer la demande de transfert".

**Indice de stock optionnel (`stockHint`)** : lorsque l'écran porte déjà sur un produit précis (ex.
formulaire de transfert, où un produit est choisi avant l'entrepôt), chaque chip peut afficher une
seconde ligne compacte sous le libellé — `text-caption` monospace `muted`, ex. "12 en stock" — lue
depuis `stock_entrepot` pour ce couple (produit, entrepôt). Ce texte est un indice, jamais un
blocage : la validation réelle reste serveur. Prop optionnelle, absente sur les écrans où aucun
produit unique n'est encore déterminé (ex. en-tête de facture avant toute ligne ajoutée).

**Positionnement** : `sticky top-[hauteur navbar/topbar]` (`z-sticky`), en tête du formulaire — reste
visible pendant le défilement d'un formulaire long (facture/BL à plusieurs lignes), pour qu'il ne soit
jamais nécessaire de remonter en haut de page pour vérifier l'entrepôt actif avant de valider.

### 6.27 `CreditGauge` — Phase B

Voir spécification complète §5.9. **Complémentaire à `StockGauge` (§6.5)**, pas un remplacement — même
principe de séparation des domaines déjà appliqué entre `StockGauge` et `RadialGauge` (D-10) :
`CreditGauge` reste le seul langage visuel de l'encours de crédit global, jamais réutilisé pour un
niveau de stock, et réciproquement `StockGauge` ne représente jamais un encours financier.

**Implémentation** : reprend **à l'identique** la structure SVG de `StockGauge`
(`components/ui/StockGauge.tsx` — `<rect>` de fond `surface-2` + `<rect>` de remplissage animé
`animate-gauge-fill`/`--gauge-value`, tick vertical au niveau du seuil, `rounded-pill`), avec les
substitutions suivantes :

| `StockGauge` | `CreditGauge` |
|---|---|
| `quantiteStock` | `encoursCredit` (somme des `solde_restant`, calcul hors périmètre design) |
| `seuilAlerte` | `seuilCreditMax` (`entreprise_config.seuil_credit_max`) |
| Zone rouge = `quantiteStock <= seuilAlerte` | Zone rouge = `encoursCredit >= seuilCreditMax` (**sens inversé**, voir D-23) |
| Zone ambre = `<= seuilAlerte × 1.5` | Zone ambre = `< seuilCreditMax` et `>= seuilCreditMax × (2/3)` |
| `gaugeMax = max(quantiteStock, seuilAlerte×3, 10)` | `gaugeMax = max(encoursCredit, seuilCreditMax) × 1.1` (garde une marge visuelle après le tick de seuil, y compris si `encoursCredit` dépasse `seuilCreditMax`) |
| Rupture (`<= 0`) → `<Badge tone="red">Rupture de stock</Badge>` | Seuil atteint (`>= seuilCreditMax`) → `<Badge tone="red">Seuil de crédit atteint</Badge>` |
| Label : quantité + unité, monospace | Label : `encoursCredit` **FCFA** sur `seuilCreditMax` **FCFA**, monospace, aligné à droite (§5.5) ; légende secondaire optionnelle `text-caption muted` : pourcentage du seuil (ex. "72 % du seuil") |
| — | Cas `seuilCreditMax = 0` → badge neutre "Crédit désactivé — seuil non configuré" (voir §5.9), jamais de jauge à 0/0 |

**Placement** : widget KPI du dashboard Admin (`StatCard`-like, carte dédiée dans la grille de
synthèse), variante `compact` réutilisable dans le formulaire Agent "Nouveau crédit" (à côté du champ
montant) pour donner un signal visuel immédiat — sans bloquer la saisie, le blocage réel restant le
trigger serveur `bloquer_nouveau_credit()` — avant que l'agent ne découvre un rejet au clic sur
"Enregistrer". Cohérent avec le pattern déjà en place pour l'alerte stock/quantité (§6.2).

### 6.28 `TransfertStatusBadge` — complément Phase B

Voir spécification complète §5.10. Troisième badge de statut de la famille Phase B (après
`CreditStatusBadge`/`BonLivraisonStatusBadge`, §6.25), même structure exacte, même mirroir de
`StatusBadge` (§5.1) : `rounded-pill`, point 8px + libellé + fond pastel, aucune nouvelle classe CSS.

```
TransfertStatusBadge({ statut: "demande" | "en_transit" | "receptionne" | "annule" })
```

**Écran cible** : "Transferts de stock" (Admin, Phase C) — colonne statut d'une liste/tableau
(§6.9, en-tête `--color-green-dk`) et vue détail d'un transfert. Dépend du type Supabase
`StatutTransfertStock` (généré depuis l'enum `statut_transfert_stock` de la migration 0013) —
génération et câblage aux données réels : hors périmètre de cet agent (Phase C).

**Point de vigilance pour `dev-frontend-admin`** : `annule` n'est atteignable, côté base, que depuis
`demande` ou `en_transit` (jamais depuis `receptionne`, état terminal) — l'action "Annuler" de
l'interface doit donc être masquée/désactivée dès qu'un transfert affiche le badge `receptionne`,
pour ne jamais proposer une action que le serveur rejettera systématiquement (même principe que
"aucune action métier critique ne doit être accessible sans qu'elle ne soit valide dans le contexte
affiché", cf. §6.19).

---

## 7. Micro-interactions (règles absolues)

Ces règles, fixées en amont, s'appliquent **sans exception ni variante locale** :

- Boutons : `transform: scale(1.02)` au survol, `transition: 150ms cubic-bezier(0.25,0.46,0.45,0.94)`.
- Cartes : `transform: translateY(-2px)` + ombre renforcée au survol, `transition: 200ms ease-out`.
- Inputs : bordure verte au focus + `ring-2 ring-green/20`.
- Badges de statut : toujours `rounded-full` + point coloré + fond pastel.
- Jauge de stock : barre SVG animée, rouge sous le seuil, ambre proche du seuil, vert au-dessus.
- Skeletons : shimmer animé à la forme exacte du contenu — jamais de spinner générique.
- Montants : toujours alignés à droite, police monospace, séparateur de milliers.
- Rayons : `rounded-lg` (8px) inputs/badges génériques, `rounded-xl` (12px) cartes, `rounded-2xl`
  (16px) modals ; exception badges de statut = `rounded-full`.

---

## 8. Accessibilité & lisibilité terrain

- Corps de texte : 16px minimum partout sur Espace Agent. Sur Espace Admin, `text-body-sm` (14px)
  toléré uniquement pour des colonnes secondaires de tableaux denses (jamais montants/statuts/
  quantités, qui restent en 16px).
- Contraste texte : cible AA (≥ 4.5:1) pour tout texte < 18px ou < 14px gras. Voir §4.2 pour les
  variantes de texte accentué sur fond clair.
- Cibles tactiles : 44×44px minimum pour tout élément interactif sur Espace Agent (boutons,
  résultats d'autocomplete, cases à cocher).
- États de focus toujours visibles au clavier (`ring-2 ring-green/20`), jamais supprimés par un
  `outline: none` sans remplacement.
- Ne jamais coder une information uniquement par la couleur : chaque badge de statut porte aussi un
  libellé texte et, pour la jauge de stock, une valeur chiffrée.

---

## 9. Breakpoints responsive

| Nom | Largeur | Usage |
|---|---|---|
| `xs` | 360px | Plus petit mobile terrain supporté (contrainte explicite `dev-frontend-agent`) |
| `sm` | 640px | Mobile large |
| `md` | 768px | Tablette portrait — usage fréquent en boutique |
| `lg` | 1024px | Tablette paysage / petit desktop |
| `xl` | 1280px | Desktop Admin standard |

Espace Agent : conçu mobile-first (xs → sm → md), le desktop est secondaire. Espace Admin : conçu
desktop-first (lg → xl), avec repli mobile acceptable mais non prioritaire (consultation
occasionnelle uniquement).

---

## 10. Journal des décisions

Décisions tranchées par `designer-ui-ux` pour des cas non explicitement couverts par la palette de
référence ou les règles de micro-interactions fournies :

**D-01 — Couleur du statut `annulee` vs `validee`.** La palette de référence associe le rouge à
"rupture de stock, facture impayée", ce qui pourrait suggérer que `validee` (facture validée, stock
décrémenté, aucun paiement encore reçu) soit rouge. Décision : `validee` reste **bleu** (info,
neutre) car c'est un état normal du cycle de vie, pas un incident — la majorité des factures y
transitent brièvement avant paiement immédiat (`modalites_reglement` = "Règlement 100% à la
commande"). Le rouge est réservé au statut **terminal négatif** `annulee`. L'usage "facture
impayée" du rouge dans la palette de référence est conservé comme point d'extension future : si un
indicateur "en retard de paiement" (basé sur une date d'échéance, non présente dans le schéma
actuel) est ajouté plus tard, il réutilisera le rouge en surcouche du badge `validee` (ex. petit
point rouge clignotant en coin), sans changer la couleur de base du badge de statut.

**D-02 — Zone "ambre" de la jauge de stock.** Le schéma ne stocke qu'un seuil binaire
(`seuil_alerte`). Décision : zone ambre = `seuil_alerte < quantite_stock <= seuil_alerte × 1.5`,
heuristique purement visuelle frontend, sans impact sur le déclenchement réel des `alertes_stock`
(qui reste strictement `quantite_stock <= seuil_alerte`, régle métier 6 de la base).

**D-03 — Texte accentué sur fond clair.** Les 6 couleurs de référence appliquées telles quelles en
texte fin sur fond blanc échouent au contraste AA (notamment l'ambre, ~2.2:1). Décision : variantes
foncées dédiées, uniquement pour le texte/icônes de petite taille en thème Agent, jamais pour les
fonds/bordures/points de badge (voir §4.2). Le vert utilise directement `--color-green-dk`, déjà un
token de la palette de référence — aucune couleur nouvelle introduite pour cette teinte.

**D-04 — Affichage des lignes de facture "inclus dans un kit".** Décision : badge "Inclus" plutôt
que "0 FCFA" en chiffres, pour éviter toute confusion avec une erreur de saisie ou une remise
(voir §5.2).

**D-05 — `type_client` et `mode_paiement` ne sont pas des badges colorés.** Ce sont des données
descriptives, pas des états à surveiller : traitées comme tags neutres/icônes, pas de couleur
sémantique dédiée, pour ne pas diluer le sens des couleurs réservées aux statuts/alertes.

**D-06 — Position des toasts : coin supérieur droit partout, sauf exception mobile Agent.** Le
système de toasts (audit complet suite à un hydration mismatch confirmé sur
`components/ui/Toast.tsx`, voir `docs/toast-et-coherence-donnees.md`) adopte le coin supérieur droit
comme règle générale (Admin toutes largeurs, Agent `≥ 640px`), alignée sous la Topbar/Navbar
(`h-16`). Exception conservée pour l'Agent `< 640px` : position basse (au-dessus de la
`BottomTabBar`, valeur `bottom-20` déjà en place), car le coin supérieur droit y chevaucherait le
bouton avatar de la `NavBar` et éloignerait le retour visuel des boutons d'action sticky en bas
d'écran (`NouvelleFactureForm.tsx`). Détail complet et rationale : `docs/toast-et-coherence-donnees.md`
§3.3.

**D-07 — Rayon des toasts = `rounded-modal` (16px), pas `rounded-input` (8px).** Le brief regroupe
explicitement "modals/toasts" sous `rounded-2xl` : un toast, comme un modal, est un élément flottant
au-dessus du contenu de page (z-index élevé), à la différence des inputs/badges incrustés dans le
flux normal. `components/ui/Toast.tsx` doit être corrigé en conséquence (actuellement
`rounded-input`). Détail : `docs/toast-et-coherence-donnees.md` §3.7.

**D-08 — Rayon des éléments "pilule" de la référence "Ultraleads" (nav actif, bascule segmentée,
bouton "Filter", badges de variation, dropdown "Weekly") : `rounded-input`/`rounded-badge` (8px),
jamais `rounded-full`.** La référence utilise une forme pilule complète pour la quasi-totalité de
ses éléments interactifs. La règle absolue transmise en amont du projet (§7, non négociable) réserve
explicitement `rounded-full` aux **badges de statut de facture** — c'est déjà l'interprétation
appliquée par le code existant (`components/ui/Button.tsx` utilise `rounded-input` pour toutes ses
variantes, y compris l'item de nav actif de `components/admin/Sidebar.tsx`). Décision : tout nouvel
élément introduit pour rapprocher l'Admin de la référence (bascule segmentée §6.17, variante de
bouton `navy` façon "Filter" §6.1, badges de variation §6.20) suit la même règle —
`rounded-input` (8px) pour les contrôles interactifs, `rounded-badge` (8px) pour les badges
non-statut. Seuls `StatusBadge` (facture, §5.1) et les jauges/barres (qui utilisent `rounded-full`
comme forme de piste/remplissage, pas comme "pilule de bouton", §5.3/§6.5) gardent `rounded-full`.
C'est l'écart assumé le plus visible entre la référence et l'implémentation : la fidélité porte sur
les couleurs, les dégradés, les ombres, les proportions et la structure des cartes/widgets — pas sur
la forme des boutons, régie par la règle absolue fixée en amont du projet, antérieure et supérieure
à la demande de reproduction pixel-perfect d'une capture d'écran tierce.

**D-09 — Dégradé accent turquoise → bleu : extrémité décalée pour éviter la collision avec
`--color-blue`.** Voir §3.5 pour les valeurs exactes et le rationale (bleu de statut `validee` =
`#2563EB` ; extrémité du dégradé fixée à `#38BDF8` plutôt qu'au `#3B82F6` de la référence). Règle
d'usage stricte : `--gradient-accent`/`--gradient-accent-y` sont **exclusivement décoratifs**
(jauges, barres de progression, graphiques agrégés) et ne doivent **jamais** apparaître dans un
composant affichant aussi un badge de statut de facture sur le même écran/carte, pour écarter tout
risque de lecture croisée ("ce bleu dégradé signifie-t-il que la facture est validée ?").

**D-10 — `RadialGauge` (jauge radiale décorative) vs `StockGauge` (jauge de stock sémantique) :
domaines disjoints, jamais superposés.** Voir §6.18. Le stock produit reste **exclusivement**
représenté par `StockGauge` (rouge/ambre/vert liés au seuil, §5.3) ; `RadialGauge` sert uniquement
des KPI dashboard agrégés sans seuil d'alerte métier. Si un besoin futur de "jauge de stock radiale"
émergeait, il devra réutiliser la logique de zone rouge/ambre/vert de `StockGauge` (pas le dégradé
turquoise/bleu) pour ne pas créer un second langage visuel du stock.

**D-11 — `--radius-card-lg` (20px) : formalisation en token de l'override local déjà en place
(`rounded-3xl` sur `StatCard` en mode `hero`), sans toucher au token global `--radius-card` (12px).**
La Phase 2 avait déjà tranché de ne pas modifier `--radius-card` globalement pour ne pas impacter
l'Espace Agent (les deux thèmes partagent le même fichier `tokens.css`) ; cette décision reste
valide et est **confirmée** malgré l'exigence de reproduction stricte, pour deux raisons : (1)
l'exigence de fidélité porte sur l'écran "Sales Overview" du dashboard Admin, pas sur l'ensemble des
cartes des deux espaces — élargir le rayon partout diluerait le contraste "cartes vedettes très
arrondies vs cartes de contenu standard" qui fait justement la lisibilité de la référence ; (2)
changer un token *global* partagé pour un besoin *local* casserait le principe "un seul point de
vérité pour les deux espaces" (§1). En revanche, l'usage ad hoc de classes Tailwind arbitraires
(`rounded-3xl`/`rounded-2xl` mélangées selon les composants) est remplacé par un **token nommé et
documenté** (`--radius-card-lg` = 20px, §3.6), scoping restreint à `[data-theme="admin"]` avec un
repli à `var(--radius-card)` (12px) en `:root` — si la classe générée `rounded-card-lg` était
utilisée par erreur côté Agent, aucune carte n'y perdrait ses coins arrondis au minimum. Valeur
choisie : 20px (bas de la fourchette 20-24px décrite dans la référence), pour rester visuellement
proche de `--radius-modal` (16px) sans le dépasser d'un facteur disproportionné.

> **Statut : contexte visuel remplacé par D-14 (retour au thème sombre), valeur du token conservée.**
> Cette décision a été prise dans le contexte du dashboard clair Ultraleads ; ce contexte n'existe
> plus depuis D-14. La valeur `--radius-card-lg: 20px` elle-même n'est **pas** remise en cause et
> continue de s'appliquer sans changement aux cartes vedettes du nouveau dashboard sombre — seul le
> raisonnement "pourquoi 20px plutôt que 12px" ci-dessus, écrit pour une référence claire, reste
> historique.

**D-12 — Nouvelle variante de bouton `navy` : réservée aux actions d'outillage du dashboard, jamais
aux CTA métier.** Voir §6.1. Le vert (`--color-green`) reste l'unique signal "action principale"
reconnu par l'utilisateur dans toute l'application (facture, paiement, validation) — l'introduire
ailleurs (ex. colorer le bouton "Filter" en vert comme un CTA) créerait une confusion de hiérarchie.
À l'inverse, réutiliser le vert pour "Filter" comme le ferait une reproduction littérale de la
référence (dont le bleu marine sert justement d'accent visuel fort) aurait dilué le sens du
vert-CTA — le nouveau ton `navy` accueille précisément cette esthétique "pilule sombre" de la
référence sans jamais toucher au vert.

> **Statut : remplacé par D-14/D-18 pour l'usage "contenu" de cette variante.** Le principe "le vert
> reste l'unique CTA métier" reste valide et non négocié. En revanche, l'usage concret du fond
> `--color-navy` plein pour habiller ce bouton ne fonctionne plus visuellement depuis le retour au
> thème sombre (contraste quasi nul sur le nouveau fond, voir D-18) : le remplissage bascule sur
> `--color-green-dk` en attendant une nouvelle référence dédiée. `--color-navy` reste en revanche
> pleinement valide pour la carte CTA de la sidebar blanche (D-15), un contexte de fond clair où son
> contraste d'origine s'applique sans changement.

**D-13 — La navigation reste une sidebar verticale : l'exigence de reproduction fidèle porte sur le
contenu des écrans, pas sur l'architecture de navigation globale.** La topbar horizontale de la
référence (logo + menu pilule centré + bloc avatar) n'est **pas** reproduite : la sidebar verticale
(`components/admin/Sidebar.tsx`, largeur 260px, déjà alignée sur le ton `navy` pour l'item actif) est
conservée telle quelle. Décision actée explicitement pour éviter toute ambiguïté si la capture de
référence est relue plus tard sans ce contexte : "reproduction exacte" s'applique à
l'iconographie/aux widgets de contenu de page (cartes, jauges, dégradés, micro-interactions,
couleurs), pas à la structure de layout déjà tranchée en Phase 2.

> **Statut : le choix "sidebar verticale" reste confirmé et inchangé par D-14.** Seule la couleur de
> fond de cette sidebar change (blanche, D-15) et le traitement de son item actif (vert plein, D-16)
> — l'architecture de navigation elle-même (sidebar verticale 260px, jamais de topbar horizontale)
> n'est pas remise en question par le retour au thème sombre.

**D-14 — Abandon définitif de la refonte claire "Ultraleads" : l'Espace Admin repasse à un thème
sombre "neon green".** Deux nouvelles images de référence (dashboard fond sombre/vert néon dégradé
avec sidebar blanche ; écran Factures sombre façon Salesforce, hors périmètre de ce lot) actent une
nouvelle direction validée explicitement par le porteur de produit : le clair/navy Ultraleads
(D-11/D-12/D-13, §3.1/§4 historique) est abandonné sur **l'ensemble** de l'Espace Admin, pas
seulement le dashboard. Les valeurs de fond/surface/texte/bordure reviennent aux valeurs du thème
sombre d'origine du projet, antérieures à Ultraleads (`--color-bg: #0F1712`,
`--color-surface: #16211A`, `--color-surface-2: #1E2C22`, `--color-border: #2C3D30`,
`--color-text: #F0F6F2`, `--color-muted: #8FA294`) — ces valeurs n'ont jamais réellement disparu du
document : §4 (tableau comparatif Admin/Agent) et §4.1/§4.2 (texte accentué "couleur pleine sur fond
sombre") n'avaient jamais été mis à jour pendant la parenthèse Ultraleads et redeviennent donc
exactes sans modification. Ce qui **change concrètement dans le code** avec D-14 : `tokens.css`,
`app/globals.css` et `design-system/tailwind.tokens.js` (fond/surface/texte/bordure/ombres/
focus-ring-alpha/couleurs de texte accentué du bloc `[data-theme="admin"]`). Ce qui **ne change
pas** : `[data-theme="agent"]` (aucune ligne modifiée), les 6 couleurs de statut de facture (§5.1),
`--radius-card` (12px, partagé), `--radius-card-lg` (20px, valeur inchangée, voir note §3.6),
`--gradient-accent` (§3.5). Décisions D-11 (`--radius-card-lg`), D-12 (variante bouton `navy`) et
D-13 (sidebar verticale conservée) restent des entrées valides du journal (traçabilité) mais leur
**contexte visuel** (dashboard clair Ultraleads) est remplacé par D-14 — voir D-15/D-16/D-18
ci-dessous pour les ajustements concrets que cela entraîne sur `navy` et la sidebar.

**D-15 — Nouveaux tokens `--color-sidebar-*` : la sidebar Admin devient la seule zone claire de
l'écran, rupture volontaire du principe "un seul jeu de tokens partagé sidebar/contenu".** Voir §3.7
pour le détail complet des valeurs et du rationale. La référence "neon green" montre explicitement
une sidebar blanche sur un fond de contenu sombre/dégradé — contrairement au reste de la palette
(une seule teinte de fond partagée entre nav et contenu jusqu'ici, y compris pendant Ultraleads), ce
contraste fort fait partie intégrante de l'identité visuelle de la nouvelle référence et est reproduit
tel quel plutôt que lissé. Nouveaux tokens : `--color-sidebar-bg` (`#FFFFFF`), `--color-sidebar-text`
(`#0F1712`, réutilise le ton le plus sombre de la palette comme "encre"), `--color-sidebar-text-muted`
(`#5B6E60`, identique à `--color-muted` du thème Agent car même contexte de fond clair, AA garanti),
`--color-sidebar-active-bg`/`--color-sidebar-active-text` (voir D-16). `--color-navy`/`--color-navy-dk`
ne sont **pas** dupliqués en nouveaux tokens : ils restent utilisés tels quels pour la carte CTA
"Besoin d'aide ?" en bas de sidebar, leur contraste sur fond blanc (`navy` sur blanc ≈ 14:1) étant
largement suffisant sans aucun ajustement.

**D-17 — `--gradient-hero` est un token distinct de `--gradient-accent`, jamais une variante ou un
alias.** Voir §3.8 pour le rationale complet : `--gradient-accent` (turquoise/cyan, D-09) reste
strictement décoratif et neutre de sens (graphiques secondaires agrégés), tandis que `--gradient-hero`
(vert profond → vert néon) porte volontairement le sens fort "élément phare de l'écran" en amplifiant
le vert de marque plutôt qu'en s'en écartant. Fusionner les deux aurait dilué la hiérarchie visuelle
que ces deux dégradés servent précisément à exprimer. Valeurs : `--color-hero-start: #0D3320`,
`--color-hero-end: #4ADE80`, `--gradient-hero: linear-gradient(135deg, ...)`.

**D-16 — Item de nav actif de la sidebar : vert plein remplace le fond `navy` (D-12).** Voir §3.7
pour le rationale détaillé (trois arguments : disponibilité immédiate du vert de marque sur fond
blanc redevenu clair ; éviter deux blocs `navy` pleins de fonction différente dans la même sidebar
[nav actif + carte CTA] ; cohérence avec D-12 qui réserve le vert aux actions/états mettant en avant
l'essentiel). Nouveau token `--color-sidebar-active-bg` (= `var(--color-green)`), texte
`--color-sidebar-active-text` (blanc). Le radius reste `rounded-input` (D-08 non remis en cause : un
item de nav n'est pas un badge de statut de facture).

**D-18 — Variante de bouton `navy` et état actif de `SegmentedControl` : `navy` n'est plus utilisable
en remplissage plein en dehors de la sidebar depuis le retour au fond sombre.** Constat de contraste
(non-texte) : `--color-navy` (`#1E2A45`) sur le nouveau `--color-bg`/`--color-surface` sombres donne
un rapport ≈ 1.2:1, très en dessous du seuil minimal de 3:1 recommandé pour la distinction d'un
composant interactif de son arrière-plan — le bouton "Filter" ou l'option active d'un
`SegmentedControl` deviendraient quasiment invisibles sur le nouveau fond. Décision provisoire, en
attendant une capture de référence dédiée à ces éléments sur fond sombre : ces deux usages basculent
sur un remplissage `--color-green-dk` (contraste ≈ 3.6:1 sur `--color-bg`), qui a déjà une
signification proche dans le système ("hover, en-têtes de tableau", §3.1) et reste dans la famille du
vert de marque plutôt que d'introduire une nouvelle teinte. `--color-navy`/`--color-navy-dk` restent
inchangés et valides uniquement pour la carte CTA de la sidebar blanche (D-15). Aucun fichier
composant n'a été modifié par cette décision — elle est documentée ici pour que `dev-frontend-admin`
l'applique lors du prochain passage sur `Button.tsx`/`SegmentedControl.tsx`.

**D-19 — Nouveaux tokens de séries de graphique (`--color-chart-serie-1/-2`, `--color-agent-ring-1`
à `-5`) : dérivés de la palette existante, aucune couleur arbitraire.** Voir §3.9 et les spécifications
`WeeklySalesBarChart` (§6.23) et `NestedRadialProgress` (§6.24). Choix délibéré de **réutiliser** des
tokens déjà existants (`--color-green`, `--color-green-dk`, `--color-accent-start`) plutôt que
d'introduire de nouvelles valeurs hex chaque fois que possible, pour limiter la prolifération de
tokens et garantir que toute teinte utilisée dans ces deux composants reste immédiatement traçable
jusqu'à la palette de référence ou au dégradé héro (D-17). Seuls `--color-hero-start`/`-end` sont de
réelles nouvelles valeurs hex (déjà introduites par D-17), réemployées ici par alias.

**D-20 — Animation d'entrée du Toast : easing "spring" (`--ease-spring`, overshoot) sur le keyframe
existant, pas de nouveau keyframe ni de dépendance JS.** Voir §3.10 et §6.7. `docs/toast-et-coherence-
donnees.md` §3.7 avait conclu, lors de l'audit initial du composant `Toast`, que l'animation d'entrée
(`fade + translateY(8px)→0`, 200ms `--ease-standard`) restait **inchangée**. Cette présente décision
**met à jour** cette conclusion à la demande explicite d'un lot ultérieur ("effet spring/bounce-in") :
plutôt que de réécrire le keyframe en plusieurs étapes (risque de double-rebond si combiné à une
courbe déjà à overshoot, et complexité inutile), la solution retenue est de conserver le keyframe
`toast-in` tel quel et de changer uniquement sa timing-function (`--ease-spring`,
`cubic-bezier(0.34, 1.56, 0.64, 1)`, qui dépasse temporairement 100% avant de se stabiliser) et sa
durée (`--duration-toast`, 380ms au lieu de 200ms — une courbe à overshoot perceptible a besoin d'un
peu plus de temps pour se lire). Aucune dépendance ajoutée : le projet n'a pas framer-motion,
`recharts` reste la seule librairie de visualisation. `docs/toast-et-coherence-donnees.md` §3.7 doit
être mis à jour en conséquence par quiconque reprend ce document (hors périmètre du présent lot,
limité à `docs/design-system.md` et aux 3 fichiers de tokens).

**D-21 — Statuts crédit (`en_cours`/`solde`) et bon de livraison (`livre_non_paye`/`livre_paye`) :
ambre pour l'état actif/en attente, vert pour l'état soldé, jamais rouge.** Voir §5.6/§5.7. Le brief
(palette de référence fournie en tête de mission) associe le rouge à "rupture de stock, facture
impayée", ce qui pourrait suggérer `en_cours`/`livre_non_paye` en rouge. Décision, par cohérence
directe avec le raisonnement déjà tranché en D-01 pour `validee` : un crédit en cours ou un BL non
encore payé sont des états **normaux et attendus** du cycle de vie du document (le crédit a été
explicitement autorisé par le trigger `bloquer_nouveau_credit()`, le BL matérialise une livraison déjà
survenue, règle 15), pas des incidents — le rouge reste réservé aux états bloquants/négatifs
(`annulee` facture, rupture de stock, futur indicateur "en retard" si une date d'échéance est ajoutée
au schéma). Symétrie volontaire entre les deux enums (même couleur pour "somme due, suivie" et "somme
réglée") pour renforcer la lecture visuelle immédiate entre les deux écrans, conforme au principe
directeur §2.4.

**D-22 — `EntrepotSelector` : jamais de `<select>` fermé, défaut autorisé uniquement s'il reste
visible par ce même composant, confirmation redondante au point de validation.** Voir §5.8/§6.26. Le
brief de cette mission posait une contrainte forte et non négociable ("le risque métier est qu'une
erreur de sélection décrémente le mauvais entrepôt") sans détailler la forme exacte du composant.
Décisions tranchées : (1) rangée de chips toujours toutes rendues (jamais de menu déroulant, même
stylé) plutôt qu'une réutilisation de `SegmentedControl` (§6.17), volontairement restreint par sa
propre spécification aux widgets de dashboard Admin non critiques ; (2) un défaut pré-sélectionné est
autorisé (utile à la saisie rapide, principe §2) mais uniquement s'il est rendu par le composant
visible dès le montage — jamais une valeur portée par un champ masqué/fermé ; (3) le libellé du bouton
de soumission rappelle l'entrepôt actif ("Valider la facture — Entrepôt : Dakar"), mitigation
supplémentaire non demandée explicitement mais jugée nécessaire au vu de la gravité du risque métier
décrit (décrément du mauvais stock) ; (4) sur le formulaire de transfert, exclusion croisée visuelle
immédiate entre source et destination (chip grisé) plutôt que d'attendre l'échec de la contrainte
`transferts_stock_source_destination_distincts` côté serveur.

**D-23 — `CreditGauge` : zones rouge/ambre/vert inversées par rapport à `StockGauge`, heuristique
ambre `×(2/3)` comme inverse mathématique exact du `×1.5` de D-02.** Voir §5.9/§6.27. La mission
demandait "même logique visuelle que la jauge de stock ... vert/amber/rouge selon proximité du
seuil", sans préciser le sens exact de la proximité pour un encours financier (contrairement au stock,
où "proche du seuil" signifie "en train de manquer"). Décision : le risque métier du crédit est
inverse de celui du stock (trop de crédit non recouvré, pas trop peu) — la zone rouge se déclenche donc
**au-dessus** du seuil (`encoursCredit >= seuilCreditMax`), pas en dessous. Pour l'heuristique de la
zone tampon ambre, plutôt que d'inventer un nouveau multiplicateur arbitraire, réutilisation de
l'inverse mathématique exact de celui déjà validé pour le stock (`1 / 1.5 ≈ 0.667`, soit `×(2/3)`) :
un seul raisonnement ("zone tampon d'un tiers avant le seuil critique") s'applique aux deux jauges,
simplement dans le sens de lecture opposé selon la nature du risque. Cas particulier ajouté, absent de
`StockGauge` (le stock n'a pas d'équivalent) : `seuil_credit_max = 0` est un état **intentionnel**
documenté en base comme fail-safe ("crédit désactivé tant qu'un admin ne l'a pas configuré",
migration 0013 §9) — traité comme un état neutre distinct ("Crédit désactivé"), jamais comme une
jauge à 0/0 ou une zone rouge trompeuse.

**D-24 — Statuts `transferts_stock` : ambre pour `demande` (attente d'action admin), bleu pour
`en_transit` (en cours, normal, aucune action requise), vert pour `receptionne`, rouge pour
`annule`.** Voir §5.10/§6.28. Complément demandé par le coordinateur après la livraison initiale de
la Phase B (ces 4 statuts étaient explicitement hors périmètre du brief d'origine, cf. note laissée en
§5.7). Décision : pas de nouvelle doctrine de couleur, réutilisation stricte du raisonnement déjà
établi par D-01 (facture) et D-21 (crédit/BL) — un badge de statut de document dans ce projet suit
systématiquement la même grille de lecture, quel que soit le domaine métier : ambre = "en attente
d'une action humaine identifiable" (ici, la progression du transfert est réservée à l'admin par RLS,
règle 16 — un agent qui crée une `demande` ne peut plus rien faire avancer lui-même), bleu = "état
intermédiaire actif mais normal, rien à faire pour l'observateur" (mirroir direct de `validee`, D-01 —
`en_transit` correspond exactement à cette lecture : le stock a quitté la source, personne n'a d'action
à poser tant que la réception n'est pas constatée), vert = "terminé avec succès" (mirroir de
`payee`/`solde`/`livre_paye`), rouge = "terminé en échec/annulation" (mirroir de `annulee`). Seul écart
notable par rapport aux deux autres enums Phase B (crédit/BL, qui n'ont que 2 valeurs actives + jamais
de rouge, D-21) : `transferts_stock` a un véritable état terminal négatif (`annule`) dans son schéma,
d'où l'usage du rouge ici, cohérent avec son usage déjà réservé aux états bloquants/négatifs
(§5.1/D-01) plutôt qu'une exception à la règle.

Toute nouvelle question non couverte par ce journal doit être posée à `designer-ui-ux` et donner
lieu à une nouvelle entrée ici avant implémentation, afin que la cohérence survive aux prochaines
sessions.

---

**D-25 — Direction « Comptoir » (octobre 2026) : Admin clair par défaut, police Geist, rayons 10/14 px.**
Validée par l'utilisateur à partir de la maquette « GFB-STOCK — Proposition de maquette ». Remplace D-14
(Admin sombre « neon green ») comme thème **par défaut** ; le sombre reste proposé dans le sélecteur de
fond (« Vert sombre », « Bleu nuit »), tout comme « Sable ». Changements :
- **Fond** `--color-bg` `#F4F6F3` (vert-gris très clair), cartes `#FFFFFF`,
  bordure `#E3E8E2`, encre `#0E1A13`, muted `#5B6A60` (≈ 5:1 sur le fond), identiques Admin et Agent.
- **Texte accentué** foncé (`--color-text-*` : vert `#0F5F2D`, ambre `#8A4307`, rouge `#9A2A1F`) dans
  les deux espaces : les fonds sont désormais clairs partout.
- **Bouton `primary`** en `--color-green-dk` : le blanc sur `#16A34A` n'atteint pas AA (≈ 3.3:1). Les 6
  couleurs de référence ne changent pas ; seuls leurs usages pour du texte blanc passent au vert foncé.
- **Sidebar** : item actif teinté (`#E8F3EC` / `#0F5F2D`) au lieu du vert plein de D-16.
- **Police** Geist / Geist Mono (paquet `geist`, servie par l'application, aucun appel réseau).
- **Rayons** : `--radius-input` 10 px, `--radius-card` 14 px, `--radius-card-lg` 16 px.
- **Carte « encre »** (`--color-encre`, `--color-encre-muted`) : seul bloc sombre autorisé sur fond clair
  (ventes du jour, accueil Agent).
- **Structure** : tableau de bord Admin avec en-tête sobre, actions en rangée de boutons et carte
  unique « À traiter aujourd'hui » (livraisons, retards, stock bas, crédits, transferts) ; accueil
  Agent avec ventes du jour, 4 tuiles et liste « À livrer » (`factures_a_livrer()`, migration 0023) ;
  indicateur d'étapes en barres de progression (facture, bon de livraison).
Les valeurs détaillées des §3.1, §3.3 et §3.7 décrivent l'état antérieur ; la source de vérité est
`design-system/tokens.css` / `app/globals.css`.

**D-26 — Dashboard Admin : « ticket du mois » et priorités actives seules (octobre 2026).**
Prolonge D-25 sans nouveau token. Le tableau de bord Admin est réorganisé par ordre d'action :
- **Ticket du mois** (`components/ui/Ticket.tsx`, partagé avec l'accueil Agent) sur la carte encre : CA du mois en grand à
  gauche, relevé façon ticket de caisse à droite (libellé, points de conduite, montant en Geist Mono)
  pour « À encaisser », « En retard », « Crédit en cours » (jauge fine, zones §5.9/D-23) et « Valeur du
  stock ». Chaque ligne est un lien. Remplace les quatre `StatCard` et `CreditGaugeCard` (supprimée).
  Sur la carte encre, le texte reste blanc / `--color-encre-muted` ; la couleur d'état n'apparaît que
  dans le point et la jauge, jamais seule (le libellé ou le détail porte l'information).
- **À traiter aujourd'hui** : seuls les points actifs sont détaillés (nombre en Geist Mono 36 px, ton
  d'état, titre, conseil) ; les points déjà en ordre tiennent sur une ligne « En ordre : … ».
- **Factures en retard** : la carte n'est rendue que s'il y a au moins un retard.
- **Factures récentes + Crédits en cours** côte à côte à partir de `2xl` (2/3 – 1/3), empilés en
  dessous ; les crédits passent en liste compacte.
- **Accueil Agent** : « Mes ventes du jour » passe au même composant `Ticket` (lignes « Vente(s)
  conclue(s) », « Brouillons à finir », « À livrer », point ambre si > 0). Sur mobile, une seule grande
  action « Nouvelle facture » (la barre d'onglets porte déjà les autres) ; les 4 tuiles restent à
  partir de `md`. La section « À livrer » n'est rendue que si elle contient au moins une facture ;
  l'état vide « Factures du jour » tient sur une ligne, sans bouton redondant.
La carte encre reste limitée à **un seul bloc par écran** (ventes du jour côté Agent, ticket du mois
côté Admin).

**D-27 — Saisie de facture en mode concentré (octobre 2026).**
- Espace Agent : la barre d'onglets mobile est masquée sur `/nouvelle-facture` ; le formulaire a sa
  propre barre de pied.
- Barre de pied sur une seule ligne : retour (icône, `aria-label` « Étape précédente »), total (masqué à
  l'étape 1, où il vaut toujours 0), action suivante. Fixe en bas sous `md`, sticky au-delà, pour les
  deux espaces (la prop `sansBarreOngletsMobile` est supprimée).
- Récapitulatif de l'étape 3 au format ticket : nom, points de conduite, montant ; « quantité × prix
  unitaire » en seconde ligne.

**D-28 — Écrans-listes allégés (octobre 2026).** Sans nouveau token :
- `QuickActionGrid` : rangée de raccourcis de 44 px (icône teintée, libellé, description à partir de
  `sm`), défilement horizontal sur mobile, au lieu des tuiles de 112 px.
- `BrandedListPanel` : plus de carte englobante (filtres et tableau restent des cartes, sans carte
  dans une carte) ; en-tête aligné sur le tableau de bord.
- `StatCard` : libellé en casse normale (`text-body-sm`), hauteur selon le contenu, indication en 14 px.
- `StockGauge` compact : quantité chiffrée toujours affichée à droite de la barre (§8) ; badge
  « Rupture de stock » insécable.
- Stock : colonne « Statut » supprimée, badge « Inactif » sous le nom uniquement si besoin ; kit
  affiché « Inclus dans le kit » en texte discret ; cartes mobiles sur trois lignes.
- `formatMontant` : espace insécable avant « FCFA », un montant ne se coupe plus.
- Mes factures (Agent) : numéro en mono, date et entrepôt en texte normal, montant insécable.

## 11. Handoff

**Le design system GFB-STOCK est prêt à être repris par `dev-frontend-admin` et
`dev-frontend-agent`.**

Livrables disponibles :
- `design-system/tokens.css` — variables CSS complètes (à copier dans `app/globals.css`).
- `design-system/tailwind.tokens.js` — fragment `theme.extend` (à fusionner dans
  `tailwind.config.ts`).
- `docs/design-system.md` (ce fichier) — spécification de tous les composants, micro-interactions,
  mapping du domaine métier (statuts facture, jauge de stock, indicateur kit) et accessibilité.
- `docs/toast-et-coherence-donnees.md` — spécification complète du système de toasts (4 variantes,
  timing, position, API du contexte, correctif détaillé du bug d'hydratation de
  `components/ui/Toast.tsx`) et des garanties de cohérence des données pour les écrans Nouvelle
  facture, Enregistrer un paiement et Ajustement de stock, avec une liste actionnable d'anomalies
  constatées dans le code existant à corriger (§6 de ce document). **`components/ui/Toast.tsx` est
  partagé par l'Espace Admin et l'Espace Agent : sa correction (hydratation, icône d'erreur, rayon,
  timing, position responsive) ne se code qu'une seule fois pour les deux espaces.**

Aucun code d'application (composants React, requêtes Supabase, Server Actions) n'a été produit par
cet agent — conformément à son périmètre, qui s'arrête au visuel et à l'expérience utilisateur.
Toute divergence de couleur, rayon, durée d'animation ou structure de composant repérée en cours de
développement doit remonter à `designer-ui-ux` pour arbitrage et mise à jour du §10, plutôt que
d'être tranchée localement dans le code frontend.

### 11.1 Handoff Phase B (avenant Crédit / BL / Multi-entrepôts)

Spécifications ajoutées pour la Phase C (`dev-frontend-admin`, `dev-frontend-agent`) sur la base de
`supabase/migrations/0013_avenant_credit_entrepots.sql` :

- `CreditStatusBadge` / `BonLivraisonStatusBadge` (§5.6, §5.7, §6.25) — mirroir de `StatusBadge`,
  aucune nouvelle classe CSS.
- `EntrepotSelector` (§5.8, §6.26) — nouveau composant à créer, contrainte non négociable : jamais de
  `<select>` fermé, entrepôt actif toujours visible, confirmation redondante au point de validation.
- `CreditGauge` (§5.9, §6.27) — nouveau composant à créer, mirroir structurel de `StockGauge` avec
  zones de risque inversées (D-23).
- `TransfertStatusBadge` (§5.10, §6.28) — complément demandé par le coordinateur après la livraison
  initiale, pour l'écran "Transferts de stock" (Admin). Même mirroir de `StatusBadge`, 4 valeurs
  (`demande` ambre, `en_transit` bleu, `receptionne` vert, `annule` rouge, D-24). Point de vigilance
  transmis à `dev-frontend-admin` : masquer/désactiver l'action "Annuler" dès que le statut affiché est
  `receptionne` (état terminal côté base, §6.28).
- Aucun token CSS/Tailwind ajouté (§3.11) : `design-system/tokens.css`,
  `design-system/tailwind.tokens.js` et `app/globals.css` restent inchangés par cette phase, y compris
  après l'ajout de `TransfertStatusBadge` (réutilise les 4 pastels déjà existants).
- Les types Supabase (`StatutCredit`, `StatutBonLivraison`, `StatutTransfertStock`, etc.) doivent être
  régénérés depuis le schéma après application de la migration 0013 — étape technique hors périmètre
  de cet agent.
