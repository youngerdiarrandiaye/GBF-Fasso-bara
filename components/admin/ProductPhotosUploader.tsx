"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/**
 * Upload des photos produit (une ou plusieurs) — calqué sur
 * components/admin/LogoUploader.tsx (même mécanique : client Supabase
 * navigateur, jamais service_role). Bucket Storage public `produits-photos`
 * (supabase/migrations/0001_schema_initial.sql section 15) : lecture
 * publique, écriture (insert/update/delete) réservée à l'admin par policy RLS
 * Storage (`WITH CHECK (bucket_id = 'produits-photos' AND is_admin())`) — un
 * agent qui appellerait ce composant se ferait refuser l'upload par
 * Storage/RLS. Convention de chemin : `produits/{timestamp}-{index}.{ext}`,
 * sans contrainte particulière côté policy (pas de préfixe imposé,
 * contrairement au bucket privé `factures`).
 *
 * Reste volontairement simple (pas de recadrage/compression) : upload direct
 * du fichier choisi, URL publique ajoutée à `photos_urls`, avec un bouton de
 * suppression par miniature (retire simplement l'URL du tableau — le fichier
 * reste dans le bucket, cohérent avec l'absence d'opération de nettoyage
 * Storage ailleurs dans le projet, ex. LogoUploader/TamponUploader).
 */
// Miroir des limites du bucket `produits-photos` (migration 0021) : le
// serveur refuse de toute façon le reste ; ce contrôle donne un message clair.
const TYPES_ACCEPTES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const TAILLE_MAX_OCTETS = 5 * 1024 * 1024;

export function ProductPhotosUploader({
  photosUrls,
  onChange,
}: {
  photosUrls: string[];
  onChange: (urls: string[]) => void;
}) {
  const { showToast } = useToast();
  const [enCours, setEnCours] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(fichiers: FileList) {
    setEnCours(true);
    const supabase = createClient();
    const urlsAjoutees: string[] = [];

    for (let i = 0; i < fichiers.length; i++) {
      const fichier = fichiers[i];
      const extension = TYPES_ACCEPTES[fichier.type];
      if (!extension) {
        showToast(`"${fichier.name}" : format refusé. Utilisez une image PNG, JPEG ou WebP.`, "error");
        continue;
      }
      if (fichier.size > TAILLE_MAX_OCTETS) {
        showToast(`"${fichier.name}" dépasse 5 Mo. Réduisez l'image puis réessayez.`, "error");
        continue;
      }
      // Extension déduite du type réel, jamais du nom de fichier fourni.
      const chemin = `produits/photo-${Date.now()}-${i}.${extension}`;

      const { error } = await supabase.storage.from("produits-photos").upload(chemin, fichier, {
        upsert: true,
        contentType: fichier.type,
      });

      if (error) {
        showToast(`Impossible d'importer "${fichier.name}".`, "error");
        continue;
      }

      const { data } = supabase.storage.from("produits-photos").getPublicUrl(chemin);
      urlsAjoutees.push(data.publicUrl);
    }

    setEnCours(false);
    if (urlsAjoutees.length > 0) {
      onChange([...photosUrls, ...urlsAjoutees]);
      showToast(
        urlsAjoutees.length > 1 ? `${urlsAjoutees.length} photos ajoutées.` : "Photo ajoutée.",
        "success"
      );
    }
  }

  function handleRemove(url: string) {
    onChange(photosUrls.filter((u) => u !== url));
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-body font-medium text-text">Photos du produit</label>
      {photosUrls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photosUrls.map((url) => (
            <div key={url} className="relative h-16 w-16 overflow-hidden rounded-input border border-border">
              <Image src={url} alt="" width={64} height={64} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemove(url)}
                className="focus-ring absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-input bg-surface/90 text-caption text-red-text hover:bg-surface"
                aria-label="Retirer cette photo"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        loading={enCours}
        onClick={() => inputRef.current?.click()}
        className="self-start"
      >
        Ajouter des photos
      </Button>
    </div>
  );
}
