"use client";

import { useEffect, useId, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/cn";
import { THEMES, THEME_DEFAUT, THEME_EVENT, appliquerTheme, lireTheme, type ThemeId } from "@/lib/theme";

const DESCRIPTIONS: Record<ThemeId, string> = {
  comptoir: "Clair, vert. Le thème d'origine.",
  nuit: "Sombre, vert citron. Idéal en intérieur ou le soir.",
  corail: "Clair, rose et orange. Net en plein jour.",
  lagon: "Sombre, anthracite et turquoise. Reposant.",
};

/**
 * Réglage d'apparence (Paramètres) : un aperçu par thème, un clic pour
 * l'appliquer à toute l'application. Le choix est propre à cet appareil
 * (mémorisé dans le navigateur) et n'affecte pas les autres utilisateurs ni
 * les documents envoyés aux clients (factures PDF).
 */
export function AppearanceSettings() {
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
    <fieldset>
      <legend className="sr-only">Thème de l&apos;application</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {THEMES.map((item) => {
          const actif = theme === item.id;
          return (
            <label
              key={item.id}
              className={cn(
                "relative flex min-h-[88px] cursor-pointer items-center gap-4 rounded-card border-2 p-3 transition-colors focus-within:ring-2 focus-within:ring-accent",
                actif ? "border-accent bg-accent/10" : "border-border bg-surface hover:bg-surface-2"
              )}
            >
              <input
                type="radio"
                name={nom}
                value={item.id}
                checked={actif}
                onChange={() => appliquerTheme(item.id)}
                className="sr-only"
              />
              {/* Aperçu : fond du thème, carte et bouton d'accent */}
              <span
                aria-hidden="true"
                className="flex h-16 w-20 shrink-0 flex-col justify-between rounded-input border border-black/15 p-2"
                style={{ backgroundColor: item.fond }}
              >
                <span className="h-2 w-10 rounded-full opacity-60" style={{ backgroundColor: item.accent }} />
                <span className="h-4 w-full rounded-full" style={{ backgroundColor: item.accent }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body font-semibold text-text">{item.label}</span>
                <span className="block text-body-sm text-muted">{DESCRIPTIONS[item.id]}</span>
              </span>
              {actif && (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-on" aria-hidden="true">
                  <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5" />
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
