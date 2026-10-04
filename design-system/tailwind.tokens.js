/**
 * GFB-STOCK — Fragment Tailwind (theme.extend)
 * Fichier source : design-system/tailwind.tokens.js
 *
 * ⚠️ EMPLACEMENT FINAL : une fois le projet Next.js initialisé, fusionner ce
 * fragment dans `tailwind.config.ts` (ou .js) du projet :
 *
 *   const gfbTokens = require('./design-system/tailwind.tokens.js');
 *   module.exports = {
 *     content: [...],
 *     theme: { extend: gfbTokens },
 *     plugins: [...],
 *   };
 *
 * Toutes les valeurs référencent les variables CSS définies dans
 * design-system/tokens.css (elles-mêmes copiées dans app/globals.css) : ne
 * jamais recopier une valeur hex ici, toujours passer par var(--...).
 *
 * Exemples de classes générées : bg-bg, bg-surface, bg-surface-2,
 * border-border, text-text, text-muted, bg-green, text-green-text,
 * rounded-card, rounded-card-lg, rounded-modal, rounded-pill,
 * shadow-card-hover, ease-standard, animate-shimmer, animate-gauge-fill,
 * bg-gradient-accent, bg-gradient-accent-y, text-display-lg.
 */

module.exports = {
  colors: {
    bg: 'var(--color-bg)',
    surface: 'var(--color-surface)',
    'surface-2': 'var(--color-surface-2)',
    border: 'var(--color-border)',
    text: 'var(--color-text)',
    muted: 'var(--color-muted)',

    green: {
      DEFAULT: 'var(--color-green)',
      dk: 'var(--color-green-dk)',
      text: 'var(--color-text-green)',
    },
    navy: {
      DEFAULT: 'var(--color-navy)',
      dk: 'var(--color-navy-dk)',
    },
    amber: {
      DEFAULT: 'var(--color-amber)',
      text: 'var(--color-text-amber)',
    },
    red: {
      DEFAULT: 'var(--color-red)',
      text: 'var(--color-text-red)',
    },
    blue: {
      DEFAULT: 'var(--color-blue)',
      text: 'var(--color-text-blue)',
    },
    purple: {
      DEFAULT: 'var(--color-purple)',
      text: 'var(--color-text-purple)',
    },
    accent: {
      start: 'var(--color-accent-start)',
      end: 'var(--color-accent-end)',
    },

    // Sidebar Admin — seule zone claire de l'écran depuis le retour au thème
    // sombre (docs/design-system.md §10 D-14/D-15). Classes générées :
    // bg-sidebar, text-sidebar-text, text-sidebar-text-muted, bg-sidebar-active,
    // text-sidebar-active-text. Ne jamais utiliser ces tokens en dehors du
    // composant Sidebar.
    sidebar: {
      bg: 'var(--color-sidebar-bg)',
      text: 'var(--color-sidebar-text)',
      'text-muted': 'var(--color-sidebar-text-muted)',
      active: 'var(--color-sidebar-active-bg)',
      'active-text': 'var(--color-sidebar-active-text)',
    },

    // Dégradé héro (§10 D-17) — DISTINCT de `accent` ci-dessus : réservé aux
    // cartes vedettes (stat héro, DonutChart "Statistique Produit"), jamais
    // aux graphiques décoratifs secondaires.
    hero: {
      start: 'var(--color-hero-start)',
      end: 'var(--color-hero-end)',
    },

    // Séries de graphique WeeklySalesBarChart (docs/design-system.md §3.9).
    chart: {
      'serie-1': 'var(--color-chart-serie-1)', // vert clair — CA facturé
      'serie-2': 'var(--color-chart-serie-2)', // vert foncé — CA encaissé
    },

    // Teintes des cercles concentriques NestedRadialProgress "Répartition par
    // Agent" (docs/design-system.md §3.9) — 5 teintes dérivées de la palette,
    // jamais de couleur arbitraire hors palette.
    'agent-ring': {
      1: 'var(--color-agent-ring-1)',
      2: 'var(--color-agent-ring-2)',
      3: 'var(--color-agent-ring-3)',
      4: 'var(--color-agent-ring-4)',
      5: 'var(--color-agent-ring-5)',
    },
  },

  // Dégradés décoratifs. gradient-accent/-y = turquoise/cyan, jauges et
  // graphiques NON liés à un statut (§3.5, jamais sur un badge de statut).
  // gradient-hero = vert profond -> vert néon, cartes vedettes uniquement
  // (§3.8, D-17) — les deux ne sont JAMAIS interchangeables.
  backgroundImage: {
    'gradient-accent': 'var(--gradient-accent)',
    'gradient-accent-y': 'var(--gradient-accent-y)',
    'gradient-hero': 'var(--gradient-hero)',
  },

  borderRadius: {
    input: 'var(--radius-input)',
    badge: 'var(--radius-badge)',
    pill: 'var(--radius-badge-pill)',
    card: 'var(--radius-card)',
    'card-lg': 'var(--radius-card-lg)', // cartes vedettes dashboard Admin uniquement, §3.6/D-11
    modal: 'var(--radius-modal)',
  },

  fontFamily: {
    sans: 'var(--font-sans)'.split(', '),
    mono: 'var(--font-mono)'.split(', '),
  },

  fontSize: {
    display: 'var(--text-display)',
    'display-lg': 'var(--text-display-lg)',
    h1: 'var(--text-h1)',
    h2: 'var(--text-h2)',
    h3: 'var(--text-h3)',
    body: 'var(--text-body)',
    'body-sm': 'var(--text-body-sm)',
    caption: 'var(--text-caption)',
  },

  boxShadow: {
    sm: 'var(--shadow-sm)',
    md: 'var(--shadow-md)',
    lg: 'var(--shadow-lg)',
    'card-hover': 'var(--shadow-card-hover)',
  },

  transitionTimingFunction: {
    standard: 'var(--ease-standard)',
    // "Back ease-out" avec overshoot — entrée Toast uniquement (§10 D-20).
    // Pure CSS, aucune dépendance JS (le projet n'a pas framer-motion).
    spring: 'var(--ease-spring)',
  },
  transitionDuration: {
    btn: 'var(--duration-btn)',
    card: 'var(--duration-card)',
    toast: 'var(--duration-toast)',
  },

  spacing: {
    tap: 'var(--tap-target-min)',
  },

  zIndex: {
    dropdown: 'var(--z-dropdown)',
    sticky: 'var(--z-sticky)',
    'modal-overlay': 'var(--z-modal-overlay)',
    modal: 'var(--z-modal)',
    toast: 'var(--z-toast)',
  },

  keyframes: {
    shimmer: {
      '0%': { backgroundPosition: '-468px 0' },
      '100%': { backgroundPosition: '468px 0' },
    },
    'gauge-fill': {
      from: { width: '0%' },
      to: { width: 'var(--gauge-value, 0%)' },
    },
    'toast-in': {
      from: { opacity: '0', transform: 'translateY(8px)' },
      to: { opacity: '1', transform: 'translateY(0)' },
    },
  },
  animation: {
    shimmer: 'shimmer 1.6s linear infinite',
    'gauge-fill': 'gauge-fill 600ms var(--ease-standard) forwards',
    // Entrée "spring/bounce-in" (§10 D-20) : même keyframe fade+translateY,
    // mais timing-function à overshoot (--ease-spring) + durée dédiée
    // (--duration-toast, 380ms) au lieu de --ease-standard/200ms — c'est ce
    // changement de courbe (et non le keyframe) qui produit l'effet ressort.
    'toast-in': 'toast-in var(--duration-toast) var(--ease-spring) forwards',
  },
};
