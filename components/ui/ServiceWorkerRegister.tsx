"use client";

import { useEffect } from "react";

/** Enregistre le service worker PWA après le premier rendu, en production
 *  et en dev (utile pour tester l'installabilité en local). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installation PWA non critique : un échec (ex. navigateur non
      // compatible) ne doit jamais bloquer l'utilisation de l'app.
    });
  }, []);

  return null;
}
