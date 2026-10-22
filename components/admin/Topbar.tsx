"use client";

import { useState } from "react";
import { SignOutButton } from "@/components/agent/SignOutButton";
import { AlertsBell } from "@/components/admin/AlertsBell";
import { PaymentAlertsBell } from "@/components/admin/PaymentAlertsBell";
import { GlobalSearch } from "@/components/admin/GlobalSearch";
import { MasquerMontantsButton } from "@/components/ui/MasquerMontantsButton";
import type { AlerteFactureRow, AlerteStockRow } from "@/lib/supabase/database.types";

/**
 * Barre supérieure Admin — sticky, cloche d'alertes temps réel + menu
 * utilisateur. Pas de navigation ici : sous lg elle vit dans AdminBottomNav
 * (barre basse + feuille « Plus »), à partir de lg dans la Sidebar.
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
  const initiales = nom
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-sticky flex h-16 min-w-0 items-center gap-1.5 border-b border-border bg-surface px-3 shadow-sm sm:gap-3 sm:px-4">
      <GlobalSearch />
      <MasquerMontantsButton />

      <AlertsBell alertesInitiales={alertesInitiales} />
      <PaymentAlertsBell alertesInitiales={alertesPaiementInitiales} />

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOuvert((v) => !v)}
          className="focus-ring flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-body-sm font-semibold text-text"
          aria-haspopup="menu"
          aria-expanded={menuOuvert}
          aria-label="Menu utilisateur"
        >
          {initiales || "A"}
        </button>
        {menuOuvert && (
          <div
            role="menu"
            className="absolute right-0 z-dropdown mt-2 w-56 max-w-[calc(100vw-1.5rem)] rounded-card border border-border bg-surface p-2 shadow-lg"
          >
            <p className="break-words px-3 py-2 text-body font-medium text-text">{nom}</p>
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
