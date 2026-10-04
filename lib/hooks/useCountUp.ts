"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

function subscribeNever() {
  return () => {};
}

/**
 * Vrai côté client si l'utilisateur a activé `prefers-reduced-motion` ; faux
 * par défaut côté serveur (aucune préférence connue avant hydratation) — même
 * mécanisme `useSyncExternalStore` que `components/ui/Toast.tsx` (`mounted`)
 * pour éviter tout `setState` synchrone en tête d'effet (règle de lint
 * `react-hooks/set-state-in-effect`).
 */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
}

/**
 * Anime une valeur numérique de 0 vers `target` (easing ease-out cubique) via
 * `requestAnimationFrame` — aucune dépendance (le projet n'a pas
 * framer-motion, voir docs/design-system.md §7/§10 D-20). Utilisé par
 * `StatCard` (compteur animé des cartes du dashboard Admin).
 *
 * Respecte `prefers-reduced-motion` : si la préférence système est activée,
 * la valeur cible est appliquée dès la première frame, sans animation.
 */
export function useCountUp(target: number, durationMs = 1200): number {
  const reduitMotion = useReducedMotion();
  const [valeur, setValeur] = useState(0);

  useEffect(() => {
    let frameId: number;

    if (reduitMotion) {
      // Valeur cible appliquée via requestAnimationFrame (pas de setState
      // synchrone en tête d'effet, voir useReducedMotion ci-dessus).
      frameId = requestAnimationFrame(() => setValeur(target));
      return () => cancelAnimationFrame(frameId);
    }

    const debutTs = performance.now();

    function tick(maintenant: number) {
      const progres = Math.min((maintenant - debutTs) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progres, 3); // ease-out cubique
      setValeur(Math.round(target * eased));
      if (progres < 1) {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [target, durationMs, reduitMotion]);

  return valeur;
}
