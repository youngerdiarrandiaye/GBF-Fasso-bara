import {
  faGauge,
  faBoxesStacked,
  faUsers,
  faFileInvoice,
  faFileCirclePlus,
  faCreditCard,
  faChartPie,
  faUserShield,
  faGear,
  faWarehouse,
  faRightLeft,
  faTruck,
  faTruckRampBox,
  faHandHoldingDollar,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";

export interface LienNav {
  href: string;
  label: string;
  icon: IconDefinition;
  exact?: boolean;
}

/**
 * Source unique de la navigation Admin : la Sidebar (≥ lg) et la feuille
 * « Plus » de la barre basse (< lg) lisent la même liste, pour que les deux
 * surfaces ne divergent jamais.
 *
 * Placement des entrées (avenant Crédit / BL / Multi-entrepôts) :
 * - Entrepôts et Transferts suivent « Produits & stock » : même domaine.
 * - Bons de livraison suit « Nouvelle facture » : même famille de documents.
 * - Crédits & Recouvrement est à côté de « Paiements » : même question
 *   (« qu'est-ce qui reste à encaisser ? »).
 */
export const GROUPES: { label: string; liens: LienNav[] }[] = [
  {
    label: "OPÉRATIONS",
    liens: [
      { href: "/admin", label: "Tableau de bord", icon: faGauge, exact: true },
      { href: "/admin/stock", label: "Produits & stock", icon: faBoxesStacked },
      { href: "/admin/entrepots", label: "Entrepôts", icon: faWarehouse },
      { href: "/admin/transferts", label: "Transferts", icon: faRightLeft },
      { href: "/admin/clients", label: "Clients", icon: faUsers },
      { href: "/admin/factures", label: "Factures", icon: faFileInvoice },
      { href: "/admin/nouvelle-facture", label: "Nouvelle facture", icon: faFileCirclePlus },
      { href: "/admin/bons-livraison", label: "Bons de livraison", icon: faTruck },
      { href: "/admin/bons-livraison/nouveau", label: "Nouvelle livraison", icon: faTruckRampBox },
    ],
  },
  {
    label: "FINANCES",
    liens: [
      { href: "/admin/paiements", label: "Paiements", icon: faCreditCard },
      { href: "/admin/credits", label: "Crédits & Recouvrement", icon: faHandHoldingDollar },
      { href: "/admin/rapports", label: "Rapports", icon: faChartPie },
    ],
  },
  {
    label: "ADMINISTRATION",
    liens: [
      { href: "/admin/utilisateurs", label: "Utilisateurs", icon: faUserShield },
      { href: "/admin/parametres", label: "Paramètres", icon: faGear },
    ],
  },
];

/**
 * Destinations fréquentes épinglées dans la barre basse : 2 onglets, l'action
 * principale au centre, 1 onglet, puis « Plus » (5 colonnes). Le reste de la
 * navigation (Clients, Livraisons, Finances…) vit dans la feuille « Plus ».
 */
export const ONGLETS_BAS: LienNav[] = [
  { href: "/admin", label: "Accueil", icon: faGauge, exact: true },
  { href: "/admin/stock", label: "Stock", icon: faBoxesStacked },
  { href: "/admin/factures", label: "Factures", icon: faFileInvoice },
];

/** Action principale, au centre de la barre basse. */
export const ACTION_PRINCIPALE: LienNav = {
  href: "/admin/nouvelle-facture",
  label: "Créer",
  icon: faFileCirclePlus,
};

function correspond(pathname: string, lien: LienNav) {
  return lien.exact ? pathname === lien.href : pathname === lien.href || pathname.startsWith(`${lien.href}/`);
}

/**
 * Vrai si `lien` est l'entrée la plus précise pour `pathname` : sur
 * /admin/bons-livraison/nouveau, « Nouvelle livraison » est actif, pas
 * « Bons de livraison ».
 */
export function estActif(pathname: string, lien: LienNav) {
  if (!correspond(pathname, lien)) return false;
  return !GROUPES.some((g) =>
    g.liens.some((autre) => autre.href.length > lien.href.length && autre.href.startsWith(lien.href) && correspond(pathname, autre))
  );
}

/** Vrai si la page courante n'est portée par aucun onglet épinglé → « Plus » actif. */
export function estDansPlus(pathname: string) {
  return !ONGLETS_BAS.some((o) => estActif(pathname, o)) && !estActif(pathname, ACTION_PRINCIPALE);
}
