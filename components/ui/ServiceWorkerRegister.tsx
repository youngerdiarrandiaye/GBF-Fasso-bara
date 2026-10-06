"use client";

import { useEffect } from "react";
import { ecouterInstallation } from "@/lib/pwa-install";

/** Enregistre le service worker PWA après le premier rendu, en production
 *  et en dev (utile pour tester l'installabilité en local), et commence à
 *  écouter la proposition d'installation du navigateur (lib/pwa-install). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    ecouterInstallation();
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installation PWA non critique : un échec (ex. navigateur non
      // compatible) ne doit jamais bloquer l'utilisation de l'app.
    });
  }, []);

  return null;
}
