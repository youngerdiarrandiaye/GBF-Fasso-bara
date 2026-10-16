"use client";

import { NavigationLink as Link } from "@/components/ui/NavigationLink";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/cn";
import { CompanyBrandMark } from "@/components/facture/CompanyBrandMark";
import { ThemePicker } from "@/components/admin/ThemePicker";
import { useSidebar } from "@/components/admin/SidebarContext";
import { GROUPES, estActif } from "@/components/admin/adminNav";

/**
 * Sidebar Admin — seule zone claire de tout l'écran depuis le retour au
 * thème sombre "neon green" (docs/design-system.md §3.7/§6.10, D-14/D-15).
 * Fond `--color-sidebar-bg` (blanc, tokens dédiés `--color-sidebar-*`,
 * jamais `bg-surface` qui est désormais sombre côté Admin). Item de nav actif
 * = fond `--color-sidebar-active-bg` (vert plein) + texte blanc, `rounded-input`
 * (D-16, remplace l'ancien fond `navy` de la refonte "Ultraleads"/D-12).
 *
 * Desktop uniquement (≥ lg) : repliable en rail d'icônes (76px) via le chevron
 * du header. Sous lg, la navigation passe par AdminBottomNav (barre basse +
 * feuille « Plus »), qui lit la même liste (adminNav.ts).
 */
export function Sidebar({ nom, logoUrl }: { nom: string; logoUrl: string | null }) {
  const pathname = usePathname();
  const { collapsed, toggleCollapsed } = useSidebar();
  const [search, setSearch] = useState("");
  const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const groups = GROUPES.map((group) => ({ ...group, liens: group.liens.filter((link) => normalize(link.label).includes(normalize(search.trim()))) })).filter((group) => group.liens.length > 0);

  return (
    <aside
      id="admin-navigation"
      aria-label="Navigation principale"
      className={cn(
        "sticky top-0 z-auto hidden h-[100dvh] shrink-0 flex-col border-r border-sidebar-text-muted/15 bg-sidebar-bg text-sidebar-text transition-[width] lg:flex",
        collapsed ? "w-[76px]" : "w-[260px]"
      )}
    >
      <div
        className={cn(
          "flex min-h-20 shrink-0 items-center gap-2 border-b border-sidebar-text-muted/15 px-5",
          collapsed && "justify-center px-2"
        )}
      >
        <div className={cn(collapsed && "hidden")}>
          <CompanyBrandMark nom={nom} logoUrl={logoUrl} size="sm" />
        </div>
        <div className={cn("min-w-0 flex-1", collapsed && "hidden")}>
          <p className="truncate text-body font-semibold text-sidebar-text">{nom}</p>
          <p className="text-caption text-sidebar-text-muted">Espace Admin</p>
        </div>

        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Déplier le menu" : "Replier le menu"}
          aria-expanded={!collapsed}
          title={collapsed ? "Déplier le menu" : "Replier le menu"}
          className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-input text-sidebar-text-muted hover:bg-[color-mix(in_srgb,var(--color-green)_8%,var(--color-sidebar-bg))]"
        >
          <FontAwesomeIcon icon={collapsed ? faChevronRight : faChevronLeft} className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className={cn("px-4 py-4", collapsed && "hidden")}>
        <label className="flex min-h-11 items-center gap-2 rounded-input border border-sidebar-text-muted/20 bg-sidebar-text-muted/5 px-3 focus-within:border-green">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="h-4 w-4 text-sidebar-text-muted" aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Rechercher dans le menu" placeholder="Rechercher une rubrique…" className="min-w-0 flex-1 bg-transparent py-2 text-body-sm text-sidebar-text outline-none placeholder:text-sidebar-text-muted" />
          {search && <button type="button" onClick={() => setSearch("")} aria-label="Effacer la recherche" className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-input"><FontAwesomeIcon icon={faXmark} className="h-3 w-3" /></button>}
        </label>
      </div>
      <nav aria-label="Rubriques Admin" className="flex min-h-0 flex-1 touch-pan-y flex-col gap-4 overflow-y-auto overscroll-contain p-3 pt-0">
        {(collapsed ? GROUPES : groups).map((groupe, index) => (
          <div key={groupe.label} className={cn("flex flex-col gap-1", index > 0 && "border-t border-sidebar-text-muted/30 pt-4")}>
            <p className={cn("px-3 text-caption font-bold uppercase tracking-wide text-sidebar-text", collapsed && "hidden")}>
              {groupe.label}
            </p>
            {groupe.liens.map((lien) => {
              const actif = estActif(pathname, lien);
              return (
                <Link
                  key={lien.href}
                  href={lien.href}
                  aria-current={actif ? "page" : undefined}
                  aria-label={lien.label}
                  title={collapsed ? lien.label : undefined}
                  className={cn(
                    "focus-ring flex min-h-12 items-center gap-3 rounded-input px-3 py-2.5 text-body-sm transition-colors",
                    collapsed && "justify-center px-2",
                    actif
                      ? "bg-sidebar-active font-semibold text-sidebar-active-text shadow-sm"
                      : "text-sidebar-text-muted hover:bg-[color-mix(in_srgb,var(--color-green)_8%,var(--color-sidebar-bg))]"
                  )}
                >
                  <FontAwesomeIcon icon={lien.icon} className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className={cn("min-w-0 flex-1", collapsed && "hidden")}>{lien.label}</span>
                  {actif && <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" className={cn("h-3 w-3 opacity-70", collapsed && "hidden")} />}
                </Link>
              );
            })}
          </div>
        ))}
        {groups.length === 0 && <p role="status" className={cn("px-3 py-6 text-body-sm text-sidebar-text-muted", collapsed && "hidden")}>Aucune rubrique trouvée.</p>}
      </nav>
      <div className={cn("shrink-0 border-t border-sidebar-text-muted/15 px-4 py-3", collapsed && "hidden")}>
        <ThemePicker collapsed={collapsed} />
      </div>
    </aside>
  );
}
