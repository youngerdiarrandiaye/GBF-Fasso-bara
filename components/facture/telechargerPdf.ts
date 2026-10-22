/**
 * Ramène une URL signée Storage sur l'adresse publique de Supabase
 * (NEXT_PUBLIC_SUPABASE_URL), la seule que le navigateur sait joindre.
 *
 * Les Edge Functions fabriquent l'URL signée à partir de leur propre
 * SUPABASE_URL, qui n'est pas forcément l'adresse publique :
 * - en local : `http://127.0.0.1:<autre port>` ;
 * - en auto-hébergé (Coolify) : l'adresse publique mais avec le port interne
 *   de la passerelle (`https://api.…sslip.io:8000`), fermé depuis Internet,
 *   d'où « ERR_CONNECTION_REFUSED » au téléchargement.
 *
 * Seuls le protocole, l'hôte et le port sont remplacés : le chemin et le
 * `token` de signature restent intacts, la signature reste donc valide. Les
 * URLs qui ne pointent pas vers /storage/v1/ ne sont jamais modifiées.
 */
export function normaliserUrlFichierLocal(url: string): string {
  const basePublique = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!basePublique) return url;

  try {
    const cible = new URL(url);
    const base = new URL(basePublique);

    if (cible.pathname.startsWith("/storage/v1/") && cible.origin !== base.origin) {
      cible.protocol = base.protocol;
      cible.hostname = base.hostname;
      cible.port = base.port;
      return cible.toString();
    }
  } catch {
    return url;
  }

  return url;
}

/** Déclenche le téléchargement sans popup, même après un appel réseau async. */
export function declencherTelechargementPdf(pdfUrl: string, nomFacture: string): void {
  const lien = document.createElement("a");
  lien.href = normaliserUrlFichierLocal(pdfUrl);
  lien.download = `${nomFacture}.pdf`;
  lien.rel = "noopener noreferrer";
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
}

/**
 * Message d'erreur d'un appel à une Edge Function PDF : explicite quand la
 * limite d'usage est atteinte (HTTP 429, migration 0022), sinon `defaut`.
 */
export function messageErreurPdf(error: unknown, defaut: string): string {
  const status = (error as { context?: { status?: number } } | null)?.context?.status;
  return status === 429 ? "Trop de PDF générés en une heure. Réessayez dans quelques minutes." : defaut;
}
