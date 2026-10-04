/** Corrige les anciennes URLs signées locales quand Supabase expose un port différent. */
export function normaliserUrlFichierLocal(url: string): string {
  const basePublique = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!basePublique) return url;

  try {
    const cible = new URL(url);
    const base = new URL(basePublique);
    const estSupabaseLocal = cible.hostname === "127.0.0.1" || cible.hostname === "localhost";
    const baseLocale = base.hostname === "127.0.0.1" || base.hostname === "localhost";

    if (estSupabaseLocal && baseLocale && cible.port !== base.port && cible.pathname.startsWith("/storage/v1/")) {
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
