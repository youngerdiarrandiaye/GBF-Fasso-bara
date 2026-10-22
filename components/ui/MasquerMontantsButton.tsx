"use client";

import { useSyncExternalStore } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { MONTANTS_EVENT, definirMontantsMasques, montantsMasques } from "@/lib/amounts";
import { cn } from "@/lib/cn";

/** Bouton œil : masque / affiche les montants de l'écran d'un seul geste. */
export function MasquerMontantsButton({ className }: { className?: string }) {
  const masques = useSyncExternalStore(
    (notifier) => {
      window.addEventListener(MONTANTS_EVENT, notifier);
      return () => window.removeEventListener(MONTANTS_EVENT, notifier);
    },
    montantsMasques,
    () => false
  );

  return (
    <button
      type="button"
      onClick={() => definirMontantsMasques(!masques)}
      aria-pressed={masques}
      aria-label={masques ? "Afficher les montants" : "Masquer les montants"}
      title={masques ? "Afficher les montants" : "Masquer les montants"}
      className={cn(
        "focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2",
        masques && "bg-surface-2 text-accent-text",
        className
      )}
    >
      <FontAwesomeIcon icon={masques ? faEyeSlash : faEye} className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
