/**
 * Redimensionne une image côté navigateur (Canvas API, sans dépendance)
 * avant upload vers Storage — l'Edge Function `generer-facture-pdf` décode
 * et réembarque le logo/tampon dans chaque PDF généré ; une image trop
 * grande (ex. 1536×555px envoyée telle quelle depuis un téléphone) fait
 * dépasser la limite CPU de l'isolate Edge Runtime et fait échouer TOUTE
 * génération de PDF tant que le fichier n'est pas remplacé manuellement
 * (incident déjà rencontré deux fois sur ce projet). Cap à `dimensionMax`
 * sur le plus grand côté, ré-encodée en PNG (transparence préservée, format
 * déjà utilisé pour le logo).
 *
 * En cas d'échec de décodage (format exotique, SVG sans dimensions
 * explicites) : repli silencieux sur le fichier original plutôt que de
 * bloquer l'upload — mieux vaut un logo non optimisé qu'un upload cassé.
 */
export async function redimensionnerImage(fichier: File, dimensionMax = 400): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(fichier);
    const ratio = Math.min(1, dimensionMax / Math.max(bitmap.width, bitmap.height));
    const largeur = Math.max(1, Math.round(bitmap.width * ratio));
    const hauteur = Math.max(1, Math.round(bitmap.height * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = largeur;
    canvas.height = hauteur;
    const ctx = canvas.getContext("2d");
    if (!ctx) return fichier;

    ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob ?? fichier;
  } catch {
    return fichier;
  }
}
