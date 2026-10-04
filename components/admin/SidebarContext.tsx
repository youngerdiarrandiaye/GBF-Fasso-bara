"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "gfb-admin-sidebar-collapsed";

interface SidebarContextValue {
  /** Sidebar repliée en mode icônes seules (≥ lg), préférence persistée. */
  collapsed: boolean;
  toggleCollapsed: () => void;
  /** Tiroir mobile ouvert/fermé (< lg), volontairement non persisté : on ne
   *  veut jamais rouvrir un tiroir mobile au chargement d'une nouvelle page. */
  mobileOpen: boolean;
  openMobile: () => void;
  closeMobile: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // La préférence locale n'est lisible qu'après l'hydratation. La valeur
    // serveur reste volontairement `false` pour garantir un HTML stable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <SidebarContext.Provider value={{ collapsed, toggleCollapsed, mobileOpen, openMobile, closeMobile }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar doit être utilisé dans un SidebarProvider");
  return ctx;
}
