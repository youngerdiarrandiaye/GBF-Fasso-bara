"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * Galerie photos produit (fiche détaillée) — affiche `produits.photos_urls`
 * (bucket Storage public `produits-photos`, cf. supabase/migrations/
 * 0001_schema_initial.sql section 15). Miniatures cliquables : la photo
 * sélectionnée s'affiche en grand au-dessus de la bande de miniatures.
 * Placeholder neutre si aucune photo, sur le même modèle que la cellule
 * "Produit" sans photo du tableau de lignes de facture (app/(admin)/admin/
 * factures/[id]/page.tsx : `<span className="... bg-surface-2" />`).
 */
export function ProductPhotoGallery({ photosUrls, nom }: { photosUrls: string[]; nom: string }) {
  const [indexSelectionne, setIndexSelectionne] = useState(0);

  if (photosUrls.length === 0) {
    return (
      <div
        className="flex h-24 w-24 shrink-0 items-center justify-center rounded-card border border-dashed border-border bg-surface-2 text-center text-caption text-muted"
        aria-label="Aucune photo disponible pour ce produit"
      >
        Aucune photo
      </div>
    );
  }

  const photoPrincipale = photosUrls[Math.min(indexSelectionne, photosUrls.length - 1)];

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="h-24 w-24 overflow-hidden rounded-card border border-border bg-surface-2">
        <Image
          src={photoPrincipale}
          alt={nom}
          width={96}
          height={96}
          className="h-full w-full object-cover"
        />
      </div>
      {photosUrls.length > 1 && (
        <div className="flex gap-1.5">
          {photosUrls.map((url, index) => (
            <button
              key={url}
              type="button"
              onClick={() => setIndexSelectionne(index)}
              className={`focus-ring h-8 w-8 shrink-0 overflow-hidden rounded-input border ${
                index === indexSelectionne ? "border-green" : "border-border"
              }`}
              aria-label={`Voir la photo ${index + 1} de ${nom}`}
              aria-pressed={index === indexSelectionne}
            >
              <Image src={url} alt="" width={32} height={32} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
