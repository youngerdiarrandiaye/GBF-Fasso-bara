"use client";

import { useSyncExternalStore } from "react";
import { Toaster, toast } from "vyrn";
import type { ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faTriangleExclamation, faXmark, faCircleInfo } from "@fortawesome/free-solid-svg-icons";

export type ToastVariant = "success" | "warning" | "error" | "info";

interface ShowToastOptions {
  /** Empêche l'auto-dismiss même sur une variante qui s'auto-ferme normalement
   *  (usage réservé : "info" tant qu'un état reste actif — ex. perte réseau). */
  persistent?: boolean;
  /** Clé stable : un second appel avec la même clé REMPLACE le toast existant
   *  au lieu d'en empiler un nouveau (ex. "connexion-reseau" : le toast
   *  "Connexion perdue" se transforme en "Connexion rétablie" au lieu de
   *  s'additionner). Correspond directement à l'option `id` de vyrn : "passer
   *  un id déjà existant met à jour ce toast au lieu d'en ajouter un second"
   *  (README vyrn, "Stable ids and deduplication") — sémantique identique. */
  key?: string;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant, options?: ShowToastOptions) => string;
  dismissToast: (idOrKey: string) => void;
}

// Timing par variante (docs/toast-et-coherence-donnees.md §3.4, error ajusté
// à 4000ms sur demande explicite ultérieure — un toast d'erreur qui ne
// disparaît jamais tout seul finit par s'accumuler à chaque nouvel essai).
// Déclaré ici pour info uniquement : la valeur réelle appliquée vit dans
// `toastOptions.types` sur <Toaster>, seul endroit que vyrn consulte.
const DUREE_PAR_DEFAUT_MS: Record<ToastVariant, number> = {
  success: 4000,
  warning: 5000,
  error: 4000,
  info: 4000,
};

const TOAST_FN: Record<ToastVariant, typeof toast.success> = {
  success: toast.success,
  warning: toast.warning,
  error: toast.error,
  info: toast.info,
};

// Fond pastel + rayon/ombre déjà définis par le design system (aucun nouveau
// token) — appliqués via `classNames.toast` (les classes Tailwind générées
// après la feuille de style de vyrn l'emportent à spécificité égale, garantie
// documentée par la librairie). Répété entièrement par variante (pas de
// fusion `classNames` global + par-type garantie par vyrn) plutôt que de
// compter sur une fusion implicite.
const CLASSES_PAR_VARIANTE: Record<ToastVariant, string> = {
  success: "rounded-modal shadow-lg badge-pastel-green",
  warning: "rounded-modal shadow-lg badge-pastel-amber",
  error: "rounded-modal shadow-lg badge-pastel-red",
  info: "rounded-modal shadow-lg badge-pastel-blue",
};

function showToast(message: string, variant: ToastVariant = "info", options?: ShowToastOptions): string {
  const id = TOAST_FN[variant](message, {
    id: options?.key,
    ...(options?.persistent ? { duration: 0 } : {}),
  });
  return String(id);
}

function dismissToast(idOrKey: string) {
  toast.dismiss(idOrKey);
}

/**
 * `useToast` — API inchangée depuis la version maison du composant (même
 * signature `showToast(message, variant, options)` / `dismissToast`), pour
 * que les ~20 points d'appel existants (`AlertsBell`, `PaymentAlertsBell`,
 * `NouvelleFactureForm`, tous les formulaires Admin, etc.) n'aient rien à
 * changer. Le moteur de rendu sous-jacent est désormais `vyrn` — plus besoin
 * de Context React ici, `toast` est un singleton importé directement (comme
 * Sonner, dont vyrn reprend l'API), `useToast()` ne fait qu'exposer les deux
 * mêmes fonctions pour préserver l'API historique.
 */
export function useToast(): ToastContextValue {
  return { showToast, dismissToast };
}

/** Détecte le point de rupture `sm` (640px, tokens du design system) pour
 * faire basculer la position des toasts — voir docs/toast-et-coherence-
 * donnees.md §3.3 / D-Toast-01 : coin supérieur droit partout, SAUF Agent
 * mobile (< 640px) où les toasts restent en bas d'écran, au-dessus de la
 * `BottomTabBar` et du bouton flottant "Nouvelle facture", pour rester au
 * plus près du geste qui vient de les déclencher. */
function useEnDessousDe(largeurPx: number): boolean {
  // `useSyncExternalStore`, pas `useState` + `setState` synchrone dans un
  // `useEffect` (règle de lint `react-hooks/set-state-in-effect`) — même
  // idiome que celui déjà retenu par ce fichier pour son ancien drapeau de
  // montage (voir historique du composant / docs/toast-et-coherence-
  // donnees.md §2.3) : `getServerSnapshot` renvoie `false` (identique au
  // premier rendu serveur ET client, aucune divergence d'hydratation
  // possible), la vraie valeur n'est lue qu'après le commit.
  return useSyncExternalStore(
    (notifier) => {
      const mq = window.matchMedia(`(max-width: ${largeurPx - 1}px)`);
      mq.addEventListener("change", notifier);
      return () => mq.removeEventListener("change", notifier);
    },
    () => window.matchMedia(`(max-width: ${largeurPx - 1}px)`).matches,
    () => false
  );
}

/**
 * `ToastProvider` — monté une fois par espace racine (`app/(admin)/admin/
 * layout.tsx`, `app/(agent)/layout.tsx`). Ne fait plus office de Context
 * Provider (vyrn n'en a pas besoin) : rend simplement les enfants puis
 * `<Toaster />` juste à côté, comme documenté par vyrn pour Next.js App
 * Router. Le nom du composant et sa prop `children` sont conservés
 * uniquement pour ne pas devoir toucher les deux fichiers de layout.
 */
export function ToastProvider({
  children,
  theme = "light",
}: {
  children: ReactNode;
  /** Admin est désormais un thème sombre permanent, indépendant de
   *  `prefers-color-scheme` — passé explicitement par le layout Admin pour
   *  que le "chrome" non redéfini par nos classes (ex. couleur par défaut de
   *  la barre de progression) reste cohérent avec le canevas sombre. Agent
   *  reste clair, valeur par défaut. */
  theme?: "light" | "dark";
}) {
  const mobile = useEnDessousDe(640);

  return (
    <>
      {children}
      <Toaster
        position={mobile ? "bottom-center" : "top-right"}
        offset={mobile ? { bottom: 80, left: 16, right: 16 } : { top: 80, right: 16 }}
        theme={theme}
        gap={8}
        zIndex={60}
        visibleToasts={4}
        closeButton
        closeButtonAriaLabel="Fermer la notification"
        showProgressBar
        icons={{
          success: <FontAwesomeIcon icon={faCheck} aria-hidden="true" className="h-4 w-4" />,
          warning: <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" className="h-4 w-4" />,
          error: <FontAwesomeIcon icon={faXmark} aria-hidden="true" className="h-4 w-4" />,
          info: <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" className="h-4 w-4" />,
        }}
        toastOptions={{
          classNames: { toast: "rounded-modal shadow-lg" },
          types: {
            success: { duration: DUREE_PAR_DEFAUT_MS.success, classNames: { toast: CLASSES_PAR_VARIANTE.success } },
            warning: { duration: DUREE_PAR_DEFAUT_MS.warning, classNames: { toast: CLASSES_PAR_VARIANTE.warning } },
            error: { duration: DUREE_PAR_DEFAUT_MS.error, classNames: { toast: CLASSES_PAR_VARIANTE.error } },
            info: { duration: DUREE_PAR_DEFAUT_MS.info, classNames: { toast: CLASSES_PAR_VARIANTE.info } },
          },
        }}
      />
    </>
  );
}
