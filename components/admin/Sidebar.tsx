"use client";

import { NavigationLink as Link } from "@/components/ui/NavigationLink";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
  faChevronLeft,
  faChevronRight,
  faXmark,
  faWarehouse,
  faRightLeft,
  faTruck,
  faTruckRampBox,
  faHandHoldingDollar,
  faMagnifyingGlass,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/cn";
import { CompanyBrandMark } from "@/components/facture/CompanyBrandMark";
import { ThemePicker } from "@/components/admin/ThemePicker";
import { useSidebar } from "@/components/admin/SidebarContext";

interface LienNav {
  href: string;
  label: string;
  icon: IconDefinition;
  exact?: boolean;
}

/**
 * Groupes de navigation avec libellé eyebrow (docs/design-system.md §6.10) —
 * répartition logique : navigation courante (MENU), suivi de l'argent
 * (FINANCIER), administration/back-office (OUTILS).
 *
 * Avenant Crédit / Bon de Livraison / Multi-entrepôts (0013) — décisions de
 * placement (non spécifiées par le brief, tranchées ici) :
 * - "Entrepôts" et "Transferts de stock" : groupe MENU, juste après "Stock"
 *   — ce sont des extensions directes de la gestion de stock déjà présente
 *   dans ce groupe (règle métier 16), pas des outils d'administration
 *   séparés. Rester à proximité immédiate de "Stock" aide un admin non
 *   technique à comprendre que ces trois écrans forment un seul domaine.
 * - "Bons de livraison" : groupe MENU, juste après "Nouvelle facture" — même
 *   famille que Factures/Nouvelle facture (documents de vente/livraison
 *   liés au même client, cf. FK optionnelle bons_livraison.facture_id),
 *   plutôt qu'à côté de Stock/Entrepôts malgré son impact sur le stock.
 * - "Crédits & Recouvrement" : groupe FINANCIER, à côté de "Paiements" — les
 *   deux écrans suivent un flux d'argent dû par les clients (impayés vs
 *   encours de crédit) et partagent la même logique de recouvrement
 *   quotidien ; regrouper les deux évite de faire chercher un admin dans
 *   deux zones différentes de la sidebar pour une même préoccupation
 *   ("qu'est-ce qui reste à encaisser aujourd'hui ?").
 */
const GROUPES: { label: string; liens: LienNav[] }[] = [
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
 * Sidebar Admin — seule zone claire de tout l'écran depuis le retour au
 * thème sombre "neon green" (docs/design-system.md §3.7/§6.10, D-14/D-15).
 * Fond `--color-sidebar-bg` (blanc, tokens dédiés `--color-sidebar-*`,
 * jamais `bg-surface` qui est désormais sombre côté Admin). Item de nav actif
 * = fond `--color-sidebar-active-bg` (vert plein) + texte blanc, `rounded-input`
 * (D-16, remplace l'ancien fond `navy` de la refonte "Ultraleads"/D-12).
 *
 * Deux modes d'ouverture/fermeture pilotés par SidebarContext :
 * - ≥ lg : repliable en rail d'icônes (largeur 76px) via le chevron du header.
 * - < lg : tiroir plein écran (overlay + backdrop), ouvert par le bouton
 *   burger de la Topbar, fermé par le X ou un clic sur le backdrop/un lien.
 */
export function Sidebar({ nom, logoUrl }: { nom: string; logoUrl: string | null }) {
  const pathname = usePathname();
  const { collapsed, toggleCollapsed, mobileOpen, closeMobile } = useSidebar();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [search, setSearch] = useState("");
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const groups = GROUPES.map((group) => ({ ...group, liens: group.liens.filter((link) => normalize(link.label).includes(normalize(search.trim()))) })).filter((group) => group.liens.length > 0);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const handleResize = () => { if (desktop.matches) closeMobile(); };
    desktop.addEventListener("change", handleResize);
    return () => desktop.removeEventListener("change", handleResize);
  }, [closeMobile]);

  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblings = Array.from(panelRef.current?.parentElement?.children ?? [])
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== panelRef.current && element.tagName !== "BUTTON")
      .map((element) => ({ element, inert: element.inert }));
    siblings.forEach(({ element }) => { element.inert = true; });
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMobile();
      if (event.key === "Tab") {
        const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('a[href], button, input, summary, [tabindex="0"]') ?? [])
          .filter((item) => !item.hasAttribute("disabled") && item.getClientRects().length > 0 && (!(item instanceof HTMLInputElement) || item.type !== "radio" || item.checked));
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      siblings.forEach(({ element, inert }) => { element.inert = inert; });
      previousFocus?.focus();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen, closeMobile]);

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          onClick={closeMobile}
          aria-label="Fermer le menu de navigation"
          tabIndex={-1}
          className="fixed inset-0 z-modal-overlay cursor-default bg-black/60 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <aside
        ref={panelRef}
        id="admin-navigation"
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen ? true : undefined}
        aria-label="Navigation principale"
        className={cn(
          "fixed inset-y-0 left-0 z-modal flex h-[100dvh] w-[min(90vw,340px)] shrink-0 flex-col rounded-r-3xl border-r border-sidebar-text-muted/15 bg-sidebar-bg text-sidebar-text shadow-lg transition-[transform,visibility] duration-300 ease-standard",
          "lg:visible lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 lg:rounded-none lg:shadow-none lg:transition-[width]",
          mobileOpen ? "visible translate-x-0" : "invisible -translate-x-full",
          collapsed ? "lg:w-[76px]" : "lg:w-[260px]"
        )}
      >
        <div
          className={cn(
            "flex min-h-20 shrink-0 items-center gap-2 border-b border-sidebar-text-muted/15 px-4 pt-[env(safe-area-inset-top)] sm:px-5",
            collapsed && "lg:justify-center lg:px-2"
          )}
        >
          <div className={cn(collapsed && "lg:hidden")}>
            <CompanyBrandMark nom={nom} logoUrl={logoUrl} size="sm" />
          </div>
          <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
              <p className="truncate text-body font-semibold text-sidebar-text">{nom}</p>
              <p className="text-caption text-sidebar-text-muted">Espace Admin</p>
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={closeMobile}
            aria-label="Fermer le menu"
            className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sidebar-text-muted/10 text-sidebar-text-muted transition-colors hover:bg-green/10 lg:hidden"
          >
            <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Déplier le menu" : "Replier le menu"}
            aria-expanded={!collapsed}
            title={collapsed ? "Déplier le menu" : "Replier le menu"}
            className="focus-ring hidden h-10 w-10 shrink-0 items-center justify-center rounded-input text-sidebar-text-muted hover:bg-[color-mix(in_srgb,var(--color-green)_8%,var(--color-sidebar-bg))] lg:flex"
          >
            <FontAwesomeIcon icon={collapsed ? faChevronRight : faChevronLeft} className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className={cn("px-4 py-4", collapsed && "lg:hidden")}>
          <label className="flex min-h-11 items-center gap-2 rounded-input border border-sidebar-text-muted/20 bg-sidebar-text-muted/5 px-3 focus-within:border-green">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="h-4 w-4 text-sidebar-text-muted" aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Rechercher dans le menu" placeholder="Rechercher une rubrique…" className="min-w-0 flex-1 bg-transparent py-2 text-body-sm text-sidebar-text outline-none placeholder:text-sidebar-text-muted" />
            {search && <button type="button" onClick={() => setSearch("")} aria-label="Effacer la recherche" className="focus-ring flex h-9 w-9 items-center justify-center rounded-input"><FontAwesomeIcon icon={faXmark} className="h-3 w-3" /></button>}
          </label>
        </div>
        <nav aria-label="Rubriques Admin" className="flex min-h-0 flex-1 touch-pan-y flex-col gap-5 overflow-y-auto overscroll-contain p-3 pt-0">
          {(collapsed && !mobileOpen ? GROUPES : groups).map((groupe) => (
            <div key={groupe.label} className="flex flex-col gap-1">
                <p className={cn(
                  "px-3 text-caption font-semibold uppercase tracking-wide text-sidebar-text-muted",
                  collapsed && "lg:hidden"
                )}>
                  {groupe.label}
                </p>
              {groupe.liens.map((lien) => {
                // Lien le plus précis uniquement : sur /admin/bons-livraison/nouveau,
                // « Nouvelle livraison » est actif, pas « Bons de livraison ».
                const correspond = (href: string, exact?: boolean) => exact ? pathname === href : pathname.startsWith(href);
                const actif = correspond(lien.href, lien.exact) && !GROUPES.some((g) =>
                  g.liens.some((autre) => autre.href.length > lien.href.length && autre.href.startsWith(lien.href) && correspond(autre.href, autre.exact))
                );
                return (
                  <Link
                    key={lien.href}
                    href={lien.href}
                    aria-current={actif ? "page" : undefined}
                    aria-label={lien.label}
                    onClick={closeMobile}
                    title={collapsed ? lien.label : undefined}
                    className={cn(
                      "focus-ring flex min-h-12 items-center gap-3 rounded-input px-3 py-2.5 text-body-sm transition-colors",
                      collapsed && "lg:justify-center lg:px-2",
                      actif
                        ? "bg-sidebar-active font-semibold text-sidebar-active-text shadow-sm"
                        : "text-sidebar-text-muted hover:bg-[color-mix(in_srgb,var(--color-green)_8%,var(--color-sidebar-bg))]"
                    )}
                  >
                    <FontAwesomeIcon icon={lien.icon} className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>{lien.label}</span>
                    {actif && <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" className={cn("h-3 w-3 opacity-70", collapsed && "lg:hidden")} />}
                  </Link>
                );
              })}
            </div>
          ))}
          {groups.length === 0 && <p role="status" className={cn("px-3 py-6 text-body-sm text-sidebar-text-muted", collapsed && "lg:hidden")}>Aucune rubrique trouvée.</p>}
        </nav>
        <div className={cn("shrink-0 border-t border-sidebar-text-muted/15 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]", collapsed && "lg:hidden")}>
          <ThemePicker collapsed={collapsed} />
        </div>
      </aside>
    </>
  );
}
