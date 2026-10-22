"use client";

import { useEffect } from "react";
import { ecouterInstallation } from "@/lib/pwa-install";
import { useToast } from "@/components/ui/Toast";

/** Enregistre le service worker PWA après le premier rendu, en production
 *  et en dev (utile pour tester l'installabilité en local), et commence à
 *  écouter la proposition d'installation du navigateur (lib/pwa-install).
 *
 *  Mise à jour sans friction : sw.js s'active tout seul (skipWaiting +
 *  claim). Quand une nouvelle version prend la main sur une page déjà
 *  contrôlée par l'ancienne, on propose « Actualiser » au lieu de recharger
 *  de force — rien n'est perdu (formulaire en cours de saisie, par exemple). */
export function ServiceWorkerRegister() {
  const { showToast } = useToast();

  useEffect(() => {
    ecouterInstallation();
    if (!("serviceWorker" in navigator)) return;

    // Première installation : pas de contrôleur avant, donc pas de « mise à jour ».
    const avaitUnControleur = Boolean(navigator.serviceWorker.controller);
    const surChangement = () => {
      if (!avaitUnControleur) return;
      showToast("Une nouvelle version de l'application est disponible.", "info", {
        key: "maj-application",
        persistent: true,
        action: { label: "Actualiser", onClick: () => window.location.reload() },
      });
    };
    navigator.serviceWorker.addEventListener("controllerchange", surChangement);

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installation PWA non critique : un échec (ex. navigateur non
      // compatible) ne doit jamais bloquer l'utilisation de l'app.
    });
    return () => navigator.serviceWorker.removeEventListener("controllerchange", surChangement);
  }, [showToast]);

  return null;
}
