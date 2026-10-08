"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars } from "@fortawesome/free-solid-svg-icons";
import { SignOutButton } from "@/components/agent/SignOutButton";
import { AlertsBell } from "@/components/admin/AlertsBell";
import { PaymentAlertsBell } from "@/components/admin/PaymentAlertsBell";
import { useSidebar } from "@/components/admin/SidebarContext";
import { GlobalSearch } from "@/components/admin/GlobalSearch";
import type { AlerteFactureRow, AlerteStockRow } from "@/lib/supabase/database.types";

/**
 * Barre supérieure Admin — sticky, cloche d'alertes temps réel + menu
 * utilisateur. Le bouton burger (< lg) ouvre le tiroir de navigation porté
 * par la Sidebar (voir SidebarContext) : un seul menu de navigation mobile,
 * plus de liste dupliquée ici.
 */
export function Topbar({
  nom,
  alertesInitiales,
  alertesPaiementInitiales,
}: {
  nom: string;
  alertesInitiales: AlerteStockRow[];
  alertesPaiementInitiales: AlerteFactureRow[];
}) {
  const [menuOuvert, setMenuOuvert] = useState(false);
  const { mobileOpen, openMobile } = useSidebar();
  const initiales = nom
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-sticky flex h-16 items-center gap-3 border-b border-border bg-surface px-4 shadow-sm">
      <button
        type="button"
        onClick={openMobile}
        className="focus-ring flex h-11 shrink-0 items-center justify-center gap-2 rounded-input border border-green-dk bg-green-dk px-3 text-body-sm font-semibold text-white shadow-sm transition-[filter,transform] hover:brightness-110 active:scale-95 lg:hidden"
        aria-label="Ouvrir le menu"
        aria-controls="admin-navigation"
        aria-expanded={mobileOpen}
      >
        <FontAwesomeIcon icon={faBars} className="h-5 w-5" aria-hidden="true" />
        <span className="hidden min-[420px]:inline">Menu</span>
      </button>

      <GlobalSearch />

      <AlertsBell alertesInitiales={alertesInitiales} />
      <PaymentAlertsBell alertesInitiales={alertesPaiementInitiales} />

      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOuvert((v) => !v)}
          className="focus-ring flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-body-sm font-semibold text-text"
          aria-haspopup="menu"
          aria-expanded={menuOuvert}
          aria-label="Menu utilisateur"
        >
          {initiales || "A"}
        </button>
        {menuOuvert && (
          <div
            role="menu"
            className="absolute right-0 z-dropdown mt-2 w-56 rounded-card border border-border bg-surface p-2 shadow-lg"
          >
            <p className="px-3 py-2 text-body font-medium text-text">{nom}</p>
            <span className="badge-pastel-green mb-1 ml-3 inline-flex w-fit items-center gap-1 rounded-badge px-2 py-0.5 text-caption">
              Admin
            </span>
            <SignOutButton className="mt-1 w-full justify-start" />
          </div>
        )}
      </div>
    </header>
  );
}
