import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Applique le middleware à toutes les routes sauf les assets statiques
     * et images Next.js — évite de rafraîchir la session inutilement sur
     * chaque fichier statique. Les fichiers PWA (manifeste, service worker,
     * page hors connexion) doivent rester accessibles SANS session : sinon un
     * visiteur non connecté reçoit une redirection vers /login à leur place
     * et l'application n'est pas installable depuis l'écran de connexion.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
