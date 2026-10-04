"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

const STORAGE_KEY = "gfb-admin-background";
const THEMES = [
  { id: "forest", label: "Vert sombre", color: "#0F1712" },
  { id: "night", label: "Bleu nuit", color: "#101827" },
  { id: "light", label: "Clair", color: "#F4F5FA" },
  { id: "sand", label: "Sable", color: "#F5EFE4" },
] as const;
type Theme = (typeof THEMES)[number]["id"];

export function ThemePicker({ collapsed }: { collapsed: boolean }) {
  const [theme, setTheme] = useState<Theme>("forest");

  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(STORAGE_KEY); } catch { /* Stockage indisponible. */ }
    const initial = THEMES.find((item) => item.id === saved)?.id ?? "forest";
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
    <fieldset className={cn("min-w-0", collapsed && "lg:hidden")}>
      <legend className="mb-3 text-caption font-semibold uppercase tracking-wide text-sidebar-text-muted">Thème de votre espace</legend>
      <div className="grid grid-cols-4 gap-2">
        {THEMES.map((item) => (
          <label key={item.id} className={cn(
            "relative flex min-h-16 min-w-0 cursor-pointer flex-col items-center gap-1.5 rounded-xl border px-1 py-2 text-center text-caption text-sidebar-text transition-colors hover:border-green",
            theme === item.id ? "border-green bg-green/10 font-semibold" : "border-sidebar-text-muted/20"
          )}>
            <input type="radio" name="admin-background" value={item.id} checked={theme === item.id}
              onChange={() => chooseTheme(item.id)} className="peer sr-only" />
            <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/15 peer-focus-visible:ring-2 peer-focus-visible:ring-green peer-focus-visible:ring-offset-2" style={{ backgroundColor: item.color, color: item.id === "light" || item.id === "sand" ? "#182331" : "#FFFFFF" }}>{theme === item.id ? "✓" : ""}</span>
            {item.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
