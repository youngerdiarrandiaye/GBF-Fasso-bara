"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";

/**
 * Détecte une session expirée au moment d'une action.
 *
 * Quand la session a expiré, le proxy (proxy.ts) redirige vers /login même
 * les appels d'actions serveur : le navigateur reçoit alors une page HTML au
 * lieu de la réponse attendue, et Next.js lève « An unexpected response was
 * received from the server ». Sans ce composant, le formulaire reste simplement
 * figé, sans le moindre message. Ici on vérifie la session et, si elle a bien
 * expiré, on dit quoi faire : « Se reconnecter ».
 *
 * Le proxy n'est volontairement pas assoupli : il reste la barrière qui
 * empêche tout appel d'action sans session.
 */
export function SessionWatcher() {
  const { showToast } = useToast();
  const router = useRouter();

  useEffect(() => {
    let enVerification = false;

    async function surRejet(event: PromiseRejectionEvent) {
      const message = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");
      if (!/unexpected response was received from the server/i.test(message) || enVerification) return;

      enVerification = true;
      try {
        const { data } = await createClient().auth.getUser();
        if (data.user) return; // session valide : autre cause, on ne masque pas l'erreur
        event.preventDefault();
        showToast("Votre session a expiré. Reconnectez-vous pour continuer.", "warning", {
          key: "session-expiree",
          persistent: true,
          action: { label: "Se reconnecter", onClick: () => router.push("/login") },
        });
      } catch {
        // Pas de réseau : le bandeau de connexion s'en charge déjà.
      } finally {
        enVerification = false;
      }
    }

    window.addEventListener("unhandledrejection", surRejet);
    return () => window.removeEventListener("unhandledrejection", surRejet);
  }, [showToast, router]);

  return null;
}
