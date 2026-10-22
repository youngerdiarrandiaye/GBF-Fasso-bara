"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/cn";
import { THEMES, THEME_DEFAUT, THEME_EVENT, appliquerTheme, lireTheme, type ThemeId } from "@/lib/theme";

/**
 * Sélecteur de thème (kit CoachSen) : un aperçu cliquable par thème — fond du
 * thème avec sa pastille d'accent. Le choix s'applique tout de suite à toute
 * l'application (Admin, Agent, connexion) et reste mémorisé ; plusieurs
 * sélecteurs peuvent être montés en même temps (sidebar + feuille « Plus »),
 * ils restent synchronisés via l'événement THEME_EVENT.
 */
export function ThemePicker({ collapsed = false, className }: { collapsed?: boolean; className?: string }) {
  const [theme, setTheme] = useState<ThemeId>(THEME_DEFAUT);
  const nom = useId();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(lireTheme());
    const surChangement = (event: Event) => setTheme((event as CustomEvent<ThemeId>).detail);
    window.addEventListener(THEME_EVENT, surChangement);
    return () => window.removeEventListener(THEME_EVENT, surChangement);
  }, []);

  return (
    <fieldset className={cn("flex min-w-0 flex-col items-start gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-3", collapsed && "lg:hidden", className)}>
      <legend className="sr-only">Thème de votre espace</legend>
      <span aria-hidden="true" className="text-body-sm text-muted">Thème</span>
      <div className="flex items-center gap-1 lg:gap-2">
        {THEMES.map((item) => (
          <label key={item.id} title={item.label} className="relative flex h-11 w-11 cursor-pointer items-center justify-center lg:h-8 lg:w-8">
            <input
              type="radio"
              name={nom}
              value={item.id}
              checked={theme === item.id}
              onChange={() => appliquerTheme(item.id)}
              aria-label={item.label}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border border-black/20 transition-shadow",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2",
                theme === item.id ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : "hover:ring-2 hover:ring-accent/40"
              )}
              style={{ backgroundColor: item.fond }}
            >
              <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: item.accent }} />
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
