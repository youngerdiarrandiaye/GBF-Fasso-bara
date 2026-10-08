"use client";

import { useState } from "react";
import { NavigationLink as Link } from "@/components/ui/NavigationLink";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faHouse, faFileLines, faUsers, faTruck } from "@fortawesome/free-solid-svg-icons";
import { SignOutButton } from "@/components/agent/SignOutButton";
import { cn } from "@/lib/cn";

/**
 * Navbar Agent — docs/design-system.md §6.10 : fond surface, sticky top,
 * logo + nom agent connecté + déconnexion.
 */
export function NavBar({ nom }: { nom: string }) {
  const pathname = usePathname();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const initiales = nom
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-sticky border-b border-border bg-surface shadow-sm">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-input bg-green-dk text-body-sm font-bold text-white">
            GFB
          </span>
          <span className="hidden text-h3 text-text sm:inline">FASSO BARA</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <Link
            href="/"
            className={cn("focus-ring tap-target flex items-center gap-2 rounded-input px-3 text-body hover:bg-surface-2", pathname === "/" ? "bg-surface-2 font-medium text-green-text" : "text-text")}
          >
            <FontAwesomeIcon icon={faHouse} className="h-4 w-4" aria-hidden="true" />
            Accueil
          </Link>
          <Link
            href="/mes-factures"
            className={cn("focus-ring tap-target flex items-center gap-2 rounded-input px-3 text-body hover:bg-surface-2", pathname.startsWith("/mes-factures") ? "bg-surface-2 font-medium text-green-text" : "text-text")}
          >
            <FontAwesomeIcon icon={faFileLines} className="h-4 w-4" aria-hidden="true" />
            Mes factures
          </Link>
          <Link
            href="/clients"
            className={cn("focus-ring tap-target flex items-center gap-2 rounded-input px-3 text-body hover:bg-surface-2", pathname.startsWith("/clients") ? "bg-surface-2 font-medium text-green-text" : "text-text")}
          >
            <FontAwesomeIcon icon={faUsers} className="h-4 w-4" aria-hidden="true" />
            Clients
          </Link>
          <Link
            href="/bons-livraison"
            className={cn("focus-ring tap-target flex items-center gap-2 rounded-input px-3 text-body hover:bg-surface-2", pathname.startsWith("/bons-livraison") ? "bg-surface-2 font-medium text-green-text" : "text-text")}
          >
            <FontAwesomeIcon icon={faTruck} className="h-4 w-4" aria-hidden="true" />
            Bons de livraison
          </Link>
        </nav>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOuvert((v) => !v)}
            className="focus-ring flex h-11 items-center justify-center gap-2 rounded-input border border-green-dk bg-green-dk px-3 text-body-sm font-semibold text-white shadow-sm transition-[filter,transform] hover:brightness-110 active:scale-95 md:w-11 md:rounded-full md:border-transparent md:bg-surface-2 md:px-0 md:text-text md:shadow-none md:hover:brightness-95"
            aria-haspopup="menu"
            aria-expanded={menuOuvert}
            aria-label="Menu"
          >
            <FontAwesomeIcon icon={faBars} className="h-5 w-5 md:hidden" aria-hidden="true" />
            <span className="md:hidden">Menu</span>
            <span className="hidden md:inline">{initiales || "A"}</span>
          </button>
          {menuOuvert && (
            <div
              role="menu"
              className="absolute right-0 z-dropdown mt-2 w-56 rounded-card border border-border bg-surface p-2 shadow-lg"
            >
              <p className="px-3 py-2 text-body font-medium text-text">{nom}</p>
              <p className="mb-1 px-3 text-body text-muted">Agent</p>
              {[
                { href: "/", label: "Accueil", icon: faHouse },
                { href: "/mes-factures", label: "Mes factures", icon: faFileLines },
                { href: "/clients", label: "Clients", icon: faUsers },
                { href: "/bons-livraison", label: "Bons de livraison", icon: faTruck },
              ].map((lien) => (
                <Link
                  key={lien.href}
                  href={lien.href}
                  onClick={() => setMenuOuvert(false)}
                  className="focus-ring tap-target flex w-full items-center gap-2 rounded-input px-3 text-body text-text hover:bg-surface-2 md:hidden"
                >
                  <FontAwesomeIcon icon={lien.icon} className="h-4 w-4" aria-hidden="true" />
                  {lien.label}
                </Link>
              ))}
              <SignOutButton className="w-full justify-start" />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
