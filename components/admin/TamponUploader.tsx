"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { redimensionnerImage } from "@/lib/redimensionnerImage";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/**
 * Upload du tampon / signature officiel de l'entreprise — calqué sur
 * components/admin/LogoUploader.tsx (même bucket public `logo`,
 * supabase/migrations/0001_schema_initial.sql section 17). Les policies RLS
 * Storage existantes (`logo_lecture_publique`, `logo_ecriture_admin`,
 * `logo_maj_admin`, `logo_suppression_admin`) filtrent uniquement sur
 * `bucket_id = 'logo'`, sans contrainte de chemin : aucune nouvelle policy
 * n'est nécessaire pour ce fichier (cf. supabase/migrations/0007_tampon_
 * entreprise.sql, en-tête). Convention de nommage : `entreprise/tampon-*`,
 * symétrique à `entreprise/logo-*` déjà utilisé par LogoUploader, afin
 * d'éviter toute collision entre les deux usages dans ce bucket partagé.
 *
 * Cette image est affichée par l'Edge Function generer-facture-pdf dans la
 * zone "Cachet et signature" du PDF de facture (cf. tampon_url ajoutée par
 * la migration 0007).
 */
export function TamponUploader({
  tamponUrl,
  onChange,
}: {
  tamponUrl: string;
  onChange: (url: string) => void;
}) {
  const { showToast } = useToast();
  const [enCours, setEnCours] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(fichier: File) {
    setEnCours(true);
    const supabase = createClient();
    const chemin = `entreprise/tampon-${Date.now()}.png`;
    const image = await redimensionnerImage(fichier, 400);

    const { error } = await supabase.storage.from("logo").upload(chemin, image, {
      upsert: true,
      contentType: "image/png",
    });

    if (error) {
      setEnCours(false);
      showToast("Impossible d'importer ce tampon.", "error");
      return;
    }

    const { data } = supabase.storage.from("logo").getPublicUrl(chemin);
    setEnCours(false);
    onChange(data.publicUrl);
    showToast("Tampon mis à jour.", "success");
  }

  return (
    <div className="flex items-center gap-4">
      {tamponUrl ? (
        <Image
          src={tamponUrl}
          alt="Tampon / signature entreprise"
          width={64}
          height={64}
          className="rounded-input border border-border object-contain"
        />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-input border border-dashed border-border text-caption text-muted">
          Tampon
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const fichier = e.target.files?.[0];
          if (fichier) handleFile(fichier);
        }}
      />
      <Button type="button" variant="outline" size="sm" loading={enCours} onClick={() => inputRef.current?.click()}>
        Importer un tampon
      </Button>
    </div>
  );
}
