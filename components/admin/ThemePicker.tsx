"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

const STORAGE_KEY = "gfb-admin-background";
// « Comptoir » (clair) est le fond par défaut depuis D-25 ; l'ancien choix
// « Clair » (lavande) enregistré dans un navigateur est repris en Comptoir.
const THEMES = [
  { id: "comptoir", label: "Comptoir", color: "#F4F6F3" },
  { id: "forest", label: "Vert sombre", color: "#0F1712" },
  { id: "night", label: "Bleu nuit", color: "#101827" },
  { id: "sand", label: "Sable", color: "#F5EFE4" },
] as const;
type Theme = (typeof THEMES)[number]["id"];

export function ThemePicker({ collapsed }: { collapsed: boolean }) {
  const [theme, setTheme] = useState<Theme>("comptoir");

  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(STORAGE_KEY); } catch { /* Stockage indisponible. */ }
    const initial = THEMES.find((item) => item.id === saved)?.id ?? "comptoir";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(initial);
    document.documentElement.setAttribute("data-admin-background", initial);
    return () => { document.documentElement.removeAttribute("data-admin-background"); };
  }, []);

  function chooseTheme(next: Theme) {
    setTheme(next);
    document.documentElement.setAttribute("data-admin-background", next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Le choix reste actif pour cette session. */ }
  }

  return (
    <fieldset className={cn("flex min-w-0 items-center justify-between gap-3", collapsed && "lg:hidden")}>
      <legend className="sr-only">Thème de votre espace</legend>
      <span aria-hidden="true" className="text-body-sm text-sidebar-text-muted">Thème</span>
      <div className="flex items-center gap-2">
        {THEMES.map((item) => (
          <label key={item.id} title={item.label} className="relative cursor-pointer">
            <input type="radio" name="admin-background" value={item.id} checked={theme === item.id}
              onChange={() => chooseTheme(item.id)} aria-label={item.label} className="peer sr-only" />
            <span aria-hidden="true"
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border text-caption font-bold transition-shadow",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-green peer-focus-visible:ring-offset-2",
                theme === item.id ? "border-green ring-2 ring-green ring-offset-2 ring-offset-sidebar-bg" : "border-black/20 hover:ring-2 hover:ring-green/40"
              )}
              style={{ backgroundColor: item.color, color: item.id === "comptoir" || item.id === "sand" ? "#182331" : "#FFFFFF" }}>
              {theme === item.id ? "✓" : ""}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
