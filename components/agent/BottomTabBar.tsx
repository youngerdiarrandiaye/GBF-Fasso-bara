"use client";

import { NavigationLink as Link } from "@/components/ui/NavigationLink";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHouse, faFileLines, faPlus, faUsers, faTruck, type IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/cn";

const TABS: { href: string; label: string; icon: IconDefinition; primary?: boolean }[] = [
  { href: "/", label: "Accueil", icon: faHouse },
  { href: "/mes-factures", label: "Factures", icon: faFileLines },
  { href: "/nouvelle-facture", label: "Créer", icon: faPlus, primary: true },
  { href: "/clients", label: "Clients", icon: faUsers },
  { href: "/bons-livraison", label: "Livraisons", icon: faTruck },
];

/**
 * Barre d'onglets basse fixe — Espace Agent, mobile-first (docs §6.10 :
 * choix tranché par dev-frontend-agent en faveur d'une barre basse, cible
 * tactile ≥ 44px, action "Nouvelle facture" toujours accessible en un tap).
 * Masquée à partir de md (tablette paysage) où la navbar suffit.
 */
export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface shadow-lg md:hidden"
      aria-label="Navigation principale"
    >
      <div className="mx-auto flex h-[calc(4rem+env(safe-area-inset-bottom))] max-w-5xl items-stretch justify-around px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]">
        {TABS.map((tab) => {
          const actif = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={actif ? "page" : undefined}
              aria-label={tab.primary ? "Créer une facture" : tab.label}
              className={cn(
                "focus-ring tap-target flex flex-col items-center justify-center gap-0.5 rounded-input px-2 text-caption",
                tab.primary ? "bg-green font-semibold text-white" : actif ? "text-green-text" : "text-muted"
              )}
            >
              <FontAwesomeIcon icon={tab.icon} className="h-4 w-4" aria-hidden="true" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
