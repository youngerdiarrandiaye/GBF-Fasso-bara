import { useEffect } from "react";
import type { RefObject } from "react";

/** Ferme un panneau ouvert au clic/toucher à l'extérieur ou à la touche Échap. */
export function useDismiss(ref: RefObject<HTMLElement | null>, ouvert: boolean, fermer: () => void) {
  useEffect(() => {
    if (!ouvert) return;
    function surPointeur(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) fermer();
    }
    function surTouche(event: KeyboardEvent) {
      if (event.key === "Escape") fermer();
    }
    document.addEventListener("pointerdown", surPointeur);
    document.addEventListener("keydown", surTouche);
    return () => {
      document.removeEventListener("pointerdown", surPointeur);
      document.removeEventListener("keydown", surTouche);
    };
  }, [ref, ouvert, fermer]);
}
