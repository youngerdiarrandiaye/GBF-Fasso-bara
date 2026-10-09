"use client";

import { useSyncExternalStore } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload, faArrowUpFromBracket } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  abonnerInstallation,
  estEnModeApplication,
  estSafariIos,
  etatInstallation,
  lancerInstallation,
  masquerProposition,
} from "@/lib/pwa-install";

const CLE_MASQUE = "gfb-installation-masquee";

function lireMasque() {
  try {
    return window.localStorage.getItem(CLE_MASQUE) === "1";
  } catch {
    return false;
  }
}

type Mode = "masque" | "installer" | "ios";

function modeActuel(): Mode {
  if (estEnModeApplication() || lireMasque()) return "masque";
  const { evenement, installee, masquee } = etatInstallation();
  if (installee || masquee) return "masque";
  if (evenement) return "installer";
  if (estSafariIos()) return "ios";
  return "masque";
}

/**
 * Proposition d'installation de l'application (PWA, D-29). N'apparaît que si
 * le navigateur sait installer l'app (Chrome/Edge/Android) ou sur Safari iOS
 * (marche à suivre manuelle) ; jamais une fois l'app installée ni après
 * « Plus tard » (mémorisé sur cet appareil).
 */
export function InstallAppPrompt({ className, compact = false }: { className?: string; compact?: boolean }) {
  const mode = useSyncExternalStore(abonnerInstallation, modeActuel, () => "masque" as Mode);

  if (mode === "masque") return null;

  return (
    <section
      aria-label="Installer l'application"
      className={cn("gap-3 rounded-card border border-border bg-surface p-4", compact ? "grid grid-cols-[auto_1fr] items-start" : "flex flex-col sm:flex-row sm:items-center", className)}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input bg-green/10 text-green-text" aria-hidden="true">
        <FontAwesomeIcon icon={mode === "ios" ? faArrowUpFromBracket : faDownload} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-text">Installer GFB-STOCK sur cet appareil</p>
        <p className="text-body-sm text-muted">
          {mode === "ios"
            ? "Touchez Partager dans Safari, puis « Sur l'écran d'accueil »."
            : "Ouvrez-la depuis l'écran d'accueil, en plein écran, sans passer par le navigateur."}
        </p>
      </div>
      <div className={cn("flex gap-2", compact && "col-span-2 justify-end")}>
        {mode === "installer" && (
          <Button type="button" onClick={() => void lancerInstallation()}>
            Installer
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => masquerProposition(CLE_MASQUE)}>
          {mode === "ios" ? "Compris" : "Plus tard"}
        </Button>
      </div>
    </section>
  );
}
